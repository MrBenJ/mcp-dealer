import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { ProcessManager } from '../../src/broker/process-manager.js';
import type { LoadedConfig, ServerConfig } from '../../src/shared/config-types.js';

const FIXTURE = join(process.cwd(), 'test/fixtures/test-server.ts');

function makeConfig(overrides: Partial<ServerConfig> = {}): LoadedConfig {
  return {
    defaults: { ttl_seconds: 1, invoke_timeout_ms: 5000 },
    servers: {
      x: {
        command: 'npx',
        args: ['tsx', FIXTURE],
        env: {},
        description: 'test',
        cached_tools: [],
        ...overrides,
      },
    },
  };
}

let pm: ProcessManager;

afterEach(async () => {
  if (pm) await pm.shutdown();
});

describe('ProcessManager', () => {
  it('spawns a server on first request and keeps it warm', async () => {
    pm = new ProcessManager(makeConfig(), { sweepIntervalMs: 100 });
    const proxy1 = await pm.getOrSpawn('x');
    const proxy2 = await pm.getOrSpawn('x');
    expect(proxy1).toBe(proxy2);
  });

  it('evicts warm servers after TTL', async () => {
    pm = new ProcessManager(makeConfig(), { sweepIntervalMs: 100 });
    const proxy1 = await pm.getOrSpawn('x');
    await new Promise((r) => setTimeout(r, 1500));
    const proxy2 = await pm.getOrSpawn('x');
    expect(proxy1).not.toBe(proxy2);
  });

  it('throws unknown_server when the name is not in config', async () => {
    pm = new ProcessManager(makeConfig());
    await expect(pm.getOrSpawn('nope')).rejects.toMatchObject({ code: 'unknown_server' });
  });

  it('throws spawn_failed when the binary does not exist', async () => {
    const cfg: LoadedConfig = {
      defaults: { ttl_seconds: 1, invoke_timeout_ms: 5000 },
      servers: { bad: { command: '/no/such/binary', args: [], env: {}, description: 'bad', cached_tools: [] } },
    };
    pm = new ProcessManager(cfg);
    await expect(pm.getOrSpawn('bad')).rejects.toMatchObject({ code: 'spawn_failed' });
  });

  it('shutdown terminates all warm children', async () => {
    pm = new ProcessManager(makeConfig());
    await pm.getOrSpawn('x');
    await pm.shutdown();
    expect(pm.warmServerNames()).toEqual([]);
  });

  it('reloads servers from new config', async () => {
    pm = new ProcessManager(makeConfig());
    await pm.getOrSpawn('x');
    const newCfg: LoadedConfig = { defaults: makeConfig().defaults, servers: {} };
    pm.reload(newCfg);
    await expect(pm.getOrSpawn('x')).rejects.toMatchObject({ code: 'unknown_server' });
  });
});
