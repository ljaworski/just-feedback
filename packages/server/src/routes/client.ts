import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { feedbackBodySchema, truncateMeta } from '../schemas';
import { lookupApiKey } from '../auth/apiKey';
import { uuid, nowIso } from '../util';

/** Public client API (`/api/v1`), authorized by X-Api-Key. CORS: open (future web clients). */
export async function clientRoutes(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: '*',
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Api-Key'],
  });

  app.post(
    '/feedback',
    {
      config: {
        rateLimit: {
          max: app.config.rateLimitPerMinute,
          timeWindow: '1 minute',
          keyGenerator: (req) => (req.headers['x-api-key'] as string) || req.ip,
        },
      },
    },
    (req, reply) => {
      const rawKey = req.headers['x-api-key'];
      const key = typeof rawKey === 'string' ? lookupApiKey(app.db, rawKey) : null;
      if (!key) return reply.code(401).send({ error: 'invalid_api_key' });

      const parsed = feedbackBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_error', details: parsed.error.issues });
      }

      const meta = truncateMeta(parsed.data.metadata);
      const id = uuid();
      app.db
        .prepare(
          `INSERT INTO feedbacks
             (id, project_id, content, status, app_version, platform, os_version, device_model, user_ref, api_key_id, created_at)
           VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          key.projectId,
          parsed.data.content,
          meta.appVersion,
          meta.platform,
          meta.osVersion,
          meta.deviceModel,
          meta.userRef,
          key.id,
          nowIso(),
        );
      return reply.code(201).send({ id });
    },
  );
}
