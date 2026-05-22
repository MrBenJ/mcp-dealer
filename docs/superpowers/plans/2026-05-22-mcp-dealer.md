# mcp-dealer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `mcp-dealer`, a broker MCP server (with a localhost web UI) that exposes 4 tools — `list_servers`, `list_tools`, `invoke`, `refresh` — and proxies calls to on-demand stdio MCP child servers with an idle TTL lifecycle.

**Architecture:** Single npm package with two entry points sharing a JSON config file at `~/.mcp-dealer/config.json`. The broker is a stdio MCP server spawned by Claude Code; the UI is a localhost-only Hono HTTP server serving a React/Vite SPA. The UI is the only writer of the config file; the broker only reads.

**Tech Stack:** Node 20+, TypeScript (ESM), `@modelcontextprotocol/sdk`, Hono, Vitest, React + Vite.

**Reference spec:** `docs/superpowers/specs/2026-05-22-mcp-dealer-design.md`. Read it first.

---

## File Structure (locked at planning time)

```
package.json
tsconfig.json
tsconfig.test.json
vitest.config.ts
.gitignore
.npmignore

src/
  shared/
    config-types.ts    # TypeScript types for the config schema
    config-io.ts       # Atomic read/write helpers
  broker/
    errors.ts          # Structured error builders for MCP responses
    config-loader.ts   # Read/parse/validate config, env resolution
    proxy.ts           # JSON-RPC client per child, forwards tools/call
    process-manager.ts # spawn / warm / TTL / teardown state machine
    introspect.ts      # Helper: spawn server, list tools, tear down (shared with UI)
    mcp-server.ts      # The 4 broker tools wired to the MCP SDK
    index.ts           # Broker entry point (stdio)
  ui/
    routes.ts          # Hono routes: config CRUD + introspect endpoints
    server.ts          # Hono server bootstrap (binds to 127.0.0.1)
    frontend/
      index.html
      main.tsx
      App.tsx
      components/
        ServerList.tsx
        ServerForm.tsx
        EnvHelper.tsx
      api.ts           # fetch wrappers for the UI server
      vite.config.ts
  cli/
    index.ts           # Subcommand dispatcher: bare runs broker; "ui" runs UI server

test/
  fixtures/
    test-server.ts     # Minimal controllable stdio MCP server for tests
  shared/
    config-io.test.ts
  broker/
    errors.test.ts
    config-loader.test.ts
    proxy.test.ts
    process-manager.test.ts
    introspect.test.ts
    mcp-server.test.ts
  ui/
    routes.test.ts
  e2e/
    broker.e2e.test.ts
```

---

## Task 1: Project bootstrap

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.test.json`, `vitest.config.ts`, `.gitignore`, `.npmignore`, `src/index.ts` (placeholder), `test/sanity.test.ts`

This task sets up the toolchain so every subsequent task can do TDD. No real product code yet — just enough scaffolding to run a passing test.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "mcp-dealer",
  "version": "0.1.0",
  "description": "A broker MCP server that proxies on-demand to a fleet of MCP servers, plus a localhost web UI for managing them.",
  "type": "module",
  "bin": {
    "mcp-dealer": "./dist/cli/index.js"
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json && npm run build:ui",
    "build:ui": "vite build -c src/ui/frontend/vite.config.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "dev:broker": "tsx src/cli/index.ts",
    "dev:ui": "tsx src/cli/index.ts ui"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0",
    "mime-types": "^2.1.35"
  },
  "devDependencies": {
    "@types/mime-types": "^2.1.4",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  },
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["src/ui/frontend/**", "node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Create `tsconfig.test.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "rootDir": ".", "noEmit": true },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "exclude": ["src/ui/frontend/**", "node_modules", "dist"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules
dist
*.log
.DS_Store
src/ui/frontend/dist
```

- [ ] **Step 6: Create `.npmignore`**

```
src
test
docs
tsconfig*.json
vitest.config.ts
.gitignore
```

- [ ] **Step 7: Create `src/index.ts` placeholder**

```ts
// Entry points live in src/broker/index.ts and src/cli/index.ts.
// This file exists so an early `tsc --noEmit` can compile cleanly.
export {};
```

- [ ] **Step 8: Create `test/sanity.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 9: Install deps**

Run: `npm install`
Expected: dependencies install without errors.

- [ ] **Step 10: Verify typecheck and tests pass**

Run: `npm run typecheck && npm test`
Expected: typecheck succeeds with no output; `1 passed` from vitest.

- [ ] **Step 11: Commit**

```bash
git add package.json tsconfig.json tsconfig.test.json vitest.config.ts .gitignore .npmignore src/index.ts test/sanity.test.ts package-lock.json
git commit -m "chore: project bootstrap"
```

---

## Task 2: Config types

**Files:**
- Create: `src/shared/config-types.ts`

Defines the shape of the config file and the resolved post-load form. Pure types — no logic, no tests.

- [ ] **Step 1: Write the type definitions**

```ts
// src/shared/config-types.ts

export interface ToolSchema {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface ServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  description: string;
  ttl_seconds?: number;
  cached_tools?: ToolSchema[];
}

export interface ConfigDefaults {
  ttl_seconds?: number;
  invoke_timeout_ms?: number;
}

export interface RawConfig {
  defaults?: ConfigDefaults;
  servers: Record<string, ServerConfig>;
}

export interface ResolvedDefaults {
  ttl_seconds: number;
  invoke_timeout_ms: number;
}

export interface LoadedConfig {
  defaults: ResolvedDefaults;
  servers: Record<string, ServerConfig>;
}

export const DEFAULT_TTL_SECONDS = 300;
export const DEFAULT_INVOKE_TIMEOUT_MS = 60000;
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/shared/config-types.ts
git commit -m "feat(shared): add config types"
```

---

## Task 3: Atomic config IO

**Files:**
- Create: `src/shared/config-io.ts`
- Create: `test/shared/config-io.test.ts`

Provides `readConfig(path)` and `writeConfig(path, config)` with atomic-rename semantics so the broker never sees a half-written file.

- [ ] **Step 1: Write the failing test**

```ts
// test/shared/config-io.test.ts
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
```

- [ ] **Step 2: Run the test, verify failure**

Run: `npm test -- test/shared/config-io.test.ts`
Expected: FAIL — module `../../src/shared/config-io.js` not found.

- [ ] **Step 3: Implement `config-io.ts`**

```ts
// src/shared/config-io.ts
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
  await writeFile(tmp, body, 'utf-8');
  try {
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}
```

- [ ] **Step 4: Run the test, verify pass**

Run: `npm test -- test/shared/config-io.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/shared/config-io.ts test/shared/config-io.test.ts
git commit -m "feat(shared): atomic config read/write"
```

---

## Task 4: Config loader with env resolution

**Files:**
- Create: `src/broker/config-loader.ts`
- Create: `test/broker/config-loader.test.ts`

Wraps `readConfig`, applies defaults, validates required fields, and resolves `${VAR}` references in `env` values. Unresolved references throw — `mcp-server.ts` will translate that into the `env_unresolved` MCP error per the spec.

- [ ] **Step 1: Write the failing test**

```ts
// test/broker/config-loader.test.ts
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
```

- [ ] **Step 2: Run the test, verify failure**

Run: `npm test -- test/broker/config-loader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `config-loader.ts`**

```ts
// src/broker/config-loader.ts
import { readConfig } from '../shared/config-io.js';
import {
  DEFAULT_INVOKE_TIMEOUT_MS,
  DEFAULT_TTL_SECONDS,
  type LoadedConfig,
  type RawConfig,
  type ServerConfig,
} from '../shared/config-types.js';

export class UnresolvedEnvError extends Error {
  constructor(public readonly varName: string) {
    super(`Environment variable ${varName} is not set`);
    this.name = 'UnresolvedEnvError';
  }
}

const ENV_REF = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

export function resolveEnv(
  env: Record<string, string>,
  source: NodeJS.ProcessEnv
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    out[key] = value.replace(ENV_REF, (_, name: string) => {
      const resolved = source[name];
      if (resolved === undefined) throw new UnresolvedEnvError(name);
      return resolved;
    });
  }
  return out;
}

