import type { FastifyInstance } from 'fastify';
import { timingSafeEqual, randomBytes, createHash } from 'crypto';
import { setupBodySchema } from '../../schemas';
import { adminExists } from '../../state';
import { hashPassword } from '../../auth/password';
import { generateApiKey } from '../../auth/apiKey';
import { setSessionCookie } from './cookies';
import { uuid, nowIso, isoInDays } from '../../util';

class AlreadyInitialized extends Error {}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Session token generated before the transaction, but inserted inside it. */
function newSessionToken(): { token: string; hash: string; expiresAt: string } {
  const token = randomBytes(32).toString('hex');
  return {
    token,
    hash: createHash('sha256').update(token).digest('hex'),
    expiresAt: isoInDays(30),
  };
}

export async function setupRoutes(app: FastifyInstance): Promise<void> {
  // Always public: reveals only initialization state.
  app.get('/setup/status', (_req, reply) => {
    const setupRequired = !adminExists(app.db);
    const passwordRequired = setupRequired && !app.state.bootstrapPassword;
    return reply.send({ setupRequired, passwordRequired });
  });

  app.post(
    '/setup',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute', keyGenerator: (req) => req.ip } } },
    (req, reply) => {
      // 1. Already initialized (also settles a completed parallel request).
      if (adminExists(app.db)) return reply.code(409).send({ error: 'already_initialized' });

      // 2. Setup token (constant-time).
      const token = req.headers['x-setup-token'];
      if (
        !app.state.setupToken ||
        typeof token !== 'string' ||
        !safeEqual(token, app.state.setupToken)
      ) {
        return reply.code(403).send({ error: 'invalid_setup_token' });
      }

      // 3. Validate body. Password comes from env bootstrap if present, else from body.
      const parsed = setupBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_error', details: parsed.error.issues });
      }
      const rawPassword = app.state.bootstrapPassword ?? parsed.data.password;
      if (!rawPassword) {
        return reply.code(400).send({
          error: 'validation_error',
          details: [{ path: ['password'], message: 'Password required' }],
        });
      }
      const project = parsed.data.project ?? null;

      // 4. Expensive work BEFORE the transaction (scrypt, random values).
      const passwordHash = hashPassword(rawPassword);
      const now = nowIso();
      const projectId = project ? uuid() : null;
      const keyGen = project ? generateApiKey() : null;
      const keyId = project ? uuid() : null;
      const session = newSessionToken();

      try {
        app.db.transaction(() => {
          if (adminExists(app.db)) throw new AlreadyInitialized();
          app.db
            .prepare('INSERT INTO admin_credentials (id, password_hash, created_at) VALUES (1, ?, ?)')
            .run(passwordHash, now);
          if (project && projectId && keyGen && keyId) {
            app.db
              .prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)')
              .run(projectId, project.name, now);
            app.db
              .prepare(
                'INSERT INTO api_keys (id, project_id, label, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)',
              )
              .run(keyId, projectId, project.keyLabel, keyGen.keyHash, keyGen.keyPrefix, now);
          }
          app.db
            .prepare('INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)')
            .run(session.hash, now, session.expiresAt);
        })();
      } catch (e) {
        if (e instanceof AlreadyInitialized) {
          return reply.code(409).send({ error: 'already_initialized' });
        }
        throw e;
      }

      // 5. Commit succeeded: burn the setup token, set the session cookie.
      app.state.setupToken = null;
      setSessionCookie(req, reply, session.token);

      return reply.code(201).send({
        project: project ? { id: projectId, name: project.name, createdAt: now } : null,
        apiKey:
          project && keyGen && keyId
            ? { id: keyId, label: project.keyLabel, keyPrefix: keyGen.keyPrefix, key: keyGen.key }
            : null,
      });
    },
  );
}
