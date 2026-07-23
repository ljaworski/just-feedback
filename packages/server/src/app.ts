import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'fs';
import { join } from 'path';
import type { DB } from './db';
import type { Config } from './config';
import type { AppState } from './state';
import { clientRoutes } from './routes/client';
import { adminRoutes } from './routes/admin';
import './types';

export type AppMode = 'all' | 'client' | 'admin';

export interface BuildAppOptions {
  db: DB;
  config: Config;
  state: AppState;
  /** 'all' = single port; 'client' = only /api/v1; 'admin' = /api/admin + panel. */
  mode?: AppMode;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const mode = opts.mode ?? 'all';
  const app = Fastify({
    bodyLimit: 32 * 1024,
    trustProxy: opts.config.trustProxy,
    logger: opts.logger ?? false,
  });

  app.decorate('db', opts.db);
  app.decorate('config', opts.config);
  app.decorate('state', opts.state);

  await app.register(cookie, { secret: opts.config.sessionSecret });
  await app.register(rateLimit, { global: false });

  // @fastify/rate-limit throws a 429 error; reshape it to the documented body.
  app.setErrorHandler((error, _req, reply) => {
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.code(429).send({ error: 'rate_limited' });
    }
    return reply.send(error);
  });

  app.addHook('onSend', (_req, reply, payload, done) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    done(null, payload);
  });

  app.get('/healthz', async () => {
    opts.db.prepare('SELECT 1').get();
    return { status: 'ok' };
  });

  const serveAdmin = mode === 'all' || mode === 'admin';
  const serveClient = mode === 'all' || mode === 'client';

  if (serveClient) await app.register(clientRoutes, { prefix: '/api/v1' });
  if (serveAdmin) await app.register(adminRoutes, { prefix: '/api/admin' });

  const panelDir = join(__dirname, 'panel');
  const hasPanel = serveAdmin && existsSync(join(panelDir, 'index.html'));
  if (hasPanel) {
    await app.register(fastifyStatic, {
      root: panelDir,
      wildcard: false,
      cacheControl: false, // we set Cache-Control ourselves (no-store for index.html)
      setHeaders: (res, path) => {
        if (path.endsWith('index.html')) res.header('Cache-Control', 'no-store');
      },
    });
  }

  // SPA fallback: non-API GETs serve index.html; unknown API paths → 404 JSON.
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api') && hasPanel) {
      reply.header('Cache-Control', 'no-store');
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found' });
  });

  return app;
}
