import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const FIXTURE = join(process.cwd(), 'test/fixtures/test-server.ts');
const BROKER = join(process.cwd(), 'src/broker/index.ts');

let tempDir: string;
let configPath: string;
let client: Client;
let transport: StdioClientTransport;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'mcp-dealer-e2e-'));
  configPath = join(tempDir, 'config.json');
  writeFileSync(
    configPath,
    JSON.stringify({
      servers: {
        x: { command: 'npx', args: ['tsx', FIXTURE], description: 'test' },
      },
    })
  );

  const filteredEnv = Object.fromEntries(
    Object.entries(process.env).filter(([_, v]) => v !== undefined)
  ) as Record<string, string>;

  transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', BROKER],
    env: { ...filteredEnv, MCP_DEALER_CONFIG: configPath },
  });
  client = new Client({ name: 'e2e-test', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);
});

afterEach(async () => {
  await client.close().catch(() => {});
  rmSync(tempDir, { recursive: true, force: true });
});

describe('broker e2e', () => {
  it('lists the 4 broker tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['invoke', 'list_servers', 'list_tools', 'refresh']);
  });

  it('list_servers returns configured server', async () => {
    const res = await client.callTool({ name: 'list_servers', arguments: {} });
    const body = JSON.parse((res.content[0] as { text: string }).text);
    expect(body[0].name).toBe('x');
  });

  it('invoke proxies to the underlying server', async () => {
    const res = await client.callTool({
      name: 'invoke',
      arguments: { server: 'x', tool: 'echo', args: { text: 'hello' } },
    });
    const body = JSON.parse((res.content[0] as { text: string }).text);
    expect(JSON.stringify(body)).toContain('echo:');
  });
});
