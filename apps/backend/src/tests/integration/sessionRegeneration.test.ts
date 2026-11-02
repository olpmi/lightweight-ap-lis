/**
 * Login must issue a fresh session ID. Before this guard, logging in on an
 * existing session kept its ID, so a session fixed in the browser before
 * authentication would have been promoted into an authenticated one.
 *
 * Skipped unless DATABASE_URL + SESSION_SECRET are set, matching the other
 * integration suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { EMPLOYEE_ROLES } from '@lis/shared';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createEmployeeAndLogin } from '../helpers/auth.js';

const hasDb = Boolean(process.env.DATABASE_URL && process.env.SESSION_SECRET);

function sessionId(res: request.Response): string | undefined {
  const cookies = res.headers['set-cookie'] as string[] | string | undefined;
  const joined = Array.isArray(cookies) ? cookies.join(';') : (cookies ?? '');
  return joined.match(/connect\.sid=([^;]+)/)?.[1];
}

describe.skipIf(!hasDb)('Login regenerates the session', () => {
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const app = createApp();
  const agent = request.agent(app);
  let employeeId = 0;

  beforeAll(async () => {
    ({ employeeId } = await createEmployeeAndLogin(agent, EMPLOYEE_ROLES.PATHOLOGIST, `zzsess_${nonce}`));
  });

  afterAll(async () => {
    await prisma.employee.deleteMany({ where: { employeeId } });
  });

  it('issues a different session cookie on each login and keeps the caller signed in', async () => {
    const first = await agent.post('/api/auth/login').send({ employeeId });
    const second = await agent.post('/api/auth/login').send({ employeeId });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(sessionId(first)).toBeTruthy();
    expect(sessionId(second)).toBeTruthy();
    expect(sessionId(second)).not.toBe(sessionId(first));

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.employeeId).toBe(employeeId);
  });
});
