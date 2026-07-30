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
    // Rules must match the value the structured template actually stores — the
    // option string — not the rule's own id. The definitions previously carried
    // no `match` block, so normalizeRuleMatch fell back to comparing the payload
    // value against the ruleId, which no real report could ever satisfy.
    expect(res.body.data.rules[0].match.diagnostic_category.equals).toContain('Non-diagnostic / Unsatisfactory');
  });

  it('resolves the Swahili fluid summary under the canonical template id', async () => {
    const app = createApp();
    // The canonical id is the one the fluid_cytology template itself declares and
    // therefore the one structured payloads carry.
    const res = await request(app)
      .get('/api/lookups/patient-summary-definition')
      .query({ templateId: 'fluid_cytology_international_serous_fluid', language: 'sw' });

    expect(res.status).toBe(200);
    expect(res.body.data.templateId).toBe('fluid_cytology_international_serous_fluid');
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

  /**
   * Regression guard for the defect this suite previously locked in.
   *
   * Every cytology definition shipped without a `match` block, so
   * normalizeRuleMatch fell back to `{ triggerField: { equals: [ruleId] } }`.
   * Structured templates store the option string (or the option `code` for
   * object-valued options), never the snake_case rule id, so no report created
   * through the application ever produced a patient summary. Asserting that no
   * rule matches on its own id keeps the definitions honest.
   *
   * `patient_summaries.histology` is excluded. It uses the template_groups /
   * diagnosis_key_map layout, where the rule id deliberately *is* the stored
   * diagnosis key. That family has a separate unresolved problem — its
   * `diagnosis_key` trigger has no corresponding field in the histology
   * templates, which use a nested schema — so it is not covered by this
   * invariant and needs its own investigation.
   */
  const HISTOLOGY_RULE_BASED_TEMPLATE_ID = 'patient_summaries.histology';

  it('no cytology rule matches on its own id, which no structured payload could satisfy', async () => {
    const app = createApp();
    const catalogRes = await request(app).get('/api/lookups/patient-summary-catalog');
    expect(catalogRes.status).toBe(200);

    const templateIds = (catalogRes.body.data as Array<{ templateId: string }>)
      .map((entry) => entry.templateId)
      .filter((templateId) => templateId !== HISTOLOGY_RULE_BASED_TEMPLATE_ID);
    expect(templateIds.length).toBeGreaterThan(0);

    const offenders: string[] = [];

    for (const templateId of templateIds) {
      const res = await request(app)
        .get('/api/lookups/patient-summary-definition')
        .query({ templateId, language: 'en' });
      expect(res.status).toBe(200);

      const rules = res.body.data.rules as Array<{
        ruleId: string;
        match: Record<string, { equals: string[]; includes: string[] }>;
      }>;
      expect(rules.length).toBeGreaterThan(0);

      for (const rule of rules) {
        const fields = Object.entries(rule.match);
        // A rule with no match criteria can never fire.
        if (fields.length === 0) {
          offenders.push(`${templateId}/${rule.ruleId} (no match criteria)`);
          continue;
        }
        for (const [fieldId, criteria] of fields) {
          const values = [...(criteria.equals ?? []), ...(criteria.includes ?? [])];
          if (values.includes(rule.ruleId)) {
            offenders.push(`${templateId}/${rule.ruleId} (matches own id on ${fieldId})`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});