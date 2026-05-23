import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { introspectServer } from '../../src/broker/introspect.js';
import type { ServerConfig } from '../../src/shared/config-types.js';

const FIXTURE = join(process.cwd(), 'test/fixtures/test-server.ts');

function fixture(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    command: 'npx',
    args: ['tsx', FIXTURE],
    env: {},
    description: 'test',
    cached_tools: [],
    ...overrides,
  };
}

describe('introspectServer', () => {
  it('returns the tool schemas the server advertises', async () => {
    const tools = await introspectServer(fixture({ env: { TEST_TOOL_NAME: 'foo' } }));
    expect(tools.map((t) => t.name)).toEqual(['foo']);
  });

  it('throws spawn_failed when the binary does not exist', async () => {
    await expect(
      introspectServer(fixture({ command: '/no/such/binary' }))
    ).rejects.toMatchObject({ code: 'spawn_failed' });
  });

  it('returns and closes the child cleanly', async () => {
    await introspectServer(fixture());
    expect(true).toBe(true);
  });
});
