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
