import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { RawConfig } from './config-types.js';

const EMPTY_CONFIG: RawConfig = { servers: {} };

export async function readConfig(path: string): Promise<RawConfig> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...EMPTY_CONFIG };
    }
    throw err;
  }
  try {
    return JSON.parse(raw) as RawConfig;
  } catch (err) {
    throw new Error(`Failed to parse config at ${path}: ${(err as Error).message}`);
  }
}

export async function writeConfig(path: string, config: RawConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = path + '.tmp';
  const body = JSON.stringify(config, null, 2);
  try {
    await writeFile(tmp, body, 'utf-8');
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}
