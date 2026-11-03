/**
 * Cross-site request forgery defence end to end: login issues the session's
 * token, /me hands it back, state-changing requests need it, and a request a
 * browser labels as cross-site is refused before any of that.
 *
 * POST /api/auth/logout stands in for any state-changing route: it needs a
 * session and leaves nothing behind but a destroyed one.
 *
 * Skipped unless DATABASE_URL + SESSION_SECRET are set, matching the other
 * integration suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { EMPLOYEE_ROLES } from '@lis/shared';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { ensureRole } from '../helpers/auth.js';

const hasDb = Boolean(process.env.DATABASE_URL && process.env.SESSION_SECRET);

describe.skipIf(!hasDb)('CSRF protection', () => {
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const app = createApp();
  let employeeId = 0;

  async function login(agent: ReturnType<typeof request.agent>): Promise<string> {
    const res = await agent.post('/api/auth/login').send({ employeeId });
    expect(res.status).toBe(200);
    return res.body.data.csrfToken as string;
  }

  beforeAll(async () => {
    const employeeRoleId = await ensureRole(EMPLOYEE_ROLES.PATHOLOGIST);
    const employee = await prisma.employee.create({
      data: { firstName: 'Csrf', lastName: 'Probe', userName: `zzcsrf_${nonce}`, employeeRoleId },
    });
    employeeId = Number(employee.employeeId);
  });

  afterAll(async () => {
    await prisma.employee.deleteMany({ where: { employeeId } });
  });

  it('issues a token at login and returns the same one from /me', async () => {
    const agent = request.agent(app);
    const token = await login(agent);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.csrfToken).toBe(token);
  });

  it('refuses a signed-in state-changing request without the token', async () => {
    const agent = request.agent(app);
    await login(agent);

    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');

    // The session survived the refusal.
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });

  it('refuses a wrong token', async () => {
    const agent = request.agent(app);
    await login(agent);

    const res = await agent.post('/api/auth/logout').set('x-csrf-token', 'not-the-token');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('accepts the token in X-CSRF-Token', async () => {
    const agent = request.agent(app);
    const token = await login(agent);

    const res = await agent.post('/api/auth/logout').set('x-csrf-token', token);
    expect(res.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('refuses a request from another origin even when it carries the token', async () => {
    const agent = request.agent(app);
    const token = await login(agent);

    const res = await agent
      .post('/api/auth/logout')
      .set('x-csrf-token', token)
      .set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });

  it('accepts a request the browser labels same-origin', async () => {
    const agent = request.agent(app);
    const token = await login(agent);

    const res = await agent
      .post('/api/auth/logout')
      .set('x-csrf-token', token)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('Origin', 'https://whatever.example');
    expect(res.status).toBe(200);
  });

  it('refuses a cross-site login attempt and sets no session', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ employeeId });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('leaves anonymous state-changing requests to the auth guard (401, not 403)', async () => {
    const res = await request(app).post('/api/orders/1/reactivate').send({});
    expect(res.status).toBe(401);
  });
});