function validateServer(name: string, server: Partial<ServerConfig>): ServerConfig {
  if (typeof server.command !== 'string' || server.command.length === 0) {
    throw new Error(`Server "${name}" is missing required field: command`);
  }
  if (typeof server.description !== 'string' || server.description.length === 0) {
    throw new Error(`Server "${name}" is missing required field: description`);
  }
  return {
    command: server.command,
    args: server.args ?? [],
    env: server.env ?? {},
    description: server.description,
    ttl_seconds: server.ttl_seconds,
    cached_tools: server.cached_tools ?? [],
  };
}

export async function loadConfig(path: string): Promise<LoadedConfig> {
  const raw: RawConfig = await readConfig(path);
  const defaults = {
    ttl_seconds: raw.defaults?.ttl_seconds ?? DEFAULT_TTL_SECONDS,
    invoke_timeout_ms: raw.defaults?.invoke_timeout_ms ?? DEFAULT_INVOKE_TIMEOUT_MS,
  };
  const servers: Record<string, ServerConfig> = {};
  for (const [name, server] of Object.entries(raw.servers ?? {})) {
    servers[name] = validateServer(name, server);
  }
  return { defaults, servers };
}
```

- [ ] **Step 4: Run the test, verify pass**

Run: `npm test -- test/broker/config-loader.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/broker/config-loader.ts test/broker/config-loader.test.ts
git commit -m "feat(broker): config loader with env resolution"
```

---

## Task 5: Structured error builders

**Files:**
- Create: `src/broker/errors.ts`
- Create: `test/broker/errors.test.ts`

Pure functions that produce the error payloads documented in the spec's section 6. Used by the MCP server when returning structured failures to the agent.

- [ ] **Step 1: Write the failing test**

```ts
// test/broker/errors.test.ts
import { describe, it, expect } from 'vitest';
import {
  unknownServer,
  unknownTool,
  spawnFailed,
  invokeTimeout,
  childCrashed,
  configError,
  envUnresolved,
  DealerError,
} from '../../src/broker/errors.js';

describe('error builders', () => {
  it('unknownServer includes available_servers', () => {
    const err = unknownServer('ghub', ['github', 'linear']);
    expect(err).toBeInstanceOf(DealerError);
    expect(err.code).toBe('unknown_server');
    expect(err.data.available_servers).toEqual(['github', 'linear']);
  });

  it('unknownTool includes available_tools', () => {
    const err = unknownTool('linear', 'create_thing', ['create_issue', 'list_issues']);
    expect(err.code).toBe('unknown_tool');
    expect(err.data.available_tools).toEqual(['create_issue', 'list_issues']);
  });

  it('spawnFailed truncates stderr to 2KB', () => {
    const big = 'x'.repeat(5000);
    const err = spawnFailed(big, 1);
    expect((err.data.stderr as string).length).toBe(2048);
    expect(err.data.exit_code).toBe(1);
  });

  it('spawnFailed accepts syscall_error without exit code', () => {
    const err = spawnFailed('', undefined, 'ENOENT');
    expect(err.data.syscall_error).toBe('ENOENT');
    expect(err.data.exit_code).toBeUndefined();
  });

  it('invokeTimeout includes timeout_ms and suggestion', () => {
    const err = invokeTimeout(30000);
    expect(err.data.timeout_ms).toBe(30000);
    expect(err.data.suggestion).toBe('refresh');
  });

  it('childCrashed includes stderr and exit_code', () => {
    const err = childCrashed('boom', 137);
    expect(err.code).toBe('child_crashed');
    expect(err.data.stderr).toBe('boom');
    expect(err.data.exit_code).toBe(137);
  });

  it('configError includes path and parse_error', () => {
    const err = configError('/path/to/config.json', 'unexpected token');
    expect(err.data.path).toBe('/path/to/config.json');
    expect(err.data.parse_error).toBe('unexpected token');
  });

  it('envUnresolved includes var_name and server', () => {
    const err = envUnresolved('GITHUB_TOKEN', 'github');
    expect(err.data.var_name).toBe('GITHUB_TOKEN');
    expect(err.data.server).toBe('github');
  });
});
```

- [ ] **Step 2: Run the test, verify failure**

Run: `npm test -- test/broker/errors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `errors.ts`**

