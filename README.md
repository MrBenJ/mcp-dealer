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
