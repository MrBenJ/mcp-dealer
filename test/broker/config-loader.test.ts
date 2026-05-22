import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, resolveEnv, UnresolvedEnvError } from '../../src/broker/config-loader.js';

let tempDir: string;
let configPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'mcp-dealer-loader-'));
  configPath = join(tempDir, 'config.json');
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('applies built-in defaults when defaults section is missing', async () => {
    writeFileSync(configPath, JSON.stringify({ servers: {} }));
    const cfg = await loadConfig(configPath);
    expect(cfg.defaults.ttl_seconds).toBe(300);
    expect(cfg.defaults.invoke_timeout_ms).toBe(60000);
  });

  it('uses explicit defaults when provided', async () => {
    writeFileSync(
      configPath,
      JSON.stringify({ defaults: { ttl_seconds: 60, invoke_timeout_ms: 5000 }, servers: {} })
    );
    const cfg = await loadConfig(configPath);
    expect(cfg.defaults.ttl_seconds).toBe(60);
    expect(cfg.defaults.invoke_timeout_ms).toBe(5000);
  });

  it('rejects servers missing required fields', async () => {
    writeFileSync(configPath, JSON.stringify({ servers: { broken: { command: 'echo' } } }));
    await expect(loadConfig(configPath)).rejects.toThrow(/description/);
  });
});

describe('resolveEnv', () => {
  it('returns literal values unchanged', () => {
    const out = resolveEnv({ FOO: 'literal' }, { FOO: 'ignored' });
    expect(out.FOO).toBe('literal');
  });

  it('resolves ${VAR} references from the provided environment', () => {
    const out = resolveEnv({ TOKEN: '${MY_TOKEN}' }, { MY_TOKEN: 'secret' });
    expect(out.TOKEN).toBe('secret');
  });

  it('throws UnresolvedEnvError when a reference is missing', () => {
    expect(() => resolveEnv({ TOKEN: '${MISSING}' }, {})).toThrow(UnresolvedEnvError);
  });

  it('resolves embedded references', () => {
    const out = resolveEnv({ URL: 'https://${HOST}/api' }, { HOST: 'example.com' });
    expect(out.URL).toBe('https://example.com/api');
  });
});