```ts
// src/broker/errors.ts

const MAX_STDERR_BYTES = 2048;

export type DealerErrorCode =
  | 'unknown_server'
  | 'unknown_tool'
  | 'spawn_failed'
  | 'timeout'
  | 'child_crashed'
  | 'config_error'
  | 'env_unresolved';

export class DealerError extends Error {
  constructor(
    public readonly code: DealerErrorCode,
    message: string,
    public readonly data: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'DealerError';
  }
}

function truncate(s: string): string {
  return s.length > MAX_STDERR_BYTES ? s.slice(0, MAX_STDERR_BYTES) : s;
}

export function unknownServer(name: string, available: string[]): DealerError {
  return new DealerError('unknown_server', `Unknown server: ${name}`, { available_servers: available });
}

export function unknownTool(server: string, name: string, available: string[]): DealerError {
  return new DealerError(
    'unknown_tool',
    `Unknown tool on server "${server}": ${name}`,
    { available_tools: available }
  );
}

export function spawnFailed(stderr: string, exitCode?: number, syscallError?: string): DealerError {
  const data: Record<string, unknown> = { stderr: truncate(stderr) };
  if (exitCode !== undefined) data.exit_code = exitCode;
  if (syscallError !== undefined) data.syscall_error = syscallError;
  return new DealerError('spawn_failed', 'Failed to spawn server', data);
}

export function invokeTimeout(timeoutMs: number): DealerError {
  return new DealerError('timeout', `Invocation timed out after ${timeoutMs}ms`, {
    timeout_ms: timeoutMs,
    suggestion: 'refresh',
  });
}

export function childCrashed(stderr: string, exitCode: number): DealerError {
  return new DealerError('child_crashed', `Child process exited with code ${exitCode}`, {
    stderr: truncate(stderr),
    exit_code: exitCode,
  });
}

export function configError(path: string, parseError: string): DealerError {
  return new DealerError('config_error', `Config error at ${path}: ${parseError}`, {
    path,
    parse_error: parseError,
  });
}

export function envUnresolved(varName: string, server: string): DealerError {
  return new DealerError('env_unresolved', `Environment variable ${varName} is not set (server: ${server})`, {
    var_name: varName,
    server,
  });
}
```

- [ ] **Step 4: Run the test, verify pass**

Run: `npm test -- test/broker/errors.test.ts`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/broker/errors.ts test/broker/errors.test.ts
git commit -m "feat(broker): structured error builders"
```

---

## Task 6: Controllable test MCP server fixture

**Files:**
- Create: `test/fixtures/test-server.ts`

A minimal stdio MCP server used by later tests. Behavior is controlled by env vars set when spawning it: `TEST_BEHAVIOR=normal|crash|hang|exit_nonzero|crash_at_start`, `TEST_TOOL_NAME=foo`, `TEST_STDERR=<text>`.

It speaks just enough of the MCP wire protocol (initialize, tools/list, tools/call) to be useful for testing the broker.

- [ ] **Step 1: Implement the test server**

```ts
// test/fixtures/test-server.ts
// A minimal stdio JSON-RPC server that mimics enough of MCP to drive broker tests.
// Behavior is controlled by env vars at spawn time.

import * as readline from 'node:readline';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const behavior = process.env.TEST_BEHAVIOR ?? 'normal';
const toolName = process.env.TEST_TOOL_NAME ?? 'echo';
const stderrText = process.env.TEST_STDERR ?? '';

if (stderrText) process.stderr.write(stderrText);

if (behavior === 'exit_nonzero') process.exit(2);
if (behavior === 'crash_at_start') throw new Error('crashed at start');

function reply(res: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(res) + '\n');
}

function handle(req: JsonRpcRequest): void {
  if (req.method === 'initialize') {
    reply({
      jsonrpc: '2.0',
      id: req.id ?? null,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'test-server', version: '0.0.0' },
      },
    });
    return;
  }
  if (req.method === 'notifications/initialized') return;
  if (req.method === 'tools/list') {
    reply({
      jsonrpc: '2.0',
      id: req.id ?? null,
      result: {
        tools: [
          {
            name: toolName,
            description: `Test tool ${toolName}`,
            inputSchema: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
            },
          },
        ],
      },
    });
    return;
  }
  if (req.method === 'tools/call') {
    const params = req.params as { name: string; arguments?: Record<string, unknown> };
    if (params.name !== toolName) {
      reply({
        jsonrpc: '2.0',
        id: req.id ?? null,
        error: { code: -32602, message: `Unknown tool: ${params.name}` },
      });
      return;
    }
    if (behavior === 'crash') process.exit(1);
    if (behavior === 'hang') return;
    reply({
      jsonrpc: '2.0',
      id: req.id ?? null,
      result: {
        content: [{ type: 'text', text: `echo: ${JSON.stringify(params.arguments ?? {})}` }],
      },
    });
    return;
  }
  reply({
    jsonrpc: '2.0',
    id: req.id ?? null,
    error: { code: -32601, message: `Method not found: ${req.method}` },
  });
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line: string) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line) as JsonRpcRequest;
    handle(req);
  } catch (err) {
    process.stderr.write(`parse error: ${(err as Error).message}\n`);
  }
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit -p tsconfig.test.json`
Expected: clean.

- [ ] **Step 3: Smoke-test the fixture manually**

Run:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | npx tsx test/fixtures/test-server.ts
```
Expected: a JSON-RPC response with `protocolVersion: "2024-11-05"` on stdout.

- [ ] **Step 4: Commit**

```bash
git add test/fixtures/test-server.ts
git commit -m "test: add controllable stdio MCP server fixture"
```

---

## Task 7: Proxy (JSON-RPC client per child)

**Files:**
- Create: `src/broker/proxy.ts`
- Create: `test/broker/proxy.test.ts`

`Proxy` wraps a single live child process. It does the MCP initialize handshake, sends `tools/list` and `tools/call` requests, correlates responses by request id, and surfaces structured errors when the child crashes mid-call.

It does NOT manage spawning, TTL, or pooling — that's the process manager's job. Proxy is the per-child wire layer.

- [ ] **Step 1: Write the failing test**

```ts
// test/broker/proxy.test.ts
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
```

- [ ] **Step 2: Run the test, verify failure**

Run: `npm test -- test/broker/proxy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `proxy.ts`**

```ts
// src/broker/proxy.ts
import * as readline from 'node:readline';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Writable, Readable } from 'node:stream';
import { childCrashed, invokeTimeout, DealerError } from './errors.js';
import type { ToolSchema } from '../shared/config-types.js';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout | null;
}

type StdioChild = ChildProcessByStdio<Writable, Readable, Readable>;

const MCP_PROTOCOL_VERSION = '2024-11-05';

export class Proxy {
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private stderrBuffer = '';
  private ready = false;
  private dead = false;

