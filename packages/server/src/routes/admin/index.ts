import type { FastifyInstance } from 'fastify';
import { setupRoutes } from './setup';
import { authRoutes } from './auth';
import { projectRoutes } from './projects';
import { feedbackRoutes } from './feedbacks';
import { keyRoutes } from './keys';
import { validateSession } from '../../auth/session';
import { readSessionToken } from './cookies';

/** Admin API (`/api/admin`). Setup + login/logout are public; everything else needs a session. */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  await app.register(setupRoutes);
  await app.register(authRoutes);

  // Session-protected scope.
  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', (req, reply, done) => {
      if (!validateSession(protectedApp.db, readSessionToken(req))) {
        reply.code(401).send({ error: 'unauthorized' });
        return;
      }
      done();
    });

    protectedApp.get('/me', (_req, reply) => reply.code(204).send());
    await protectedApp.register(projectRoutes);
    await protectedApp.register(feedbackRoutes);
    await protectedApp.register(keyRoutes);
  });
}
