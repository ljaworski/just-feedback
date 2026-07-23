import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

// scrypt params per spec; versioned so they can be raised later without a schema change.
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 64 * 1024 * 1024;

/** Format: scrypt$v=1$N=32768,r=8,p=1$<salt_hex>$<hash_hex> */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$v=1$N=${N},r=${R},p=${P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'scrypt') return false;
  const params = Object.fromEntries(parts[2].split(',').map((kv) => kv.split('=')));
  const n = Number(params.N);
  const r = Number(params.r);
  const p = Number(params.p);
  const salt = Buffer.from(parts[3], 'hex');
  const expected = Buffer.from(parts[4], 'hex');
  const actual = scryptSync(password, salt, expected.length, { N: n, r, p, maxmem: MAXMEM });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
