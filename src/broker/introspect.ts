import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Writable, Readable } from 'node:stream';
import { Proxy } from './proxy.js';
import { spawnFailed } from './errors.js';
import { resolveEnv } from './config-loader.js';
import type { ServerConfig, ToolSchema } from '../shared/config-types.js';

export async function introspectServer(server: ServerConfig): Promise<ToolSchema[]> {
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

  // Wait a tick so that a synchronous spawn error (e.g. ENOENT) can surface
  // before we start sending requests.
  const earlyError = await new Promise<Error | null>((resolve) => {
    child.once('error', (err) => {
      resolve(spawnFailed('', undefined, (err as NodeJS.ErrnoException).code ?? 'unknown'));
    });
    // If no error fires in the next microtask turn, proceed normally.
    setImmediate(() => resolve(null));
  });

  if (earlyError) throw earlyError;

  const proxy = new Proxy(child);
  try {
    await proxy.initialize();
    const tools = await proxy.listTools();
    return tools;
  } finally {
    await proxy.close().catch(() => {});
  }
}
