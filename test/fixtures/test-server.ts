// A minimal stdio JSON-RPC server that mimics enough of MCP to drive broker tests.
// Behavior is controlled by env vars at spawn time.

import * as readline from 'node:readline';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const behavior = process.env.TEST_BEHAVIOR ?? 'normal';
const toolName = process.env.TEST_TOOL_NAME ?? 'echo';
const stderrText = process.env.TEST_STDERR ?? '';

if (stderrText) process.stderr.write(stderrText);

if (behavior === 'exit_nonzero') process.exit(2);
if (behavior === 'crash_at_start') throw new Error('crashed at start');

function reply(res: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(res) + '\n');
}

function handle(req: JsonRpcRequest): void {
  if (req.method === 'initialize') {
    reply({
      jsonrpc: '2.0',
      id: req.id ?? null,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'test-server', version: '0.0.0' },
      },
    });
    return;
  }
  if (req.method === 'notifications/initialized') return;
  if (req.method === 'tools/list') {
    reply({
      jsonrpc: '2.0',
      id: req.id ?? null,
      result: {
        tools: [
          {
            name: toolName,
            description: `Test tool ${toolName}`,
            inputSchema: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
            },
          },
        ],
      },
    });
    return;
  }
  if (req.method === 'tools/call') {
    const params = req.params as { name: string; arguments?: Record<string, unknown> };
    if (params.name !== toolName) {
      reply({
        jsonrpc: '2.0',
        id: req.id ?? null,
        error: { code: -32602, message: `Unknown tool: ${params.name}` },
      });
      return;
    }
    if (behavior === 'crash') process.exit(1);
    if (behavior === 'hang') return;
    reply({
      jsonrpc: '2.0',
      id: req.id ?? null,
      result: {
        content: [{ type: 'text', text: `echo: ${JSON.stringify(params.arguments ?? {})}` }],
        arguments: params.arguments ?? {},
      },
    });
    return;
  }
  reply({
    jsonrpc: '2.0',
    id: req.id ?? null,
    error: { code: -32601, message: `Method not found: ${req.method}` },
  });
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line: string) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line) as JsonRpcRequest;
    handle(req);
  } catch (err) {
    process.stderr.write(`parse error: ${(err as Error).message}\n`);
  }
});
