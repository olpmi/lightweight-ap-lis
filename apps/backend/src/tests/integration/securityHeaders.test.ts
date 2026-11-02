/**
 * helmet's content-security policy is on for the API as a whole and off for
 * responses that carry a PDF, where it has no meaning and some viewers honour
 * it. The health route stands in for any JSON response.
 *
 * Needs SESSION_SECRET (createApp refuses to start without it); the PDF side is
 * covered by the pdfResponse unit test and the route wiring.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';

describe.skipIf(!process.env.SESSION_SECRET)('Security headers', () => {
  it('sends a content-security policy with JSON responses', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(res.headers['content-security-policy']).not.toMatch(/upgrade-insecure-requests/);
  });
});