  constructor(private readonly child: StdioChild) {
    const rl = readline.createInterface({ input: this.child.stdout });
    rl.on('line', (line) => this.handleLine(line));

    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString();
      if (this.stderrBuffer.length > 4096) {
        this.stderrBuffer = this.stderrBuffer.slice(-4096);
      }
    });

    this.child.on('exit', (code) => {
      this.dead = true;
      const err = childCrashed(this.stderrBuffer, code ?? -1);
      for (const [, req] of this.pending) {
        if (req.timer) clearTimeout(req.timer);
        req.reject(err);
      }
      this.pending.clear();
    });
  }

  isReady(): boolean {
    return this.ready && !this.dead;
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'mcp-dealer', version: '0.1.0' },
    });
    this.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    this.ready = true;
  }

  async listTools(): Promise<ToolSchema[]> {
    const result = (await this.request('tools/list', {})) as { tools: ToolSchema[] };
    return result.tools;
  }

  async callTool(name: string, args: Record<string, unknown>, opts: { timeoutMs?: number } = {}): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args }, opts.timeoutMs);
  }

  async close(): Promise<void> {
    if (this.dead) return;
    this.child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.child.kill('SIGKILL');
        resolve();
      }, 5000);
      this.child.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private request(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
    if (this.dead) return Promise.reject(childCrashed(this.stderrBuffer, -1));
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = timeoutMs
        ? setTimeout(() => {
            this.pending.delete(id);
            reject(invokeTimeout(timeoutMs));
          }, timeoutMs)
        : null;
      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  private send(msg: object): void {
    this.child.stdin.write(JSON.stringify(msg) + '\n');
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    let msg: { id?: number; result?: unknown; error?: { message: string; code?: number; data?: unknown } };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id === undefined) return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    if (pending.timer) clearTimeout(pending.timer);
    if (msg.error) {
      pending.reject(new DealerError('child_crashed', msg.error.message, { mcp_error: msg.error }));
      return;
    }
    pending.resolve(msg.result);
  }
}
```

- [ ] **Step 4: Run the test, verify pass**

Run: `npm test -- test/broker/proxy.test.ts`
Expected: 6 tests pass. Each test spawns `tsx` so total runtime may be 5-15s.

- [ ] **Step 5: Commit**

```bash
git add src/broker/proxy.ts test/broker/proxy.test.ts
git commit -m "feat(broker): JSON-RPC proxy with timeout and crash handling"
```

---

## Task 8: Process manager (spawn / warm / TTL)

**Files:**
- Create: `src/broker/process-manager.ts`
- Create: `test/broker/process-manager.test.ts`

Owns the lifecycle state machine: `idle → warm → dying`. Exposes `getOrSpawn(serverName)` which returns a ready `Proxy`, and starts a sweeper that evicts warm servers past their TTL.

- [ ] **Step 1: Write the failing test**

```ts
// test/broker/process-manager.test.ts
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
```

- [ ] **Step 2: Run the test, verify failure**

Run: `npm test -- test/broker/process-manager.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `process-manager.ts`**

```ts
// src/broker/process-manager.ts
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Writable, Readable } from 'node:stream';
import { Proxy } from './proxy.js';
import { spawnFailed, unknownServer } from './errors.js';
import type { LoadedConfig, ServerConfig } from '../shared/config-types.js';
import { resolveEnv } from './config-loader.js';

interface WarmSlot {
  proxy: Proxy;
  lastUsedAt: number;
  ttlSeconds: number;
}

interface PendingSpawn { promise: Promise<Proxy> }

interface Options { sweepIntervalMs?: number }

export class ProcessManager {
  private warm = new Map<string, WarmSlot>();
  private spawning = new Map<string, PendingSpawn>();
  private sweepTimer: NodeJS.Timeout;

  constructor(private config: LoadedConfig, opts: Options = {}) {
    const interval = opts.sweepIntervalMs ?? 30000;
    this.sweepTimer = setInterval(() => this.sweep(), interval);
    this.sweepTimer.unref();
  }

  reload(config: LoadedConfig): void {
    this.config = config;
    for (const name of [...this.warm.keys()]) {
      if (!config.servers[name]) {
        const slot = this.warm.get(name);
        if (slot) slot.proxy.close().catch(() => {});
        this.warm.delete(name);
      }
    }
  }

  warmServerNames(): string[] {
    return [...this.warm.keys()];
  }

  async getOrSpawn(name: string): Promise<Proxy> {
    const server = this.config.servers[name];
    if (!server) throw unknownServer(name, Object.keys(this.config.servers));

    const warm = this.warm.get(name);
    if (warm) {
      warm.lastUsedAt = Date.now();
      return warm.proxy;
    }
    const inFlight = this.spawning.get(name);
    if (inFlight) return inFlight.promise;

    const promise = this.spawnAndInit(name, server);
    this.spawning.set(name, { promise });
    try {
      const proxy = await promise;
      this.warm.set(name, {
        proxy,
        lastUsedAt: Date.now(),
        ttlSeconds: server.ttl_seconds ?? this.config.defaults.ttl_seconds,
      });
      return proxy;
    } finally {
      this.spawning.delete(name);
    }
  }

  async shutdown(): Promise<void> {
    clearInterval(this.sweepTimer);
    const closes = [...this.warm.values()].map((slot) => slot.proxy.close().catch(() => {}));
    this.warm.clear();
    await Promise.all(closes);
  }

  private async spawnAndInit(name: string, server: ServerConfig): Promise<Proxy> {
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

    const earlyExit = new Promise<never>((_, reject) => {
      const onError = (err: NodeJS.ErrnoException) => {
        reject(spawnFailed('', undefined, err.code ?? 'unknown'));
      };
      const onExit = (code: number | null) => {
        let stderr = '';
        child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
        setTimeout(() => reject(spawnFailed(stderr, code ?? -1)), 10);
      };
      child.once('error', onError);
      child.once('exit', onExit);
    });

    const proxy = new Proxy(child);
    try {
      await Promise.race([proxy.initialize(), earlyExit]);
      return proxy;
    } catch (err) {
      proxy.close().catch(() => {});
      throw err;
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [name, slot] of [...this.warm.entries()]) {
      if (now - slot.lastUsedAt > slot.ttlSeconds * 1000) {
        this.warm.delete(name);
        slot.proxy.close().catch(() => {});
      }
    }
  }
}
```

- [ ] **Step 4: Run the test, verify pass**

Run: `npm test -- test/broker/process-manager.test.ts`
Expected: 6 tests pass. Spawns multiple `tsx` processes, expect 10-20s runtime.

- [ ] **Step 5: Commit**

```bash
git add src/broker/process-manager.ts test/broker/process-manager.test.ts
git commit -m "feat(broker): process manager with idle TTL"
```

---

## Task 9: Introspect helper (shared with UI)

**Files:**
- Create: `src/broker/introspect.ts`
- Create: `test/broker/introspect.test.ts`

A one-shot helper: spawn a server config, do `initialize`, do `tools/list`, close the child, return the tools. Used by the broker for lazy `list_tools` when `cached_tools` is empty, and by the UI when the user adds a new server.

- [ ] **Step 1: Write the failing test**

```ts
// test/broker/introspect.test.ts
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
```

- [ ] **Step 2: Run the test, verify failure**

