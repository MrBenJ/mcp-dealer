# mcp-dealer — Design

**Status:** Approved for implementation planning
**Date:** 2026-05-22

## 1. Purpose

`mcp-dealer` is a meta-MCP server (a "broker") that gives an agent dynamic access to a fleet of underlying MCP servers without paying their startup token cost.

The trade-off: agents pay a small **discovery cost** in tokens when they actually need a server, instead of paying a large **permanent cost** for every configured server at session start. This is a net win for users who have many MCP servers configured but use most of them occasionally.

### Non-goals (v1)

- Brokering HTTP/SSE MCP servers (stdio only).
- OS keychain integration for secrets.
- Multi-user or remote management.
- Per-tool ACLs, rate limiting, or quotas.
- Telemetry or usage metrics.

## 2. High-level shape

One npm package, three pieces:

1. **Broker** — the MCP server Claude Code spawns. Stdio transport. Exposes 4 tools to the agent.
2. **UI server** — `npx mcp-dealer ui` opens a localhost web app for editing the config (add/remove servers, set env vars, view cached tool schemas).
3. **Config file** — single JSON file at `~/.mcp-dealer/config.json` (overridable via `MCP_DEALER_CONFIG` env var). Source of truth shared by broker and UI.

The broker and the UI are separate processes that share the config file. They do not communicate directly.

## 3. The broker's 4 tools

| Tool | Args | Returns | Cost |
|---|---|---|---|
| `list_servers` | none | `[{name, description, tool_count}]` per configured server | Tiny — name + 1-liner per server |
| `list_tools` | `server: string` | Full tool schemas for that server | A few hundred tokens typically |
| `invoke` | `server: string, tool: string, args: object` | Whatever the underlying tool returns | Pays only the response tokens |
| `refresh` | `drop_schema_cache?: boolean` | `{reloaded: true, server_count: N}` | Tiny |

### Schema cache layers

The broker maintains an **in-memory schema cache** layered on top of the **on-disk `cached_tools`** in the config file. The UI is the only writer of `cached_tools` on disk; the broker never writes to the config file. This keeps the write path single-writer and avoids races.

### `list_tools` discovery flow

1. If the in-memory cache has schemas for this server, return them.
2. Otherwise, read `cached_tools` from the config for that server. If non-empty, populate the in-memory cache and return.
3. Otherwise, lazily spawn the server, call `tools/list`, populate the in-memory cache, return. (The on-disk cache stays empty until the user runs "Re-introspect" in the UI.) The spawned server is then subject to the normal TTL — it does not stay warm just because it was spawned for introspection.

### `refresh`

- Always re-reads the config file from disk.
- If `drop_schema_cache: true`, clears the in-memory schema cache (so next `list_tools` re-introspects).
- Does NOT terminate currently warm child processes — they continue serving in-flight calls.

## 4. Process lifecycle

The `process-manager` module tracks each child MCP server in one of three states:

- **`idle`** — not running.
- **`warm`** — running, holding for reuse, has a `last_used` timestamp.
- **`dying`** — TTL expired, `SIGTERM` sent, awaiting exit (or `SIGKILL` after a grace period).

### Transitions

- First `invoke(server, ...)` for an `idle` server: spawn child, establish JSON-RPC over stdio, forward call, mark `warm` with `last_used = now`.
- Subsequent `invoke` within TTL: reuse warm child, update `last_used`.
- Background sweeper ticks every 30 seconds; any warm child where `now - last_used > ttl` transitions to `dying`. `SIGTERM`, then `SIGKILL` after a 5-second grace.
- Per-server `ttl_seconds` in config overrides the default of 300.
- Broker process shutdown (SIGTERM from Claude Code): terminate all warm children with the same grace policy before exiting.

### Per-call timeout

Each `invoke` has a timeout (default 60s, configurable via `defaults.invoke_timeout_ms`). On timeout, the broker kills the child, returns a `timeout` error to the agent, and removes the child from the warm set. The next invoke spawns a fresh process.

