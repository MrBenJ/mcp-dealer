import { useEffect, useState } from 'react';
import type { ServerConfig } from '../../../shared/config-types.js';
import { putServer, introspectServer } from '../api.js';

interface Props {
  initial: { name: string; server: ServerConfig } | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function ServerForm({ initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [argsText, setArgsText] = useState('');
  const [description, setDescription] = useState('');
  const [envText, setEnvText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setCommand(initial.server.command);
      setArgsText((initial.server.args ?? []).join('\n'));
      setDescription(initial.server.description);
      setEnvText(Object.entries(initial.server.env ?? {}).map(([k, v]) => `${k}=${v}`).join('\n'));
    } else {
      setName(''); setCommand(''); setArgsText(''); setDescription(''); setEnvText('');
    }
  }, [initial]);

  function parseEnv(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1);
    }
    return out;
  }

  async function handleSubmit(introspectAfter: boolean) {
    setBusy(true);
    setError(null);
    try {
      await putServer(name, {
        command,
        args: argsText.split('\n').map((s) => s.trim()).filter(Boolean),
        description,
        env: parseEnv(envText),
      });
      if (introspectAfter) {
        try { await introspectServer(name); }
        catch (err) {
          setError(`Server saved but introspection failed: ${(err as Error).message}`);
          setBusy(false);
          return;
        }
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>{initial ? `Edit ${initial.name}` : 'Add server'}</h2>
      {error && <p className="error">{error}</p>}
      <label>Name (unique identifier)</label>
      <input value={name} onChange={(e) => setName(e.target.value)} disabled={!!initial} placeholder="github" />

      <label>Command</label>
      <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" />

      <label>Args (one per line)</label>
      <textarea rows={4} value={argsText} onChange={(e) => setArgsText(e.target.value)} placeholder={'-y\n@modelcontextprotocol/server-github'} />

      <label>Description (shown to the agent in list_servers)</label>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="GitHub repos, issues, PRs" />

      <label>Environment variables (KEY=value, one per line; use ${'{'}VAR{'}'} to reference process env)</label>
      <textarea rows={4} value={envText} onChange={(e) => setEnvText(e.target.value)} placeholder={'GITHUB_TOKEN=${GITHUB_TOKEN}'} />

      <div style={{ marginTop: '1rem' }}>
        <button className="primary" onClick={() => handleSubmit(true)} disabled={busy}>Save and introspect</button>{' '}
        <button onClick={() => handleSubmit(false)} disabled={busy}>Save only</button>{' '}
        <button onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}
