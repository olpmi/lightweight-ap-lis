import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app';

// These are integration tests that require a live test database.
// They are intentionally narrow — testing auth endpoints only.
// Skip if DATABASE_URL is not set.

const hasDb = Boolean(process.env.DATABASE_URL && process.env.SESSION_SECRET);

describe.skipIf(!hasDb)('Auth endpoints', () => {
  const app = createApp();

  it('GET /api/auth/me returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
