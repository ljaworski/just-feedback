import { describe, it, expect } from 'vitest';
import { makeApp, onboard } from './helpers';

describe('client feedback API', () => {
  it('rejects missing / invalid / revoked keys with 401', async () => {
    const t = await makeApp();
    const { cookie, body } = await onboard(t);

    const none = await t.app.inject({ method: 'POST', url: '/api/v1/feedback', payload: { content: 'x' } });
    expect(none.statusCode).toBe(401);

    const bad = await t.app.inject({
      method: 'POST',
      url: '/api/v1/feedback',
      headers: { 'x-api-key': 'jf_nope' },
      payload: { content: 'x' },
    });
    expect(bad.statusCode).toBe(401);

    // revoke -> immediate 401
    await t.app.inject({
      method: 'POST',
      url: `/api/admin/keys/${body.apiKey.id}/revoke`,
      headers: { cookie },
    });
    const revoked = await t.app.inject({
      method: 'POST',
      url: '/api/v1/feedback',
      headers: { 'x-api-key': body.apiKey.key },
      payload: { content: 'x' },
    });
    expect(revoked.statusCode).toBe(401);
    await t.app.close();
  });

  it('validates content (empty, too long)', async () => {
    const t = await makeApp();
    const { body } = await onboard(t);
    const key = body.apiKey.key;

    const empty = await t.app.inject({
      method: 'POST',
      url: '/api/v1/feedback',
      headers: { 'x-api-key': key },
      payload: { content: '   ' },
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error).toBe('validation_error');

    const tooLong = await t.app.inject({
      method: 'POST',
      url: '/api/v1/feedback',
      headers: { 'x-api-key': key },
      payload: { content: 'x'.repeat(5001) },
    });
    expect(tooLong.statusCode).toBe(400);
    await t.app.close();
  });

  it('truncates over-limit metadata instead of rejecting', async () => {
    const t = await makeApp();
    const { body } = await onboard(t);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/feedback',
      headers: { 'x-api-key': body.apiKey.key },
      payload: {
        content: 'hi',
        metadata: { platform: 'p'.repeat(50), userRef: 'u'.repeat(500) },
      },
    });
    expect(res.statusCode).toBe(201);
    const row = t.db
      .prepare('SELECT platform, user_ref FROM feedbacks WHERE id = ?')
      .get(res.json().id) as { platform: string; user_ref: string };
    expect(row.platform.length).toBe(20);
    expect(row.user_ref.length).toBe(200);
    await t.app.close();
  });

  it('rate limits per key (429 past the limit)', async () => {
    const t = await makeApp({ rateLimitPerMinute: 2 });
    const { body } = await onboard(t);
    const key = body.apiKey.key;
    const send = () =>
      t.app.inject({
        method: 'POST',
        url: '/api/v1/feedback',
        headers: { 'x-api-key': key },
        payload: { content: 'x' },
      });
    expect((await send()).statusCode).toBe(201);
    expect((await send()).statusCode).toBe(201);
    const third = await send();
    expect(third.statusCode).toBe(429);
    expect(third.json().error).toBe('rate_limited');
    await t.app.close();
  });
});
