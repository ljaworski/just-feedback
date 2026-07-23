import type { FastifyInstance } from 'fastify';
import { loginBodySchema } from '../../schemas';
import { adminExists } from '../../state';
import { verifyPassword } from '../../auth/password';
import { createSession, deleteSession } from '../../auth/session';
import { setSessionCookie, clearSessionCookie, readSessionToken } from './cookies';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute', keyGenerator: (req) => req.ip } } },
    (req, reply) => {
      if (!adminExists(app.db)) return reply.code(409).send({ error: 'setup_required' });

      const parsed = loginBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_error', details: parsed.error.issues });
      }
      const row = app.db.prepare('SELECT password_hash FROM admin_credentials WHERE id = 1').get() as
        | { password_hash: string }
        | undefined;
      if (!row || !verifyPassword(parsed.data.password, row.password_hash)) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
      setSessionCookie(req, reply, createSession(app.db));
      return reply.code(204).send();
    },
  );

  app.post('/logout', (req, reply) => {
    deleteSession(app.db, readSessionToken(req));
    clearSessionCookie(reply);
    return reply.code(204).send();
  });
}
