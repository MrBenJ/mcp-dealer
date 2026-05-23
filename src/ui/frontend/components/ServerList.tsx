import { useState } from 'react';
import type { RawConfig, ServerConfig } from '../../../shared/config-types.js';
import { deleteServer, introspectServer } from '../api.js';

interface Props {
  config: RawConfig;
  onRefresh: () => void;
  onEdit: (name: string, server: ServerConfig) => void;
}

export function ServerList({ config, onRefresh, onEdit }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(name: string) {
    if (!confirm(`Delete server "${name}"?`)) return;
    setBusy(name);
    setError(null);
    try { await deleteServer(name); onRefresh(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(null); }
  }

  async function handleIntrospect(name: string) {
    setBusy(name);
    setError(null);
    try { await introspectServer(name); onRefresh(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(null); }
  }

  const entries = Object.entries(config.servers);
  if (entries.length === 0) return <p>No servers configured. Add one below.</p>;

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr><th>Name</th><th>Description</th><th>Tools</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {entries.map(([name, server]) => (
            <tr key={name}>
              <td><code>{name}</code></td>
              <td>{server.description}</td>
              <td>{server.cached_tools?.length ?? 0}</td>
              <td>
                <button onClick={() => onEdit(name, server)} disabled={busy === name}>Edit</button>{' '}
                <button onClick={() => handleIntrospect(name)} disabled={busy === name}>Re-introspect</button>{' '}
                <button className="danger" onClick={() => handleDelete(name)} disabled={busy === name}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
