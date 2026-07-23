import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

export interface Config {
  dbPath: string;
  port: number;
  host: string;
  adminPort: number | null;
  sessionSecret: string;
  rateLimitPerMinute: number;
  trustProxy: boolean;
  /** Raw JF_ADMIN_PASSWORD; only used to bootstrap an uninitialized instance. */
  adminPassword: string | null;
}

export interface CliOverrides {
  port?: number;
  dbPath?: string;
}

function num(v: string | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric value: ${v}`);
  return n;
}

/** Resolve the cookie-signing secret: env, or a generated one persisted next to the DB. */
function resolveSessionSecret(env: NodeJS.ProcessEnv, dbPath: string): string {
  if (env.JF_SESSION_SECRET) return env.JF_SESSION_SECRET;
  const file = join(dirname(resolve(process.cwd(), dbPath)), '.session-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(32).toString('hex');
  try {
    writeFileSync(file, secret, { mode: 0o600 });
  } catch {
    // ponytail: if the dir is read-only, fall back to an ephemeral secret (sessions drop on restart)
  }
  return secret;
}

export function loadConfig(
  overrides: CliOverrides = {},
  env: NodeJS.ProcessEnv = process.env,
): Config {
  const dbPath = overrides.dbPath ?? env.JF_DB_PATH ?? './just-feedback.db';
  return {
    dbPath,
    port: overrides.port ?? num(env.JF_PORT, 4180),
    host: env.JF_HOST ?? '0.0.0.0',
    adminPort: env.JF_ADMIN_PORT ? num(env.JF_ADMIN_PORT, 0) : null,
    sessionSecret: resolveSessionSecret(env, dbPath),
    rateLimitPerMinute: num(env.JF_RATE_LIMIT_PER_MINUTE, 10),
    trustProxy: env.JF_TRUST_PROXY === 'true',
    adminPassword: env.JF_ADMIN_PASSWORD ?? null,
  };
}
