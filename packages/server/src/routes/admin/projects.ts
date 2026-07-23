import type { FastifyInstance } from 'fastify';
import { projectBodySchema } from '../../schemas';
import { uuid, nowIso } from '../../util';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/projects', () => {
    const rows = app.db
      .prepare(
        `SELECT id, name, created_at AS createdAt,
           (SELECT COUNT(*) FROM feedbacks WHERE project_id = p.id) AS totalCount,
           (SELECT COUNT(*) FROM feedbacks WHERE project_id = p.id AND status = 'new') AS newCount
         FROM projects p
         ORDER BY created_at ASC`,
      )
      .all();
    return rows;
  });

  app.post('/projects', (req, reply) => {
    const parsed = projectBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', details: parsed.error.issues });
    }
    const id = uuid();
    const createdAt = nowIso();
    app.db
      .prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)')
      .run(id, parsed.data.name, createdAt);
    return reply.code(201).send({ id, name: parsed.data.name, createdAt });
  });

  app.patch('/projects/:id', (req, reply) => {
    const parsed = projectBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', details: parsed.error.issues });
    }
    const { id } = req.params as { id: string };
    const res = app.db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(parsed.data.name, id);
    if (res.changes === 0) return reply.code(404).send({ error: 'not_found' });
    const row = app.db
      .prepare('SELECT id, name, created_at AS createdAt FROM projects WHERE id = ?')
      .get(id);
    return reply.send(row);
  });

  app.delete('/projects/:id', (req, reply) => {
    const { id } = req.params as { id: string };
    const res = app.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    if (res.changes === 0) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });
}
