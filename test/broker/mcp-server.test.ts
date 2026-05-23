import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBroker } from '../../src/broker/mcp-server.js';

const FIXTURE = join(process.cwd(), 'test/fixtures/test-server.ts');

let tempDir: string;
let configPath: string;
let broker: Awaited<ReturnType<typeof createBroker>>;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'mcp-dealer-server-'));
  configPath = join(tempDir, 'config.json');
});

afterEach(async () => {
  if (broker) await broker.shutdown();
  rmSync(tempDir, { recursive: true, force: true });
});

function writeConfig(servers: Record<string, unknown>) {
  writeFileSync(configPath, JSON.stringify({ servers }));
}

describe('broker tools', () => {
  it('list_servers returns name + description + tool_count', async () => {
    writeConfig({
      x: {
        command: 'npx',
        args: ['tsx', FIXTURE],
        description: 'test x',
        cached_tools: [{ name: 'echo', inputSchema: {} }],
      },
    });
    broker = await createBroker({ configPath });
    const out = await broker.callTool('list_servers', {});
    expect(out).toEqual([{ name: 'x', description: 'test x', tool_count: 1 }]);
  });

  it('list_tools returns cached schemas when available', async () => {
    writeConfig({
      x: {
        command: 'npx',
        args: ['tsx', FIXTURE],
        description: 't',
        cached_tools: [{ name: 'cached_tool', description: 'c', inputSchema: { type: 'object' } }],
      },
    });
    broker = await createBroker({ configPath });
    const out = await broker.callTool('list_tools', { server: 'x' });
    expect((out as { tools: unknown[] }).tools).toEqual([
      { name: 'cached_tool', description: 'c', inputSchema: { type: 'object' } },
    ]);
  });

  it('list_tools lazily introspects when cache is empty', async () => {
    writeConfig({
      x: {
        command: 'npx',
        args: ['tsx', FIXTURE],
        env: { TEST_TOOL_NAME: 'live' },
        description: 't',
      },
    });
    broker = await createBroker({ configPath });
    const out = (await broker.callTool('list_tools', { server: 'x' })) as { tools: { name: string }[] };
    expect(out.tools[0].name).toBe('live');
  });

  it('invoke forwards to the child and returns the result', async () => {
    writeConfig({
      x: { command: 'npx', args: ['tsx', FIXTURE], description: 't' },
    });
    broker = await createBroker({ configPath });
    const out = await broker.callTool('invoke', { server: 'x', tool: 'echo', args: { text: 'hi' } });
    expect(JSON.stringify(out)).toContain('echo:');
  });

  it('invoke returns unknown_server for missing server', async () => {
    writeConfig({});
    broker = await createBroker({ configPath });
    await expect(
      broker.callTool('invoke', { server: 'gone', tool: 'echo', args: {} })
    ).rejects.toMatchObject({ code: 'unknown_server' });
  });

  it('refresh re-reads the config from disk', async () => {
    writeConfig({});
    broker = await createBroker({ configPath });
    expect(await broker.callTool('list_servers', {})).toEqual([]);
    writeConfig({
      x: { command: 'npx', args: ['tsx', FIXTURE], description: 'added' },
    });
    const refreshed = await broker.callTool('refresh', {});
    expect((refreshed as { reloaded: boolean; server_count: number }).server_count).toBe(1);
    const list = await broker.callTool('list_servers', {});
    expect(list).toEqual([{ name: 'x', description: 'added', tool_count: 0 }]);
  });
});