## 5. Config file shape

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
      "description": "GitHub repos, issues, PRs",
      "ttl_seconds": 300,
      "cached_tools": [
        { "name": "search_repositories", "description": "...", "inputSchema": { } }
      ]
    },
    "linear": {
      "command": "npx",
      "args": ["-y", "linear-mcp"],
      "env": { "LINEAR_API_KEY": "lin_api_xxx" },
      "description": "Linear tickets and projects",
      "cached_tools": []
    }
  }
}
```

### Field semantics

- `command` and `args`: standard child-process invocation. `command` is resolved against `PATH`.
- `env`: object of string values. Each value may be a literal (e.g., `"lin_api_xxx"`) or contain `${VAR}` references resolved from `process.env` at spawn time. Unresolved references produce a config error surfaced via `invoke` (not at config load — we don't want to block startup for unused servers).
- `description`: 1-line summary shown in `list_servers`. Required.
- `ttl_seconds`: optional per-server override of `defaults.ttl_seconds`.
- `cached_tools`: optional array of tool schemas. Populated by the UI on "add server" and "re-introspect."

### When the broker reads the config

The broker reads the config file:
- Once at startup, to know which servers exist.
- On every `refresh` call, to pick up additions/removals/edits made via the UI.
- It does **not** re-read on every `list_servers` / `list_tools` / `invoke` — those use the in-memory snapshot, which is refreshed by the explicit `refresh` tool or process restart. This matches the agent's mental model: `refresh` is the seam where the world updates.

### Atomicity

The UI writes the config via write-to-temp + fsync + rename, so the broker never sees a half-written file when it does read.

## 6. Error handling

Every error returned to the agent is an MCP error response with a structured `data` payload so the agent can recover programmatically.

| Failure | Code | `data` payload |
|---|---|---|
| Server name not in config | `unknown_server` | `{ available_servers: string[] }` |
| Tool name not on server | `unknown_tool` | `{ available_tools: string[] }` |
| Spawn fails | `spawn_failed` | `{ stderr: string (≤2KB), exit_code?: number, syscall_error?: string }` (e.g., `ENOENT` when the binary is missing has no exit code; `syscall_error` carries it instead) |
| Invoke exceeds timeout | `timeout` | `{ timeout_ms: number, suggestion: "refresh" }` |
| Child crashes mid-call | `child_crashed` | `{ stderr: string (≤2KB), exit_code: number }` |
| Config file invalid | `config_error` | `{ path: string, parse_error: string }` |
| Env var reference unresolved | `env_unresolved` | `{ var_name: string, server: string }` |

The broker never silently swallows a failure. If the underlying server can't run, the agent sees exactly why and can decide whether to retry, refresh, or surface the problem to the user.

## 7. UI

A small React + Vite SPA served by a Hono HTTP server on `localhost:7411` (port overridable via `--port` flag or `MCP_DEALER_UI_PORT` env var). Binds to `127.0.0.1` only — not `0.0.0.0` — so it's not accessible from other machines on the LAN.

### Pages

- **Servers list** — table of configured servers with name, description, cached tool count, last-introspected timestamp.
- **Add server** — form with `command`, `args[]`, `env{}`, `description`, optional `ttl_seconds`. On save, the UI spawns the server itself (independent of any running broker), calls `tools/list`, writes `cached_tools` to the config, then closes the child. If introspection fails, the UI shows the captured stderr and does not save.
- **Edit / remove** — same form as Add, plus a "Re-introspect" button that re-runs the spawn-and-list flow without changing other fields.
- **Env vars helper** — scans the config for `${VAR}` references and flags any that aren't currently set in `process.env`. Includes a "Copy export command" button for missing vars.

No authentication. The UI assumes localhost-only access is sufficient (consistent with how Claude Desktop's config is treated today).

## 8. Module layout

Single npm package, single TypeScript source tree:

```
src/
  broker/
    index.ts             # entry point for `mcp-dealer` (broker)
    mcp-server.ts        # implements the 4 tools, wires to MCP SDK
    config-loader.ts     # read/parse/validate config, env resolution
    process-manager.ts   # spawn / warm / TTL / teardown state machine
    proxy.ts             # JSON-RPC client per child, forwards tools/call
    errors.ts            # structured error builders
  ui/
    server.ts            # Hono HTTP server entry for `mcp-dealer ui`
    routes.ts            # config CRUD + introspect endpoints
    introspect.ts        # spawn-and-list helper (shared with broker)
    frontend/            # React + Vite SPA, built to ui/dist/
  cli/
    index.ts             # subcommand router: `mcp-dealer` vs `mcp-dealer ui`
  shared/
    config-types.ts      # TypeScript types for the config schema
    config-io.ts         # atomic read/write helpers
```

The single CLI binary dispatches on `argv[2]`: bare `mcp-dealer` runs the broker, `mcp-dealer ui` runs the UI server. The UI's frontend bundle is built at package-build time and shipped inside the package.

## 9. Testing strategy

### Unit tests
- **`config-loader`** — env resolution (literal, `${VAR}` set, `${VAR}` unset), malformed JSON, missing required fields, mixed defaults and overrides.
- **`process-manager`** — lifecycle state transitions, TTL sweeper firing, signal handling on shutdown, concurrent invoke serialization.
- **`proxy`** — JSON-RPC request/response correlation, error mapping from child to broker error codes.
- **`errors`** — every error builder produces the documented `data` shape.

### Integration tests
- A minimal stdio MCP server written for testing (~50 lines) with controllable failure modes: respond normally, crash on demand, hang on demand, exit with non-zero code, emit specific stderr.
- Tests exercise: spawn success, spawn failure, invoke success, invoke timeout, child crash mid-call, schema caching, TTL teardown.

### End-to-end tests
- Spawn the broker as a child of the test runner.
- Communicate via the MCP client SDK over stdio.
- Exercise the 4 tools against a real underlying server (`@modelcontextprotocol/server-everything` is a good neutral target with deterministic tools).

### Explicit non-pattern
- **No mocking of child processes in lifecycle tests.** Use real ones with the minimal test server. Mocked process state has historically masked real bugs in TTL and signal handling.

## 10. Distribution

- npm package: `mcp-dealer`
- Bin entry: `mcp-dealer` (single binary, subcommand dispatch)
- Users add to their MCP client config (e.g., `claude_desktop_config.json`):

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

- Users run `npx mcp-dealer ui` separately when they want to manage the server fleet.
- README documents both flows and the config file format.

## 11. Decisions finalized during review

- **MCP SDK:** latest stable `@modelcontextprotocol/sdk`.
- **HTTP server for the UI:** Hono. Smaller and faster than Express, sufficient for the handful of endpoints needed.
- **Live broker observability in the UI:** not in v1. The UI shows configuration state, not runtime state. Adding a `state.json` or IPC channel is out of scope.