Run: `npm test -- test/broker/introspect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `introspect.ts`**

```ts
// src/broker/introspect.ts
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

  let earlyError: Error | null = null;
  child.once('error', (err) => {
    earlyError = spawnFailed('', undefined, (err as NodeJS.ErrnoException).code ?? 'unknown');
  });

  const proxy = new Proxy(child);
  try {
    if (earlyError) throw earlyError;
    await proxy.initialize();
    const tools = await proxy.listTools();
    return tools;
  } finally {
    await proxy.close().catch(() => {});
  }
}
```

- [ ] **Step 4: Run the test, verify pass**

Run: `npm test -- test/broker/introspect.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/broker/introspect.ts test/broker/introspect.test.ts
git commit -m "feat(broker): introspect helper for tool discovery"
```

---

## Task 10: Broker MCP server (the 4 tools)

**Files:**
- Create: `src/broker/mcp-server.ts`
- Create: `src/broker/index.ts`
- Create: `test/broker/mcp-server.test.ts`

This is where it all comes together. `createBroker({ configPath })` returns an object with the 4 tools wired up. `index.ts` is the stdio entry point that connects the SDK Server to a stdio transport.

The test exercises `createBroker` directly without standing up an actual transport — it just invokes the tool handlers via the returned `callTool` and checks the return values.

- [ ] **Step 1: Write the failing test**

```ts
// test/broker/mcp-server.test.ts
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
```

- [ ] **Step 2: Run the test, verify failure**

Run: `npm test -- test/broker/mcp-server.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mcp-server.ts`**

```ts
// src/broker/mcp-server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, UnresolvedEnvError } from './config-loader.js';
import { ProcessManager } from './process-manager.js';
import { introspectServer } from './introspect.js';
import { DealerError, unknownServer, unknownTool, envUnresolved, configError } from './errors.js';
import type { LoadedConfig, ToolSchema } from '../shared/config-types.js';

const BROKER_TOOLS = [
  {
    name: 'list_servers',
    description: 'List all MCP servers available through the dealer. Returns name, description, and tool_count for each.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_tools',
    description: 'List the tools exposed by a specific MCP server. Use list_servers first to discover names.',
    inputSchema: {
      type: 'object',
      properties: { server: { type: 'string', description: 'Server name from list_servers' } },
      required: ['server'],
      additionalProperties: false,
    },
  },
  {
    name: 'invoke',
    description: 'Call a tool on an underlying MCP server. The server is started on demand and reused for subsequent calls within its idle TTL.',
    inputSchema: {
      type: 'object',
      properties: {
        server: { type: 'string' },
        tool: { type: 'string' },
        args: { type: 'object' },
      },
      required: ['server', 'tool', 'args'],
      additionalProperties: false,
    },
  },
  {
    name: 'refresh',
    description: 'Re-read the dealer config from disk to pick up servers added or removed via the UI. Pass drop_schema_cache: true to also clear in-memory tool schemas.',
    inputSchema: {
      type: 'object',
      properties: { drop_schema_cache: { type: 'boolean' } },
      additionalProperties: false,
    },
  },
];

export interface Broker {
  server: Server;
  shutdown(): Promise<void>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

export async function createBroker(opts: { configPath: string }): Promise<Broker> {
  let config: LoadedConfig = await loadConfig(opts.configPath).catch((err) => {
    throw configError(opts.configPath, (err as Error).message);
  });

  const pm = new ProcessManager(config);
  const schemaCache = new Map<string, ToolSchema[]>();

  for (const [name, server] of Object.entries(config.servers)) {
    if (server.cached_tools && server.cached_tools.length > 0) {
      schemaCache.set(name, server.cached_tools);
    }
  }

  async function handleListServers(): Promise<unknown> {
    return Object.entries(config.servers).map(([name, s]) => ({
      name,
      description: s.description,
      tool_count: (schemaCache.get(name) ?? s.cached_tools ?? []).length,
    }));
  }

  async function handleListTools(args: { server: string }): Promise<unknown> {
    const server = config.servers[args.server];
    if (!server) throw unknownServer(args.server, Object.keys(config.servers));

    const cached = schemaCache.get(args.server);
    if (cached) return { tools: cached };

    try {
      const tools = await introspectServer(server);
      schemaCache.set(args.server, tools);
      return { tools };
    } catch (err) {
      if (err instanceof UnresolvedEnvError) throw envUnresolved(err.varName, args.server);
      throw err;
    }
  }

  async function handleInvoke(args: { server: string; tool: string; args: Record<string, unknown> }): Promise<unknown> {
    const server = config.servers[args.server];
    if (!server) throw unknownServer(args.server, Object.keys(config.servers));

    const cached = schemaCache.get(args.server);
    if (cached && !cached.find((t) => t.name === args.tool)) {
      throw unknownTool(args.server, args.tool, cached.map((t) => t.name));
    }

    let proxy;
    try {
      proxy = await pm.getOrSpawn(args.server);
    } catch (err) {
      if (err instanceof UnresolvedEnvError) throw envUnresolved(err.varName, args.server);
      throw err;
    }
    return proxy.callTool(args.tool, args.args, { timeoutMs: config.defaults.invoke_timeout_ms });
  }

  async function handleRefresh(args: { drop_schema_cache?: boolean }): Promise<unknown> {
    config = await loadConfig(opts.configPath).catch((err) => {
      throw configError(opts.configPath, (err as Error).message);
    });
    pm.reload(config);
    if (args.drop_schema_cache) {
      schemaCache.clear();
    } else {
      for (const name of [...schemaCache.keys()]) {
        if (!config.servers[name]) schemaCache.delete(name);
      }
    }
    for (const [name, server] of Object.entries(config.servers)) {
      if (server.cached_tools && server.cached_tools.length > 0 && !schemaCache.has(name)) {
        schemaCache.set(name, server.cached_tools);
      }
    }
    return { reloaded: true, server_count: Object.keys(config.servers).length };
  }

  async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'list_servers': return handleListServers();
      case 'list_tools': return handleListTools(args as { server: string });
      case 'invoke': return handleInvoke(args as { server: string; tool: string; args: Record<string, unknown> });
      case 'refresh': return handleRefresh(args as { drop_schema_cache?: boolean });
      default: throw new Error(`Unknown broker tool: ${name}`);
    }
  }

  const server = new Server(
    { name: 'mcp-dealer', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: BROKER_TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await callTool(request.params.name, request.params.arguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (err) {
      if (err instanceof DealerError) {
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ code: err.code, message: err.message, data: err.data }) }],
        };
      }
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ code: 'internal_error', message: (err as Error).message }) }],
      };
    }
  });

  return {
    server,
    callTool,
    shutdown: async () => { await pm.shutdown(); },
  };
}
```

- [ ] **Step 4: Implement the stdio entry point**

Create `src/broker/index.ts`:

```ts
// src/broker/index.ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBroker } from './mcp-server.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

const configPath = process.env.MCP_DEALER_CONFIG ?? join(homedir(), '.mcp-dealer', 'config.json');

