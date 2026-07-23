import type { FastifyInstance } from 'fastify';
import { keyBodySchema } from '../../schemas';
import { generateApiKey } from '../../auth/apiKey';
import { uuid, nowIso } from '../../util';

export async function keyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/projects/:id/keys', (req, reply) => {
    const { id } = req.params as { id: string };
    if (!app.db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return app.db
      .prepare(
        `SELECT id, label, key_prefix AS keyPrefix, created_at AS createdAt, revoked_at AS revokedAt
         FROM api_keys WHERE project_id = ? ORDER BY created_at ASC`,
      )
      .all(id);
  });

  app.post('/projects/:id/keys', (req, reply) => {
    const { id } = req.params as { id: string };
    if (!app.db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    const parsed = keyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', details: parsed.error.issues });
    }
    const keyId = uuid();
    const gen = generateApiKey();
    app.db
      .prepare(
        'INSERT INTO api_keys (id, project_id, label, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(keyId, id, parsed.data.label, gen.keyHash, gen.keyPrefix, nowIso());
    return reply
      .code(201)
      .send({ id: keyId, label: parsed.data.label, keyPrefix: gen.keyPrefix, key: gen.key });
  });

  app.post('/keys/:id/revoke', (req, reply) => {
    const { id } = req.params as { id: string };
    if (!app.db.prepare('SELECT 1 FROM api_keys WHERE id = ?').get(id)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    app.db
      .prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .run(nowIso(), id);
    return reply.code(204).send();
  });
}
