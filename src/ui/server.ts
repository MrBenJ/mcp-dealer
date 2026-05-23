import { serve } from '@hono/node-server';
import { createApp } from './routes.js';
import { join, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { contentType, lookup } from 'mime-types';

interface StartOptions { configPath: string; port: number }

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = join(__dirname, 'frontend', 'dist');

function attachStatic(app: ReturnType<typeof createApp>): void {
  if (!existsSync(FRONTEND_DIST)) return;
  app.get('*', (c) => {
    const url = new URL(c.req.url);
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    if (pathname.startsWith('/api')) return c.notFound();
    const filePath = join(FRONTEND_DIST, pathname);
    const rel = relative(FRONTEND_DIST, filePath);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return c.notFound();
    }
    if (!existsSync(filePath)) {
      const indexPath = join(FRONTEND_DIST, 'index.html');
      if (existsSync(indexPath)) {
        return c.body(readFileSync(indexPath), 200, { 'content-type': 'text/html' });
      }
      return c.notFound();
    }
    const body = readFileSync(filePath);
    const mime = lookup(filePath);
    const ct = mime ? contentType(mime) : false;
    return c.body(body, 200, { 'content-type': (ct || 'application/octet-stream').toString() });
  });
}

export function startUi(opts: StartOptions): void {
  const app = createApp({ configPath: opts.configPath });
  attachStatic(app);
  serve({ fetch: app.fetch, port: opts.port, hostname: '127.0.0.1' });
  process.stderr.write(`mcp-dealer UI listening on http://127.0.0.1:${opts.port}\n`);
}
