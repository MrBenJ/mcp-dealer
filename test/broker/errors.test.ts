import { describe, it, expect } from 'vitest';
import {
  unknownServer,
  unknownTool,
  spawnFailed,
  invokeTimeout,
  childCrashed,
  invokeError,
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

  it('invokeError wraps an upstream MCP error', () => {
    const err = invokeError({ message: 'tool not found', code: -32601 });
    expect(err.code).toBe('invoke_error');
    expect(err.message).toBe('tool not found');
    expect((err.data.mcp_error as { code: number }).code).toBe(-32601);
  });
});