async function main() {
  const broker = await createBroker({ configPath });
  const transport = new StdioServerTransport();
  await broker.server.connect(transport);

  const shutdown = async () => {
    await broker.shutdown();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  process.stderr.write(`mcp-dealer broker failed to start: ${(err as Error).message}\n`);
  process.exit(1);
});
```

- [ ] **Step 5: Run the test, verify pass**

Run: `npm test -- test/broker/mcp-server.test.ts`
Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/broker/mcp-server.ts src/broker/index.ts test/broker/mcp-server.test.ts
git commit -m "feat(broker): implement the 4 broker tools"
```

---

## Task 11: UI HTTP routes

**Files:**
- Create: `src/ui/routes.ts`
- Create: `src/ui/server.ts`
- Create: `test/ui/routes.test.ts`

Hono routes for: `GET /api/config`, `PUT /api/servers/:name`, `DELETE /api/servers/:name`, `POST /api/servers/:name/introspect`. All atomic-write the config file via `writeConfig`.

- [ ] **Step 1: Write the failing test**

```ts
// test/ui/routes.test.ts
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
```

- [ ] **Step 2: Run the test, verify failure**

Run: `npm test -- test/ui/routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `routes.ts`**

```ts
// src/ui/routes.ts
import { Hono } from 'hono';
import { readConfig, writeConfig } from '../shared/config-io.js';
import { introspectServer } from '../broker/introspect.js';
import type { ServerConfig } from '../shared/config-types.js';

interface Options { configPath: string }

