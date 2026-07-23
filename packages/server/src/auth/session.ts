import { randomBytes } from 'crypto';
import type { DB } from '../db';
import { sha256hex } from './apiKey';
import { nowIso, isoInDays } from '../util';

const SESSION_DAYS = 30;

/** Create a session, store only its hash. Returns the raw token for the cookie. */
export function createSession(db: DB): string {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)').run(
    sha256hex(token),
    nowIso(),
    isoInDays(SESSION_DAYS),
  );
  return token;
}

/** Lazily purge expired sessions, then check the token is valid and unexpired. */
export function validateSession(db: DB, token: string | undefined | null): boolean {
  db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(nowIso());
  if (!token) return false;
  const row = db
    .prepare('SELECT 1 FROM admin_sessions WHERE token_hash = ?')
    .get(sha256hex(token));
  return !!row;
}

export function deleteSession(db: DB, token: string | undefined | null): void {
  if (!token) return;
  db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(sha256hex(token));
}
