const DEFAULT_PORT = 7411;
const MIN_PORT = 0;
const MAX_PORT = 65535;

function parsePort(raw: string, source: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MIN_PORT || n > MAX_PORT) {
    throw new Error(
      `${source} must be an integer in [${MIN_PORT}, ${MAX_PORT}], got ${JSON.stringify(raw)}`,
    );
  }
  return n;
}

export function resolvePort(argv: string[], env: Record<string, string | undefined>): number {
  const portArgIdx = argv.indexOf('--port');
  if (portArgIdx >= 0) {
    const raw = argv[portArgIdx + 1];
    if (raw === undefined) {
      throw new Error('--port requires a value');
    }
    return parsePort(raw, '--port');
  }

  const envRaw = env.MCP_DEALER_UI_PORT;
  if (envRaw !== undefined && envRaw !== '') {
    return parsePort(envRaw, 'MCP_DEALER_UI_PORT');
  }

  return DEFAULT_PORT;
}
