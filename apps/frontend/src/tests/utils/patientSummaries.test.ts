import { describe, expect, it } from 'vitest';
import { resolvePatientSummary, type PatientSummaryDefinition } from '@lis/shared';

describe('resolvePatientSummary', () => {
  it('matches rules against section-qualified structured payload keys', () => {
    const definition: PatientSummaryDefinition = {
      templateId: 'general_cytology',
      family: 'general_cytology',
      relativeDir: 'patient_summaries/general_cytology',
      language: 'en',
      availableLanguages: ['en'],
      summaryType: 'rule_based_patient_facing_summary',
      system: 'General Cytology Reporting Template',
      triggerFields: ['diagnostic_category'],
      rules: [
        {
          ruleId: 'general_positive_for_malignancy',
          match: {
            diagnostic_category: {
              equals: ['Positive for malignancy'],
              includes: [],
            },
          },
          professionalLabel: 'Positive for malignancy',
          patientTitle: 'Cancer cells identified',
          plainLanguageSummary: 'The sample shows malignant cells.',
          whatThisMeans: 'This result requires clinical follow-up.',
          possibleNextSteps: 'Your doctor may arrange more tests.',
          safetyNote: 'Discuss the full report with your doctor.',
        },
      ],
    };

    const resolved = resolvePatientSummary(definition, {
      'diagnostic_category.diagnostic_category': 'Positive for malignancy',
    });

    expect(resolved?.ruleId).toBe('general_positive_for_malignancy');
  });
});