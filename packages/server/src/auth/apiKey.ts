import { createHash, randomBytes } from 'crypto';
import type { DB } from '../db';

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function base62(len: number): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += BASE62[bytes[i] % 62];
  return out;
}

export const sha256hex = (v: string): string => createHash('sha256').update(v).digest('hex');

/** New API key: `jf_<40 base62>`. Prefix = first 12 chars, used for display. */
export function generateApiKey(): { key: string; keyHash: string; keyPrefix: string } {
  const key = 'jf_' + base62(40);
  return { key, keyHash: sha256hex(key), keyPrefix: key.slice(0, 12) };
}

/** Look up an active (non-revoked) key by its raw header value. */
export function lookupApiKey(db: DB, rawKey: string): { id: string; projectId: string } | null {
  const row = db
    .prepare('SELECT id, project_id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL')
    .get(sha256hex(rawKey)) as { id: string; project_id: string } | undefined;
  return row ? { id: row.id, projectId: row.project_id } : null;
}
