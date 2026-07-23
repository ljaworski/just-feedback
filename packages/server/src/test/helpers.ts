import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp, type AppMode } from '../app';
import { openDb } from '../db';
import type { Config } from '../config';
import type { AppState } from '../state';

export const SETUP_TOKEN = 'a'.repeat(64);

export function makeConfig(over: Partial<Config> = {}): Config {
  return {
    dbPath: ':memory:',
    port: 0,
    host: '127.0.0.1',
    adminPort: null,
    sessionSecret: 'test-secret-0123456789abcdef',
    rateLimitPerMinute: 10,
    trustProxy: false,
    adminPassword: null,
    ...over,
  };
}

export interface TestApp {
  app: FastifyInstance;
  db: ReturnType<typeof openDb>['db'];
  state: AppState;
  config: Config;
}

export async function makeApp(
  opts: { adminPassword?: string | null; mode?: AppMode; rateLimitPerMinute?: number } = {},
): Promise<TestApp> {
  const { db } = openDb(':memory:');
  const config = makeConfig({
    adminPassword: opts.adminPassword ?? null,
    rateLimitPerMinute: opts.rateLimitPerMinute ?? 10,
  });
  const state: AppState = {
    setupToken: SETUP_TOKEN,
    bootstrapPassword: opts.adminPassword ?? null,
  };
  const app = await buildApp({ db, config, state, mode: opts.mode ?? 'all' });
  await app.ready();
  return { app, db, state, config };
}

/** Extract the `jf_session=<value>` pair from a Set-Cookie response header. */
export function cookieFrom(res: LightMyRequestResponse): string {
  const sc = res.headers['set-cookie'];
  const arr = Array.isArray(sc) ? sc : sc ? [sc] : [];
  const jf = arr.find((c) => c.startsWith('jf_session='));
  if (!jf) throw new Error('no jf_session cookie in response');
  return jf.split(';')[0];
}

/** Run onboarding and return the session cookie plus the setup response body. */
export async function onboard(
  t: TestApp,
  body: Record<string, unknown> = { password: 'password123', project: { name: 'App', keyLabel: 'Default' } },
): Promise<{ cookie: string; body: any }> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/admin/setup',
    headers: { 'x-setup-token': SETUP_TOKEN },
    payload: body,
  });
  if (res.statusCode !== 201) throw new Error(`onboard failed: ${res.statusCode} ${res.body}`);
  return { cookie: cookieFrom(res), body: res.json() };
}
