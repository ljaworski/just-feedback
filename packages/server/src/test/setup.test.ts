import { describe, it, expect } from 'vitest';
import { makeApp, onboard, SETUP_TOKEN, cookieFrom } from './helpers';

describe('onboarding / setup', () => {
  it.each(['all', 'client', 'admin'] as const)('reports service health in %s mode', async (mode) => {
    const t = await makeApp({ mode });
    const res = await t.app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await t.app.close();
  });

  it('reports setup status; password required without env', async () => {
    const t = await makeApp();
    const res = await t.app.inject({ method: 'GET', url: '/api/admin/setup/status' });
    expect(res.json()).toEqual({ setupRequired: true, passwordRequired: true });
    await t.app.close();
  });

  it('password not required when JF_ADMIN_PASSWORD bootstraps', async () => {
    const t = await makeApp({ adminPassword: 'envpassword' });
    const res = await t.app.inject({ method: 'GET', url: '/api/admin/setup/status' });
    expect(res.json()).toEqual({ setupRequired: true, passwordRequired: false });
    await t.app.close();
  });

  it('rejects a wrong setup token with 403', async () => {
    const t = await makeApp();
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/admin/setup',
      headers: { 'x-setup-token': 'b'.repeat(64) },
      payload: { password: 'password123' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('invalid_setup_token');
    await t.app.close();
  });

  it('creates admin + project + key + session atomically; full key shown once', async () => {
    const t = await makeApp();
    const { cookie, body } = await onboard(t);
    expect(body.project).toMatchObject({ name: 'App' });
    expect(body.apiKey.key).toMatch(/^jf_[0-9A-Za-z]{40}$/);
    expect(body.apiKey.keyPrefix).toBe(body.apiKey.key.slice(0, 12));

    // Auto-logged in.
    const me = await t.app.inject({ method: 'GET', url: '/api/admin/me', headers: { cookie } });
    expect(me.statusCode).toBe(204);

    // The freshly issued key immediately authorizes the client API.
    const fb = await t.app.inject({
      method: 'POST',
      url: '/api/v1/feedback',
      headers: { 'x-api-key': body.apiKey.key },
      payload: { content: 'hello' },
    });
    expect(fb.statusCode).toBe(201);
    await t.app.close();
  });

  it('never stores the password in plaintext', async () => {
    const t = await makeApp();
    await onboard(t, { password: 'sup3rSecret!', project: null });
    const row = t.db.prepare('SELECT password_hash FROM admin_credentials WHERE id = 1').get() as {
      password_hash: string;
    };
    expect(row.password_hash).not.toContain('sup3rSecret!');
    expect(row.password_hash).toMatch(/^scrypt\$v=1\$/);
    await t.app.close();
  });

  it('env bootstrap: body password is ignored, env hash is used for login', async () => {
    const t = await makeApp({ adminPassword: 'envpassword' });
    // No password in body (project skipped).
    await onboard(t, { project: null });
    // Login with the env password works.
    const ok = await t.app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'envpassword' },
    });
    expect(ok.statusCode).toBe(204);
    // A password sent in the body must not become the credential.
    const t2 = await makeApp({ adminPassword: 'envpassword' });
    await onboard(t2, { password: 'attackerpassword', project: null });
    const bad = await t2.app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'attackerpassword' },
    });
    expect(bad.statusCode).toBe(401);
    await t.app.close();
    await t2.app.close();
  });

  it('"skip project" creates only admin + session', async () => {
    const t = await makeApp();
    const { body } = await onboard(t, { password: 'password123', project: null });
    expect(body.project).toBeNull();
    expect(body.apiKey).toBeNull();
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM projects').get()).toEqual({ n: 0 });
    await t.app.close();
  });

  it('rolls back fully when the project payload is invalid', async () => {
    const t = await makeApp();
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/admin/setup',
      headers: { 'x-setup-token': SETUP_TOKEN },
      payload: { password: 'password123', project: { name: '', keyLabel: 'x' } },
    });
    expect(res.statusCode).toBe(400);
    // Nothing persisted; token still valid for a retry.
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM admin_credentials').get()).toEqual({ n: 0 });
    expect(t.state.setupToken).toBe(SETUP_TOKEN);
    const retry = await onboard(t, { password: 'password123', project: null });
    expect(retry.body.project).toBeNull();
    await t.app.close();
  });

  it('two concurrent valid setups: one 201, one 409, single admin', async () => {
    const t = await makeApp();
    const call = () =>
      t.app.inject({
        method: 'POST',
        url: '/api/admin/setup',
        headers: { 'x-setup-token': SETUP_TOKEN },
        payload: { password: 'password123', project: null },
      });
    const [a, b] = await Promise.all([call(), call()]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([201, 409]);
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM admin_credentials').get()).toEqual({ n: 1 });
    await t.app.close();
  });

  it('setup is closed after completion (409) and token is burned', async () => {
    const t = await makeApp();
    await onboard(t, { password: 'password123', project: null });
    expect(t.state.setupToken).toBeNull();
    const again = await t.app.inject({
      method: 'POST',
      url: '/api/admin/setup',
      headers: { 'x-setup-token': SETUP_TOKEN },
      payload: { password: 'password123' },
    });
    expect(again.statusCode).toBe(409);
    const status = await t.app.inject({ method: 'GET', url: '/api/admin/setup/status' });
    expect(status.json()).toEqual({ setupRequired: false, passwordRequired: false });
    await t.app.close();
  });

  it('protected admin endpoints require a session', async () => {
    const t = await makeApp();
    await onboard(t, { password: 'password123', project: null });
    const res = await t.app.inject({ method: 'GET', url: '/api/admin/projects' });
    expect(res.statusCode).toBe(401);
    await t.app.close();
  });
});
