import '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const SESSION_COOKIE = 'jf_session';
const MAX_AGE = 30 * 86400; // 30 days, seconds

export function setSessionCookie(req: FastifyRequest, reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    signed: true,
    secure: req.protocol === 'https',
    maxAge: MAX_AGE,
  });
}

export function readSessionToken(req: FastifyRequest): string | null {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const r = req.unsignCookie(raw);
  return r.valid ? r.value : null;
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
