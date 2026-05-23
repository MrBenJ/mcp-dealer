import type { RawConfig } from '../../../shared/config-types.js';

interface Props { config: RawConfig }

const ENV_REF = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

export function EnvHelper({ config }: Props) {
  const referenced = new Set<string>();
  for (const server of Object.values(config.servers)) {
    for (const value of Object.values(server.env ?? {})) {
      let m: RegExpExecArray | null;
      while ((m = ENV_REF.exec(value)) !== null) referenced.add(m[1]);
    }
  }
  if (referenced.size === 0) return null;

  async function copyExports() {
    const text = [...referenced].map((v) => `export ${v}=...`).join('\n');
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard API may be unavailable; user can still read the list */ }
  }

  return (
    <div className="warn">
      <strong>Env var references in config:</strong>
      <ul>
        {[...referenced].map((v) => (
          <li key={v}>
            <code>{v}</code> — make sure it&apos;s set in your shell before launching Claude Code.
          </li>
        ))}
      </ul>
      <button onClick={copyExports}>Copy export commands</button>
    </div>
  );
}
