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
    expect(res.body.data.rules[0].match.diagnostic_category.equals).toContain('general_non_diagnostic_unsatisfactory');
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

  it('returns rules for the histology_rule_based family', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/lookups/patient-summary-definition')
      .query({ templateId: 'patient_summaries.histology', language: 'sw' });

    expect(res.status).toBe(200);
    expect(res.body.data.templateId).toBe('patient_summaries.histology');
    expect(res.body.data.language).toBe('sw');
    expect(res.body.data.family).toBe('histology_rule_based');
    expect(res.body.data.triggerFields).toContain('diagnosis_key');
    expect(res.body.data.rules.length).toBeGreaterThan(0);

    const invasiveRule = (res.body.data.rules as Array<{ ruleId: string; match: Record<string, { equals: string[] }>; plainLanguageSummary: string; patientTitle: string }>)
      .find((r) => r.ruleId === 'invasive_carcinoma_of_no_special_type_ductal');
    expect(invasiveRule).toBeDefined();
    expect(invasiveRule?.match.diagnosis_key.equals).toContain('invasive_carcinoma_of_no_special_type_ductal');
    expect(invasiveRule?.plainLanguageSummary.length).toBeGreaterThan(0);
    expect(invasiveRule?.patientTitle.length).toBeGreaterThan(0);
  });

  it('histology_rule_based English definition produces rules with expanded sentence blocks', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/lookups/patient-summary-definition')
      .query({ templateId: 'patient_summaries.histology', language: 'en' });

    expect(res.status).toBe(200);
    // {biopsy_limited_sample} token should be expanded — no raw { } tokens remaining in invasive biopsy rule
    const invasiveRule = (res.body.data.rules as Array<{ ruleId: string; plainLanguageSummary: string }>)
      .find((r) => r.ruleId === 'invasive_carcinoma_of_no_special_type_ductal');
    expect(invasiveRule?.plainLanguageSummary).not.toMatch(/\{[^}]+\}/);
    expect(invasiveRule?.plainLanguageSummary).toContain('breast');
  });
});