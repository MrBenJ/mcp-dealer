import type { RawConfig, ServerConfig, ToolSchema } from '../../shared/config-types.js';

export async function getConfig(): Promise<RawConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`getConfig failed: ${res.status}`);
  return res.json();
}

export async function putServer(name: string, server: Partial<ServerConfig>): Promise<void> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(server),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `putServer failed: ${res.status}`);
  }
}

export async function deleteServer(name: string): Promise<void> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteServer failed: ${res.status}`);
}

export async function introspectServer(name: string): Promise<ToolSchema[]> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}/introspect`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `introspect failed: ${res.status}`);
  }
  const data = await res.json();
  return data.cached_tools;
}
