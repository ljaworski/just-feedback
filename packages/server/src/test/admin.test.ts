import { describe, it, expect } from 'vitest';
import { makeApp, onboard, type TestApp } from './helpers';

async function seeded(): Promise<{ t: TestApp; cookie: string; apiKey: string; projectId: string }> {
  const t = await makeApp();
  const { cookie, body } = await onboard(t);
  return { t, cookie, apiKey: body.apiKey.key, projectId: body.project.id };
}

async function postFeedback(t: TestApp, apiKey: string, content: string, metadata?: object) {
  return t.app.inject({
    method: 'POST',
    url: '/api/v1/feedback',
    headers: { 'x-api-key': apiKey },
    payload: { content, ...(metadata ? { metadata } : {}) },
  });
}

describe('admin auth', () => {
  it('login / logout lifecycle', async () => {
    const { t, cookie } = await seeded();
    // logout kills the session
    const out = await t.app.inject({ method: 'POST', url: '/api/admin/logout', headers: { cookie } });
    expect(out.statusCode).toBe(204);
    const me = await t.app.inject({ method: 'GET', url: '/api/admin/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
    // fresh login
    const ok = await t.app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'password123' },
    });
    expect(ok.statusCode).toBe(204);
    const bad = await t.app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'wrong' },
    });
    expect(bad.statusCode).toBe(401);
    await t.app.close();
  });
});

describe('projects', () => {
  it('create, list with counts, rename, cascade delete', async () => {
    const { t, cookie, apiKey, projectId } = await seeded();
    await postFeedback(t, apiKey, 'one');
    await postFeedback(t, apiKey, 'two');

    const list = await t.app.inject({ method: 'GET', url: '/api/admin/projects', headers: { cookie } });
    expect(list.json()[0]).toMatchObject({ id: projectId, newCount: 2, totalCount: 2 });

    const created = await t.app.inject({
      method: 'POST',
      url: '/api/admin/projects',
      headers: { cookie },
      payload: { name: 'Second' },
    });
    expect(created.statusCode).toBe(201);

    const renamed = await t.app.inject({
      method: 'PATCH',
      url: `/api/admin/projects/${projectId}`,
      headers: { cookie },
      payload: { name: 'Renamed' },
    });
    expect(renamed.json().name).toBe('Renamed');

    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/admin/projects/${projectId}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
    // feedbacks + keys cascade away
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM feedbacks').get()).toEqual({ n: 0 });
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM api_keys').get()).toEqual({ n: 0 });
    await t.app.close();
  });

  it('404 on unknown project', async () => {
    const { t, cookie } = await seeded();
    const res = await t.app.inject({
      method: 'PATCH',
      url: '/api/admin/projects/nope',
      headers: { cookie },
      payload: { name: 'x' },
    });
    expect(res.statusCode).toBe(404);
    await t.app.close();
  });
});

describe('feedback lifecycle', () => {
  it('full status cycle: new -> read -> archived -> restored -> deleted', async () => {
    const { t, cookie, apiKey, projectId } = await seeded();
    await postFeedback(t, apiKey, 'hello', {
      appVersion: '2.1.0',
      platform: 'ios',
      osVersion: '17.4',
      deviceModel: 'iPhone 15',
      userRef: 'user@example.com',
    });

    let active = await t.app.inject({
      method: 'GET',
      url: `/api/admin/projects/${projectId}/feedbacks?status=active`,
      headers: { cookie },
    });
    expect(active.json().total).toBe(1);
    const fbId = active.json().items[0].id;
    expect(active.json().items[0]).toMatchObject({
      status: 'new',
      appVersion: '2.1.0',
      platform: 'ios',
      userRef: 'user@example.com',
    });

    // new -> read
    await t.app.inject({
      method: 'PATCH',
      url: `/api/admin/feedbacks/${fbId}`,
      headers: { cookie },
      payload: { status: 'read' },
    });
    // read -> archived
    await t.app.inject({
      method: 'PATCH',
      url: `/api/admin/feedbacks/${fbId}`,
      headers: { cookie },
      payload: { status: 'archived' },
    });
    active = await t.app.inject({
      method: 'GET',
      url: `/api/admin/projects/${projectId}/feedbacks?status=active`,
      headers: { cookie },
    });
    expect(active.json().total).toBe(0);
    const archived = await t.app.inject({
      method: 'GET',
      url: `/api/admin/projects/${projectId}/feedbacks?status=archived`,
      headers: { cookie },
    });
    expect(archived.json().total).toBe(1);

    // archived -> read (restore)
    await t.app.inject({
      method: 'PATCH',
      url: `/api/admin/feedbacks/${fbId}`,
      headers: { cookie },
      payload: { status: 'read' },
    });
    // delete
    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/admin/feedbacks/${fbId}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM feedbacks').get()).toEqual({ n: 0 });
    await t.app.close();
  });

  it('mark-all-read flips only new feedbacks', async () => {
    const { t, cookie, apiKey, projectId } = await seeded();
    await postFeedback(t, apiKey, 'a');
    await postFeedback(t, apiKey, 'b');
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/admin/projects/${projectId}/feedbacks/mark-all-read`,
      headers: { cookie },
    });
    expect(res.json()).toEqual({ updated: 2 });
    const again = await t.app.inject({
      method: 'POST',
      url: `/api/admin/projects/${projectId}/feedbacks/mark-all-read`,
      headers: { cookie },
    });
    expect(again.json()).toEqual({ updated: 0 });
    await t.app.close();
  });

  it('feedback patch validates status enum', async () => {
    const { t, cookie, apiKey, projectId } = await seeded();
    await postFeedback(t, apiKey, 'x');
    const id = (
      await t.app.inject({
        method: 'GET',
        url: `/api/admin/projects/${projectId}/feedbacks`,
        headers: { cookie },
      })
    ).json().items[0].id;
    const res = await t.app.inject({
      method: 'PATCH',
      url: `/api/admin/feedbacks/${id}`,
      headers: { cookie },
      payload: { status: 'new' },
    });
    expect(res.statusCode).toBe(400);
    await t.app.close();
  });
});
