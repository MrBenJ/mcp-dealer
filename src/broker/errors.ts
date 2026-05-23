const MAX_STDERR_BYTES = 2048;

export type DealerErrorCode =
  | 'unknown_server'
  | 'unknown_tool'
  | 'spawn_failed'
  | 'timeout'
  | 'child_crashed'
  | 'invoke_error'
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

export function invokeError(mcpError: { message: string; code?: number; data?: unknown }): DealerError {
  return new DealerError('invoke_error', mcpError.message, { mcp_error: mcpError });
}

export function envUnresolved(varName: string, server: string): DealerError {
  return new DealerError('env_unresolved', `Environment variable ${varName} is not set (server: ${server})`, {
    var_name: varName,
    server,
  });
}
