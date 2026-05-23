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
