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
