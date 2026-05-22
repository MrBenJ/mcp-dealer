import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { Proxy } from '../../src/broker/proxy.js';

const FIXTURE = join(process.cwd(), 'test/fixtures/test-server.ts');

let proxies: Proxy[] = [];

function startProxy(env: Record<string, string> = {}): { proxy: Proxy; child: ChildProcessByStdio<Writable, Readable, Readable> } {
  const child = spawn('npx', ['tsx', FIXTURE], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  }) as ChildProcessByStdio<Writable, Readable, Readable>;
  const proxy = new Proxy(child);
  proxies.push(proxy);
  return { proxy, child };
}

afterEach(async () => {
  for (const p of proxies) await p.close().catch(() => {});
  proxies = [];
});

describe('Proxy', () => {
  it('completes the initialize handshake', async () => {
    const { proxy } = startProxy();
    await proxy.initialize();
    expect(proxy.isReady()).toBe(true);
  });

  it('lists tools after initialize', async () => {
    const { proxy } = startProxy({ TEST_TOOL_NAME: 'shout' });
    await proxy.initialize();
    const tools = await proxy.listTools();
    expect(tools.map((t) => t.name)).toEqual(['shout']);
  });

  it('calls a tool and returns the result', async () => {
    const { proxy } = startProxy();
    await proxy.initialize();
    const result = await proxy.callTool('echo', { text: 'hi' });
    expect(JSON.stringify(result)).toContain('echo:');
  });

  it('returns child_crashed when the child exits during a call', async () => {
    const { proxy } = startProxy({ TEST_BEHAVIOR: 'crash' });
    await proxy.initialize();
    await expect(proxy.callTool('echo', { text: 'hi' })).rejects.toMatchObject({
      code: 'child_crashed',
    });
  });

  it('returns timeout when the child does not reply', async () => {
    const { proxy } = startProxy({ TEST_BEHAVIOR: 'hang' });
    await proxy.initialize();
    await expect(proxy.callTool('echo', { text: 'hi' }, { timeoutMs: 200 })).rejects.toMatchObject({
      code: 'timeout',
    });
  });

  it('correlates concurrent requests by id', async () => {
    const { proxy } = startProxy();
    await proxy.initialize();
    const [a, b] = await Promise.all([
      proxy.callTool('echo', { text: 'a' }),
      proxy.callTool('echo', { text: 'b' }),
    ]);
    expect(JSON.stringify(a)).toContain('"a"');
    expect(JSON.stringify(b)).toContain('"b"');
  });
});
