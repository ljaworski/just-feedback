import { randomBytes } from 'crypto';
import type { DB } from './db';

/** Runtime setup state, shared across Fastify instances (single + admin-port modes). */
export interface AppState {
  /** One-time setup token, in memory only. Null once onboarding is completed. */
  setupToken: string | null;
  /** Bootstrap password from JF_ADMIN_PASSWORD, only for an uninitialized instance. */
  bootstrapPassword: string | null;
}

export function adminExists(db: DB): boolean {
  return !!db.prepare('SELECT 1 FROM admin_credentials WHERE id = 1').get();
}

export function newSetupToken(): string {
  return randomBytes(32).toString('hex');
}
