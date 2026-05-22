import * as readline from 'node:readline';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Writable, Readable } from 'node:stream';
import { childCrashed, invokeTimeout, DealerError } from './errors.js';
import type { ToolSchema } from '../shared/config-types.js';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout | null;
}

type StdioChild = ChildProcessByStdio<Writable, Readable, Readable>;

const MCP_PROTOCOL_VERSION = '2024-11-05';

export class Proxy {
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private stderrBuffer = '';
  private ready = false;
  private dead = false;

  constructor(private readonly child: StdioChild) {
    const rl = readline.createInterface({ input: this.child.stdout });
    rl.on('line', (line) => this.handleLine(line));

    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString();
      if (this.stderrBuffer.length > 4096) {
        this.stderrBuffer = this.stderrBuffer.slice(-4096);
      }
    });

    this.child.on('exit', (code) => {
      this.dead = true;
      const err = childCrashed(this.stderrBuffer, code ?? -1);
      for (const [, req] of this.pending) {
        if (req.timer) clearTimeout(req.timer);
        req.reject(err);
      }
      this.pending.clear();
    });
  }

  isReady(): boolean {
    return this.ready && !this.dead;
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'mcp-dealer', version: '0.1.0' },
    });
    this.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    this.ready = true;
  }

  async listTools(): Promise<ToolSchema[]> {
    const result = (await this.request('tools/list', {})) as { tools: ToolSchema[] };
    return result.tools;
  }

  async callTool(name: string, args: Record<string, unknown>, opts: { timeoutMs?: number } = {}): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args }, opts.timeoutMs);
  }

  async close(): Promise<void> {
    if (this.dead) return;
    this.child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.child.kill('SIGKILL');
        resolve();
      }, 5000);
      this.child.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private request(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
    if (this.dead) return Promise.reject(childCrashed(this.stderrBuffer, -1));
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = timeoutMs
        ? setTimeout(() => {
            this.pending.delete(id);
            reject(invokeTimeout(timeoutMs));
          }, timeoutMs)
        : null;
      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  private send(msg: object): void {
    this.child.stdin.write(JSON.stringify(msg) + '\n');
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    let msg: { id?: number; result?: unknown; error?: { message: string; code?: number; data?: unknown } };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id === undefined) return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    if (pending.timer) clearTimeout(pending.timer);
    if (msg.error) {
      pending.reject(new DealerError('child_crashed', msg.error.message, { mcp_error: msg.error }));
      return;
    }
    pending.resolve(msg.result);
  }
}
