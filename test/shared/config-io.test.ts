import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig, writeConfig } from '../../src/shared/config-io.js';

let tempDir: string;
let configPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'mcp-dealer-io-'));
  configPath = join(tempDir, 'config.json');
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('readConfig', () => {
  it('returns parsed JSON when file exists', async () => {
    writeFileSync(configPath, JSON.stringify({ servers: { foo: { command: 'echo', description: 'd' } } }));
    const result = await readConfig(configPath);
    expect(result.servers.foo.command).toBe('echo');
  });

  it('returns empty config when file does not exist', async () => {
    const result = await readConfig(configPath);
    expect(result).toEqual({ servers: {} });
  });

  it('throws on malformed JSON with the file path in the message', async () => {
    writeFileSync(configPath, '{ not json');
    await expect(readConfig(configPath)).rejects.toThrow(configPath);
  });
});

describe('writeConfig', () => {
  it('writes the config atomically', async () => {
    await writeConfig(configPath, { servers: { bar: { command: 'ls', description: 'list' } } });
    const onDisk = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(onDisk.servers.bar.command).toBe('ls');
  });

  it('does not leave a .tmp file behind on success', async () => {
    await writeConfig(configPath, { servers: {} });
    expect(existsSync(configPath + '.tmp')).toBe(false);
  });

  it('creates parent directory if missing', async () => {
    const nested = join(tempDir, 'subdir', 'config.json');
    await writeConfig(nested, { servers: {} });
    expect(existsSync(nested)).toBe(true);
  });
});