export function createApp(opts: Options) {
  const app = new Hono();

  app.get('/api/config', async (c) => {
    const config = await readConfig(opts.configPath);
    return c.json(config);
  });

  app.put('/api/servers/:name', async (c) => {
    const name = c.req.param('name');
    const body = (await c.req.json()) as Partial<ServerConfig>;
    if (typeof body.command !== 'string' || !body.command) {
      return c.json({ error: 'command is required' }, 400);
    }
    if (typeof body.description !== 'string' || !body.description) {
      return c.json({ error: 'description is required' }, 400);
    }
    const config = await readConfig(opts.configPath);
    config.servers[name] = {
      command: body.command,
      args: body.args ?? [],
      env: body.env ?? {},
      description: body.description,
      ttl_seconds: body.ttl_seconds,
      cached_tools: body.cached_tools ?? config.servers[name]?.cached_tools ?? [],
    };
    await writeConfig(opts.configPath, config);
    return c.json({ ok: true });
  });

  app.delete('/api/servers/:name', async (c) => {
    const name = c.req.param('name');
    const config = await readConfig(opts.configPath);
    delete config.servers[name];
    await writeConfig(opts.configPath, config);
    return c.json({ ok: true });
  });

  app.post('/api/servers/:name/introspect', async (c) => {
    const name = c.req.param('name');
    const config = await readConfig(opts.configPath);
    const server = config.servers[name];
    if (!server) return c.json({ error: 'unknown server' }, 404);

    try {
      const tools = await introspectServer(server);
      config.servers[name] = { ...server, cached_tools: tools };
      await writeConfig(opts.configPath, config);
      return c.json({ cached_tools: tools });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  return app;
}
```

- [ ] **Step 4: Implement `server.ts` (binds to localhost)**

```ts
// src/ui/server.ts
import { serve } from '@hono/node-server';
import { createApp } from './routes.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { contentType } from 'mime-types';

interface StartOptions { configPath: string; port: number }

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = join(__dirname, 'frontend', 'dist');

function attachStatic(app: ReturnType<typeof createApp>): void {
  if (!existsSync(FRONTEND_DIST)) return;
  app.get('*', (c) => {
    const url = new URL(c.req.url);
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    if (pathname.startsWith('/api')) return c.notFound();
    const filePath = join(FRONTEND_DIST, pathname);
    if (!existsSync(filePath)) {
      const indexPath = join(FRONTEND_DIST, 'index.html');
      if (existsSync(indexPath)) {
        return c.body(readFileSync(indexPath), 200, { 'content-type': 'text/html' });
      }
      return c.notFound();
    }
    const body = readFileSync(filePath);
    const ct = contentType(filePath) || 'application/octet-stream';
    return c.body(body, 200, { 'content-type': ct.toString() });
  });
}

export function startUi(opts: StartOptions): void {
  const app = createApp({ configPath: opts.configPath });
  attachStatic(app);
  serve({ fetch: app.fetch, port: opts.port, hostname: '127.0.0.1' });
  process.stderr.write(`mcp-dealer UI listening on http://127.0.0.1:${opts.port}\n`);
}
```

- [ ] **Step 5: Run the test, verify pass**

Run: `npm test -- test/ui/routes.test.ts`
Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/routes.ts src/ui/server.ts test/ui/routes.test.ts
git commit -m "feat(ui): config CRUD and introspect routes"
```

---

## Task 12: UI frontend (React + Vite)

**Files:**
- Create: `src/ui/frontend/index.html`
- Create: `src/ui/frontend/main.tsx`
- Create: `src/ui/frontend/App.tsx`
- Create: `src/ui/frontend/api.ts`
- Create: `src/ui/frontend/components/ServerList.tsx`
- Create: `src/ui/frontend/components/ServerForm.tsx`
- Create: `src/ui/frontend/components/EnvHelper.tsx`
- Create: `src/ui/frontend/vite.config.ts`
- Create: `src/ui/frontend/tsconfig.json`

A small SPA. No router, no state management library — just `useState` and `fetch`. The frontend is built by Vite into `src/ui/frontend/dist/` and served by `server.ts` at runtime.

This task doesn't have unit tests for the React components — they're thin glue over the backend, which is already tested. The E2E task verifies behavior.

- [ ] **Step 1: Create `src/ui/frontend/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:7411' } },
});
```

- [ ] **Step 2: Create `src/ui/frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

- [ ] **Step 3: Create `src/ui/frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>mcp-dealer</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #222; }
    h1 { border-bottom: 1px solid #ddd; padding-bottom: 0.5rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #eee; }
    button { padding: 0.4rem 0.8rem; cursor: pointer; }
    button.danger { color: white; background: #c0392b; border: none; border-radius: 4px; }
    button.primary { color: white; background: #2980b9; border: none; border-radius: 4px; }
    input, textarea { width: 100%; padding: 0.4rem; border: 1px solid #ccc; border-radius: 4px; font-family: monospace; }
    label { display: block; margin: 0.8rem 0 0.2rem; font-weight: 600; }
    .error { color: #c0392b; }
    .warn { background: #fff5e6; padding: 0.5rem; border: 1px solid #f39c12; border-radius: 4px; margin: 1rem 0; }
    pre { background: #f4f4f4; padding: 0.5rem; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

- [ ] **Step 4: Create `src/ui/frontend/api.ts`**

```ts
import type { RawConfig, ServerConfig, ToolSchema } from '../../shared/config-types.js';

export async function getConfig(): Promise<RawConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`getConfig failed: ${res.status}`);
  return res.json();
}

export async function putServer(name: string, server: Partial<ServerConfig>): Promise<void> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(server),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `putServer failed: ${res.status}`);
  }
}

export async function deleteServer(name: string): Promise<void> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteServer failed: ${res.status}`);
}

export async function introspectServer(name: string): Promise<ToolSchema[]> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}/introspect`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `introspect failed: ${res.status}`);
  }
  const data = await res.json();
  return data.cached_tools;
}
```

- [ ] **Step 5: Create `src/ui/frontend/components/ServerList.tsx`**

```tsx
import { useState } from 'react';
import type { RawConfig, ServerConfig } from '../../../shared/config-types.js';
import { deleteServer, introspectServer } from '../api.js';

interface Props {
  config: RawConfig;
  onRefresh: () => void;
  onEdit: (name: string, server: ServerConfig) => void;
}

export function ServerList({ config, onRefresh, onEdit }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(name: string) {
    if (!confirm(`Delete server "${name}"?`)) return;
    setBusy(name);
    setError(null);
    try { await deleteServer(name); onRefresh(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(null); }
  }

  async function handleIntrospect(name: string) {
    setBusy(name);
    setError(null);
    try { await introspectServer(name); onRefresh(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(null); }
  }

  const entries = Object.entries(config.servers);
  if (entries.length === 0) return <p>No servers configured. Add one below.</p>;

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr><th>Name</th><th>Description</th><th>Tools</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {entries.map(([name, server]) => (
            <tr key={name}>
              <td><code>{name}</code></td>
              <td>{server.description}</td>
              <td>{server.cached_tools?.length ?? 0}</td>
              <td>
                <button onClick={() => onEdit(name, server)} disabled={busy === name}>Edit</button>{' '}
                <button onClick={() => handleIntrospect(name)} disabled={busy === name}>Re-introspect</button>{' '}
                <button className="danger" onClick={() => handleDelete(name)} disabled={busy === name}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/ui/frontend/components/ServerForm.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { ServerConfig } from '../../../shared/config-types.js';
import { putServer, introspectServer } from '../api.js';

interface Props {
  initial: { name: string; server: ServerConfig } | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function ServerForm({ initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [argsText, setArgsText] = useState('');
  const [description, setDescription] = useState('');
  const [envText, setEnvText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setCommand(initial.server.command);
      setArgsText((initial.server.args ?? []).join('\n'));
      setDescription(initial.server.description);
      setEnvText(Object.entries(initial.server.env ?? {}).map(([k, v]) => `${k}=${v}`).join('\n'));
    } else {
      setName(''); setCommand(''); setArgsText(''); setDescription(''); setEnvText('');
    }
  }, [initial]);

  function parseEnv(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1);
    }
    return out;
  }

  async function handleSubmit(introspectAfter: boolean) {
    setBusy(true);
    setError(null);
    try {
      await putServer(name, {
        command,
        args: argsText.split('\n').map((s) => s.trim()).filter(Boolean),
        description,
        env: parseEnv(envText),
      });
      if (introspectAfter) {
        try { await introspectServer(name); }
        catch (err) {
          setError(`Server saved but introspection failed: ${(err as Error).message}`);
          setBusy(false);
          return;
        }
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>{initial ? `Edit ${initial.name}` : 'Add server'}</h2>
      {error && <p className="error">{error}</p>}
      <label>Name (unique identifier)</label>
      <input value={name} onChange={(e) => setName(e.target.value)} disabled={!!initial} placeholder="github" />

      <label>Command</label>
      <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" />

      <label>Args (one per line)</label>
      <textarea rows={4} value={argsText} onChange={(e) => setArgsText(e.target.value)} placeholder={'-y\n@modelcontextprotocol/server-github'} />

      <label>Description (shown to the agent in list_servers)</label>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="GitHub repos, issues, PRs" />

      <label>Environment variables (KEY=value, one per line; use ${'{'}VAR{'}'} to reference process env)</label>
      <textarea rows={4} value={envText} onChange={(e) => setEnvText(e.target.value)} placeholder={'GITHUB_TOKEN=${GITHUB_TOKEN}'} />

      <div style={{ marginTop: '1rem' }}>
        <button className="primary" onClick={() => handleSubmit(true)} disabled={busy}>Save and introspect</button>{' '}
        <button onClick={() => handleSubmit(false)} disabled={busy}>Save only</button>{' '}
        <button onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create `src/ui/frontend/components/EnvHelper.tsx`**

```tsx
import type { RawConfig } from '../../../shared/config-types.js';

interface Props { config: RawConfig }

const ENV_REF = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

export function EnvHelper({ config }: Props) {
  const referenced = new Set<string>();
  for (const server of Object.values(config.servers)) {
    for (const value of Object.values(server.env ?? {})) {
      let m: RegExpExecArray | null;
      while ((m = ENV_REF.exec(value)) !== null) referenced.add(m[1]);
    }
  }
  if (referenced.size === 0) return null;
  return (
    <div className="warn">
      <strong>Env var references in config:</strong>
      <ul>
        {[...referenced].map((v) => (
          <li key={v}>
            <code>{v}</code> — make sure it&apos;s set in your shell before launching Claude Code.
            Example: <code>export {v}=...</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 8: Create `src/ui/frontend/App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { RawConfig, ServerConfig } from '../../shared/config-types.js';
import { getConfig } from './api.js';
import { ServerList } from './components/ServerList.js';
import { ServerForm } from './components/ServerForm.js';
import { EnvHelper } from './components/EnvHelper.js';

export function App() {
  const [config, setConfig] = useState<RawConfig | null>(null);
  const [editing, setEditing] = useState<{ name: string; server: ServerConfig } | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try { setConfig(await getConfig()); }
    catch (err) { setError((err as Error).message); }
  }

  useEffect(() => { refresh(); }, []);

  if (error) return <p className="error">{error}</p>;
  if (!config) return <p>Loading…</p>;

  return (
    <div>
      <h1>mcp-dealer</h1>
      <EnvHelper config={config} />

      {!editing && !adding && (
        <>
          <ServerList
            config={config}
            onRefresh={refresh}
            onEdit={(name, server) => setEditing({ name, server })}
          />
          <button className="primary" style={{ marginTop: '1rem' }} onClick={() => setAdding(true)}>
            Add server
          </button>
        </>
      )}

      {(editing || adding) && (
        <ServerForm
          initial={editing}
          onSaved={() => { setEditing(null); setAdding(false); refresh(); }}
          onCancel={() => { setEditing(null); setAdding(false); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 9: Create `src/ui/frontend/main.tsx`**

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
```

- [ ] **Step 10: Build the frontend**

Run: `npm run build:ui`
Expected: emits `src/ui/frontend/dist/index.html` and asset files.

- [ ] **Step 11: Commit**

```bash
git add src/ui/frontend/
git commit -m "feat(ui): React frontend for managing servers"
```

---

## Task 13: CLI dispatcher

**Files:**
- Create: `src/cli/index.ts`

The single binary entry point. `mcp-dealer` (no args) runs the broker. `mcp-dealer ui [--port N]` runs the UI server.

- [ ] **Step 1: Implement the dispatcher**

```ts
// src/cli/index.ts
#!/usr/bin/env node
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const configPath = process.env.MCP_DEALER_CONFIG ?? join(homedir(), '.mcp-dealer', 'config.json');

async function main() {
  if (args[0] === 'ui') {
    const portArgIdx = args.indexOf('--port');
    const portFromArg = portArgIdx >= 0 ? Number(args[portArgIdx + 1]) : undefined;
    const port = portFromArg ?? Number(process.env.MCP_DEALER_UI_PORT) ?? 7411;
    const { startUi } = await import('../ui/server.js');
    startUi({ configPath, port });
    return;
  }
  if (args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(
      `mcp-dealer\n\nUsage:\n  mcp-dealer            run the broker (stdio MCP server)\n  mcp-dealer ui [--port N]   run the management web UI\n\nEnv:\n  MCP_DEALER_CONFIG     override config path (default ~/.mcp-dealer/config.json)\n  MCP_DEALER_UI_PORT    default UI port (default 7411)\n`
    );
    return;
  }
  await import('../broker/index.js');
}

main().catch((err) => {
  process.stderr.write(`mcp-dealer: ${(err as Error).message}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Verify the build emits an executable**

Run: `npm run build`
Expected: `dist/cli/index.js` exists.

- [ ] **Step 3: Smoke-test the CLI**

Run: `node dist/cli/index.js --help`
Expected: usage text on stdout.

- [ ] **Step 4: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat(cli): subcommand dispatcher"
```

---

## Task 14: End-to-end broker integration test

**Files:**
- Create: `test/e2e/broker.e2e.test.ts`

Spawn the broker as a child process, talk to it over stdio using `@modelcontextprotocol/sdk`'s client, exercise the broker tools with the test fixture as the underlying server. This catches regressions in the wire protocol.

- [ ] **Step 1: Write the failing test**

```ts
// test/e2e/broker.e2e.test.ts
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
  transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', BROKER],
    env: { ...process.env, MCP_DEALER_CONFIG: configPath },
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
```

- [ ] **Step 2: Run the test, verify pass**

Run: `npm test -- test/e2e/broker.e2e.test.ts`
Expected: 3 tests pass. This test boots the broker as a real child process, so expect 10-20s.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests pass across all files.

- [ ] **Step 4: Commit**

```bash
git add test/e2e/broker.e2e.test.ts
git commit -m "test(e2e): broker end-to-end via stdio MCP client"
```

---

## Task 15: README and final polish

**Files:**
- Create: `README.md`

User-facing docs for installing, configuring, and using `mcp-dealer`.

- [ ] **Step 1: Write the README**

````markdown
# mcp-dealer

A broker MCP server that proxies to a fleet of on-demand MCP servers. Instead of paying the token cost of loading every MCP server at session start, your agent gets a four-tool surface — `list_servers`, `list_tools`, `invoke`, `refresh` — and the broker spins up each underlying server only when it's actually used.

## Install

```bash
npm install -g mcp-dealer
```

Or use without installing: `npx mcp-dealer`.

## Configure

Run the web UI to add your first server:

```bash
mcp-dealer ui
```

Open <http://127.0.0.1:7411> and click "Add server." The UI writes to `~/.mcp-dealer/config.json` (override with `MCP_DEALER_CONFIG`).

## Wire into your MCP client

Add to your client's MCP config (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "dealer": {
      "command": "npx",
      "args": ["-y", "mcp-dealer"]
    }
  }
}
```

Your agent now sees four tools: `dealer:list_servers`, `dealer:list_tools`, `dealer:invoke`, `dealer:refresh`. Servers you add via the UI become available without restarting the agent — just have it call `refresh`.

## Config file format

```json
{
  "defaults": {
    "ttl_seconds": 300,
    "invoke_timeout_ms": 60000
  },
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" },
      "description": "GitHub repos, issues, PRs"
    }
  }
}
```

`env` values can be literal strings or `${VAR}` references resolved at spawn time from `process.env`.

## Lifecycle

- Each underlying server starts on first `invoke`.
- It stays warm for `ttl_seconds` (default 300) of idle time.
- After idle TTL it gets SIGTERM, then SIGKILL after 5s if it doesn't exit.
- The broker shutdown (when the agent exits) terminates all warm children.

## Development

```bash
npm install
npm test
npm run build
```

## License

MIT
````

- [ ] **Step 2: Final test pass**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README"
```

---

## Self-review against the spec

Spec section coverage check:

- **§1 Purpose & non-goals** — Captured in Task 15 README; non-goals (HTTP/SSE, keychain, etc.) are explicit non-tasks.
- **§2 High-level shape** — Tasks 10 (broker), 11–12 (UI), 3 (config file).
- **§3 The 4 broker tools** — Task 10.
- **§3 Schema cache layers + lazy introspect** — Task 9 (introspect) + Task 10 (mcp-server's `schemaCache` map + `handleListTools` flow).
- **§4 Process lifecycle (idle/warm/dying, TTL sweeper, signal handling)** — Task 8.
- **§4 Per-call timeout** — Task 7 (Proxy timeoutMs), Task 10 (wiring `config.defaults.invoke_timeout_ms`).
- **§5 Config file shape, env resolution, atomic writes** — Tasks 2, 3, 4, 11.
- **§6 Error handling** — Task 5 (builders), Task 10 (translation to MCP error responses).
- **§7 UI (pages, Hono, localhost-only)** — Tasks 11 (routes + bind to 127.0.0.1) and 12 (pages).
- **§8 Module layout** — Mirrored in the File Structure section and across tasks.
- **§9 Testing strategy (unit/integration/E2E, no mocked processes)** — Tasks 3, 4, 5, 7, 8, 9, 10, 11, 14.
- **§10 Distribution (npm bin, npx)** — Tasks 1 (`bin` in package.json) and 13 (CLI dispatcher).
- **§11 Decisions (Hono, latest SDK, no live observability)** — Honored throughout.

No spec section is missing a task. No placeholders found. Names used consistently across tasks (`Proxy`, `ProcessManager`, `createBroker`, `createApp`, `introspectServer`, `loadConfig`, `resolveEnv`, `readConfig`/`writeConfig`).
