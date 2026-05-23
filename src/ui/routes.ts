import { Hono } from 'hono';
import { readConfig, writeConfig } from '../shared/config-io.js';
import { introspectServer } from '../broker/introspect.js';
import type { ServerConfig } from '../shared/config-types.js';

interface Options { configPath: string }

export function createApp(opts: Options) {
  const app = new Hono();

  app.get('/api/config', async (c) => {
    const config = await readConfig(opts.configPath);
    return c.json(config);
  });

  app.put('/api/servers/:name', async (c) => {
    const name = c.req.param('name');
    const body = (await c.req.json()) as Partial<ServerConfig>;
    if (typeof body.command !== 'string' || !body.command) {
      return c.json({ error: 'command is required' }, 400);
    }
    if (typeof body.description !== 'string' || !body.description) {
      return c.json({ error: 'description is required' }, 400);
    }
    const config = await readConfig(opts.configPath);
    config.servers[name] = {
      command: body.command,
      args: body.args ?? [],
      env: body.env ?? {},
      description: body.description,
      ttl_seconds: body.ttl_seconds,
      cached_tools: body.cached_tools ?? config.servers[name]?.cached_tools ?? [],
    };
    await writeConfig(opts.configPath, config);
    return c.json({ ok: true });
  });

  app.delete('/api/servers/:name', async (c) => {
    const name = c.req.param('name');
    const config = await readConfig(opts.configPath);
    delete config.servers[name];
    await writeConfig(opts.configPath, config);
    return c.json({ ok: true });
  });

  app.post('/api/servers/:name/introspect', async (c) => {
    const name = c.req.param('name');
    const config = await readConfig(opts.configPath);
    const server = config.servers[name];
    if (!server) return c.json({ error: 'unknown server' }, 404);

    try {
      const tools = await introspectServer(server);
      config.servers[name] = { ...server, cached_tools: tools };
      await writeConfig(opts.configPath, config);
      return c.json({ cached_tools: tools });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  return app;
}
