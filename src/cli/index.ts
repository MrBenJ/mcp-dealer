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
