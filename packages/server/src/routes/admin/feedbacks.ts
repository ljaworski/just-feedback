import type { FastifyInstance } from 'fastify';
import { feedbackPatchSchema } from '../../schemas';

const ITEM_COLS =
  'id, content, status, app_version AS appVersion, platform, os_version AS osVersion, device_model AS deviceModel, user_ref AS userRef, created_at AS createdAt';

function projectMissing(app: FastifyInstance, id: string): boolean {
  return !app.db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id);
}

export async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  app.get('/projects/:id/feedbacks', (req, reply) => {
    const { id } = req.params as { id: string };
    if (projectMissing(app, id)) return reply.code(404).send({ error: 'not_found' });

    const q = req.query as { status?: string; limit?: string; offset?: string };
    const statuses = q.status === 'archived' ? ['archived'] : ['new', 'read'];
    const placeholders = statuses.map(() => '?').join(',');
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 100);
    const offset = Math.max(Number(q.offset) || 0, 0);

    const total = (
      app.db
        .prepare(
          `SELECT COUNT(*) AS n FROM feedbacks WHERE project_id = ? AND status IN (${placeholders})`,
        )
        .get(id, ...statuses) as { n: number }
    ).n;

    const items = app.db
      .prepare(
        `SELECT ${ITEM_COLS} FROM feedbacks
         WHERE project_id = ? AND status IN (${placeholders})
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(id, ...statuses, limit, offset);

    return reply.send({ items, total });
  });

  app.patch('/feedbacks/:id', (req, reply) => {
    const parsed = feedbackPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', details: parsed.error.issues });
    }
    const { id } = req.params as { id: string };
    const res = app.db
      .prepare('UPDATE feedbacks SET status = ? WHERE id = ?')
      .run(parsed.data.status, id);
    if (res.changes === 0) return reply.code(404).send({ error: 'not_found' });
    return reply.send(app.db.prepare(`SELECT ${ITEM_COLS} FROM feedbacks WHERE id = ?`).get(id));
  });

  app.post('/projects/:id/feedbacks/mark-all-read', (req, reply) => {
    const { id } = req.params as { id: string };
    if (projectMissing(app, id)) return reply.code(404).send({ error: 'not_found' });
    const res = app.db
      .prepare("UPDATE feedbacks SET status = 'read' WHERE project_id = ? AND status = 'new'")
      .run(id);
    return reply.send({ updated: res.changes });
  });

  app.delete('/feedbacks/:id', (req, reply) => {
    const { id } = req.params as { id: string };
    const res = app.db.prepare('DELETE FROM feedbacks WHERE id = ?').run(id);
    if (res.changes === 0) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });
}
