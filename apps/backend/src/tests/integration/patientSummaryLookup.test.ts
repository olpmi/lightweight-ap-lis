import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';

describe('Patient summary lookup endpoint', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET ??= 'test-session-secret';
  });

  it('returns a normalized patient summary definition', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/lookups/patient-summary-definition')
      .query({ templateId: 'general_cytology', language: 'sw' });

    expect(res.status).toBe(200);
    expect(res.body.data.templateId).toBe('general_cytology');
    expect(res.body.data.language).toBe('sw');
    expect(res.body.data.triggerFields).toContain('diagnostic_category');
    expect(res.body.data.rules[0].match.diagnostic_category.equals).toContain('Non-diagnostic / Unsatisfactory');
  });

  it('resolves the Swahili fluid summary under the canonical template id', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/lookups/patient-summary-definition')
      .query({ templateId: 'fluid_cytology_international_system_serous_fluid', language: 'sw' });

    expect(res.status).toBe(200);
    expect(res.body.data.templateId).toBe('fluid_cytology_international_system_serous_fluid');
    expect(res.body.data.language).toBe('sw');
    expect(res.body.data.system).toContain('Majimaji ya Serous');
    expect(res.body.data.triggerFields).toContain('diagnostic_category');
  });
});