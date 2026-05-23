import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Writable, Readable } from 'node:stream';
import { Proxy } from './proxy.js';
import { spawnFailed, unknownServer } from './errors.js';
import type { LoadedConfig, ServerConfig } from '../shared/config-types.js';
import { resolveEnv } from './config-loader.js';

interface WarmSlot {
  proxy: Proxy;
  lastUsedAt: number;
  ttlSeconds: number;
}

interface PendingSpawn { promise: Promise<Proxy> }

interface Options { sweepIntervalMs?: number }

export class ProcessManager {
  private warm = new Map<string, WarmSlot>();
  private spawning = new Map<string, PendingSpawn>();
  private sweepTimer: NodeJS.Timeout;

  constructor(private config: LoadedConfig, opts: Options = {}) {
    const interval = opts.sweepIntervalMs ?? 30000;
    this.sweepTimer = setInterval(() => this.sweep(), interval);
    this.sweepTimer.unref();
  }

  reload(config: LoadedConfig): void {
    this.config = config;
    for (const name of [...this.warm.keys()]) {
      if (!config.servers[name]) {
        const slot = this.warm.get(name);
        if (slot) slot.proxy.close().catch(() => {});
        this.warm.delete(name);
      }
    }
  }

  warmServerNames(): string[] {
    return [...this.warm.keys()];
  }

  async getOrSpawn(name: string): Promise<Proxy> {
    const server = this.config.servers[name];
    if (!server) throw unknownServer(name, Object.keys(this.config.servers));

    const warm = this.warm.get(name);
    if (warm) {
      warm.lastUsedAt = Date.now();
      return warm.proxy;
    }
    const inFlight = this.spawning.get(name);
    if (inFlight) return inFlight.promise;

    const promise = this.spawnAndInit(name, server);
    this.spawning.set(name, { promise });
    try {
      const proxy = await promise;
      this.warm.set(name, {
        proxy,
        lastUsedAt: Date.now(),
        ttlSeconds: server.ttl_seconds ?? this.config.defaults.ttl_seconds,
      });
      return proxy;
    } finally {
      this.spawning.delete(name);
    }
  }

  async shutdown(): Promise<void> {
    clearInterval(this.sweepTimer);
    const closes = [...this.warm.values()].map((slot) => slot.proxy.close().catch(() => {}));
    this.warm.clear();
    await Promise.all(closes);
  }

  private async spawnAndInit(name: string, server: ServerConfig): Promise<Proxy> {
    const env = { ...process.env, ...resolveEnv(server.env ?? {}, process.env) };
    let child: ChildProcessByStdio<Writable, Readable, Readable>;
    try {
      child = spawn(server.command, server.args ?? [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
      }) as ChildProcessByStdio<Writable, Readable, Readable>;
    } catch (err) {
      throw spawnFailed('', undefined, (err as NodeJS.ErrnoException).code);
    }

    const earlyExit = new Promise<never>((_, reject) => {
      const onError = (err: NodeJS.ErrnoException) => {
        reject(spawnFailed('', undefined, err.code ?? 'unknown'));
      };
      const onExit = (code: number | null) => {
        let stderr = '';
        child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
        setTimeout(() => reject(spawnFailed(stderr, code ?? -1)), 10);
      };
      child.once('error', onError);
      child.once('exit', onExit);
    });

    const proxy = new Proxy(child);
    try {
      await Promise.race([proxy.initialize(), earlyExit]);
      return proxy;
    } catch (err) {
      proxy.close().catch(() => {});
      throw err;
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [name, slot] of [...this.warm.entries()]) {
      if (now - slot.lastUsedAt > slot.ttlSeconds * 1000) {
        this.warm.delete(name);
        slot.proxy.close().catch(() => {});
      }
    }
  }
}
