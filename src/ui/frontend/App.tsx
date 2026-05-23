import { useEffect, useState } from 'react';
import type { RawConfig, ServerConfig } from '../../shared/config-types.js';
import { getConfig } from './api.js';
import { ServerList } from './components/ServerList.js';
import { ServerForm } from './components/ServerForm.js';
import { EnvHelper } from './components/EnvHelper.js';

export function App() {
  const [config, setConfig] = useState<RawConfig | null>(null);
  const [editing, setEditing] = useState<{ name: string; server: ServerConfig } | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try { setConfig(await getConfig()); }
    catch (err) { setError((err as Error).message); }
  }

  useEffect(() => { refresh(); }, []);

  if (error) return <p className="error">{error}</p>;
  if (!config) return <p>Loading&hellip;</p>;

  return (
    <div>
      <h1>mcp-dealer</h1>
      <EnvHelper config={config} />

      {!editing && !adding && (
        <>
          <ServerList
            config={config}
            onRefresh={refresh}
            onEdit={(name, server) => setEditing({ name, server })}
          />
          <button className="primary" style={{ marginTop: '1rem' }} onClick={() => setAdding(true)}>
            Add server
          </button>
        </>
      )}

      {(editing || adding) && (
        <ServerForm
          initial={editing}
          onSaved={() => { setEditing(null); setAdding(false); refresh(); }}
          onCancel={() => { setEditing(null); setAdding(false); }}
        />
      )}
    </div>
  );
}
