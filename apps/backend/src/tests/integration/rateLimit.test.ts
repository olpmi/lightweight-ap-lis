/**
 * Rate-limit integration test for POST /api/auth/login.
 *
 * The limiter is configured to skip when NODE_ENV !== 'production', so we
 * temporarily flip NODE_ENV inside the test (the limiter reads process.env
 * on every request via its `skip` callback). We mount auth.routes against a
 * minimal Express app that does NOT start a session store or hit the
 * database — login simply returns 401 from the schema before reaching the
 * service. That's enough to exercise the limiter, which sits in front of
 * validateBody.
 *
 * NOTE: express-rate-limit needs a Store; the default in-memory MemoryStore
 * is fine here because each test file gets a fresh process. The 21st
 * request returns 429.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';

let app: express.Application;
let prevNodeEnv: string | undefined;

beforeAll(async () => {
  prevNodeEnv = process.env.NODE_ENV;
  // Flip BEFORE importing auth.routes so the rate limiter is created with the
  // production skip-callback evaluating to false.
  process.env.NODE_ENV = 'production';

  const { default: authRoutes } = await import('../../routes/auth.routes.js');

  app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/auth', authRoutes);
});

afterAll(() => {
  if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = prevNodeEnv;
});

describe('Login rate limiter', () => {
  it('returns 429 after exceeding the per-IP limit', async () => {
    // The limiter cap is 20 attempts per 15 min per IP. Send 20 invalid
    // logins (each will be a 4xx from validation/service); the 21st should
    // be a 429 short-circuit from the limiter.
    let lastSuccessfulPreLimitStatus = 0;
    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ userName: `nope_${i}` });
      lastSuccessfulPreLimitStatus = res.status;
      expect(res.status).not.toBe(429);
    }
    // Confirm we were getting non-429 responses (the limiter wasn't tripped early).
    expect(lastSuccessfulPreLimitStatus).not.toBe(429);

    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ userName: 'nope_overflow' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});
