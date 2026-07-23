import { randomUUID } from 'crypto';

export const uuid = (): string => randomUUID();
export const nowIso = (): string => new Date().toISOString();

/** ISO string `days` from now. */
export function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString();
}
