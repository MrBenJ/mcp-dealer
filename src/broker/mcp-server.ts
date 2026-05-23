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
