import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/ui/routes.js';

const FIXTURE = join(process.cwd(), 'test/fixtures/test-server.ts');

let tempDir: string;
let configPath: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'mcp-dealer-ui-'));
  configPath = join(tempDir, 'config.json');
  app = createApp({ configPath });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('UI routes', () => {
  it('GET /api/config returns empty config when file does not exist', async () => {
    const res = await app.request('/api/config');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ servers: {} });
  });

  it('PUT /api/servers/:name writes the server to config', async () => {
    const res = await app.request('/api/servers/x', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'echo', description: 'test echo' }),
    });
    expect(res.status).toBe(200);
    const onDisk = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(onDisk.servers.x.command).toBe('echo');
    expect(onDisk.servers.x.description).toBe('test echo');
  });

  it('PUT /api/servers/:name rejects missing description', async () => {
    const res = await app.request('/api/servers/x', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'echo' }),
    });
    expect(res.status).toBe(400);
  });

  it('DELETE /api/servers/:name removes a server', async () => {
    writeFileSync(configPath, JSON.stringify({ servers: { x: { command: 'a', description: 'd' } } }));
    const res = await app.request('/api/servers/x', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const onDisk = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(onDisk.servers.x).toBeUndefined();
  });

  it('POST /api/servers/:name/introspect updates cached_tools', async () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        servers: { x: { command: 'npx', args: ['tsx', FIXTURE], description: 'd' } },
      })
    );
    const res = await app.request('/api/servers/x/introspect', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached_tools).toHaveLength(1);
    const onDisk = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(onDisk.servers.x.cached_tools).toHaveLength(1);
  });
});
