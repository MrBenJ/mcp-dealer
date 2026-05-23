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
  return (
    <div className="warn">
      <strong>Env var references in config:</strong>
      <ul>
        {[...referenced].map((v) => (
          <li key={v}>
            <code>{v}</code> — make sure it&apos;s set in your shell before launching Claude Code.
            Example: <code>export {v}=...</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
