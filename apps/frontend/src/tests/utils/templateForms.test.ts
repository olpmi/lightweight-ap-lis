import { describe, expect, it } from 'vitest';
import {
  normalizeTemplateDefinition,
  parseStructuredTemplatePayload,
  renderStructuredTemplateText,
  resolveTemplateFormValues,
  serializeStructuredTemplatePayload,
  type RawTemplateDefinition,
} from '../../utils/templateForms';

describe('templateForms', () => {
  it('normalizes and renders flat templates', () => {
    const definition: RawTemplateDefinition = {
      templateKey: 'breast-reporting-en',
      templateId: 'breast_reporting',
      family: 'breast',
      title: 'Breast Reporting',
      kind: 'reporting',
      language: 'en',
      schemaStyle: 'flat',
      availableLanguages: ['en', 'sw'],
      core: {
        sections: [
          {
            id: 'specimen',
            title: 'Specimen',
            fields: [
              {
                id: 'procedure',
                label: 'Procedure',
                type: 'select',
                options: ['biopsy', 'resection'],
              },
              {
                id: 'size',
                label: 'Size',
                type: 'text',
              },
            ],
          },
        ],
      },
      translation: {
        sections: {
          specimen: 'Specimen',
        },
        fields: {
          procedure: 'Procedure',
          size: 'Size',
        },
        options: {
          biopsy: 'Biopsy',
          resection: 'Resection',
        },
      },
    };

    const normalized = normalizeTemplateDefinition(definition);
    const values = resolveTemplateFormValues(normalized, {
      'specimen.procedure': 'biopsy',
      'specimen.size': '2 cm',
    });

    expect(renderStructuredTemplateText(normalized, values)).toBe([
      'SPECIMEN',
      'Procedure: Biopsy',
      'Size: 2 cm',
    ].join('\n'));

    const payload = parseStructuredTemplatePayload(serializeStructuredTemplatePayload(normalized, 'en', values));
    expect(payload?.templateKey).toBe('breast-reporting-en');
    expect(payload?.values).toEqual(values);
  });

  it('normalizes and renders nested templates with groups', () => {
    const definition: RawTemplateDefinition = {
      templateKey: 'colon-gross-en',
      templateId: 'colon_gross',
      family: 'gi',
      title: 'Colon Gross',
      kind: 'gross',
      language: 'en',
      schemaStyle: 'nested',
      availableLanguages: ['en', 'sw'],
      core: {
        template_id: 'colon_gross',
        lang: 'en',
        specimen: {
          label: 'Specimen',
          fields: {
            received_in: {
              label: 'Received In',
              type: 'select',
              options: ['formalin', 'fresh'],
            },
            measurements: {
              label: 'Measurements',
              fields: {
                length: {
                  label: 'Length',
                  type: 'text',
                },
                width: {
                  label: 'Width',
                  type: 'text',
                },
              },
            },
          },
        },
      },
      translation: {
        specimen: {
          label: 'Specimen',
          fields: {
            received_in: {
              label: 'Received In',
              options: ['Formalin', 'Fresh'],
            },
            measurements: {
              label: 'Measurements',
              fields: {
                length: {
                  label: 'Length',
                },
                width: {
                  label: 'Width',
                },
              },
            },
          },
        },
      },
    };

    const normalized = normalizeTemplateDefinition(definition);
    const values = resolveTemplateFormValues(normalized, {
      'specimen.received_in': 'formalin',
      'specimen.measurements.length': '5 cm',
      'specimen.measurements.width': '3 cm',
    });

    expect(renderStructuredTemplateText(normalized, values)).toBe([
      'SPECIMEN',
      'Received In: Formalin',
      'Measurements:',
      '  Length: 5 cm',
      '  Width: 3 cm',
    ].join('\n'));
  });

  it('translates supplemental nested fields when overlays provide labels', () => {
    const definition: RawTemplateDefinition = {
      templateKey: 'breast-gross-sw',
      templateId: 'breast_gross',
      family: 'breast',
      title: 'Breast Gross',
      kind: 'gross',
      language: 'sw',
      schemaStyle: 'nested',
      availableLanguages: ['en', 'sw'],
      core: {
        template_id: 'breast_gross',
        lang: 'en',
        specimen: {
          label: 'Specimen',
          fields: {
            intraoperative_consult: {
              label: 'Intraoperative consultation performed',
              type: 'select',
              options: ['Yes', 'No'],
              value: '',
              reason: '',
            },
          },
        },
      },
      translation: {
        specimen: {
          label: 'Kipande cha upasuaji',
          fields: {
            intraoperative_consult: {
              label: 'Ushauri wa ndani ya upasuaji ulifanyika',
              options: ['Ndiyo', 'Hapana'],
              reason: 'Sababu',
            },
          },
        },
      },
    };

    const normalized = normalizeTemplateDefinition(definition);
    const values = resolveTemplateFormValues(normalized, {
      'specimen.intraoperative_consult': 'No',
      'specimen.intraoperative_consult.reason': 'Hakuna hitaji',
    });

    expect(renderStructuredTemplateText(normalized, values)).toBe([
      'KIPANDE CHA UPASUAJI',
      'Ushauri wa ndani ya upasuaji ulifanyika: Hapana',
      'Sababu: Hakuna hitaji',
    ].join('\n'));
  });

  it('renders localized boolean values for nested templates', () => {
    const definition: RawTemplateDefinition = {
      templateKey: 'breast-gross-fr',
      templateId: 'breast_gross',
      family: 'breast',
      title: 'Breast Gross',
      kind: 'gross',
      language: 'fr',
      schemaStyle: 'nested',
      availableLanguages: ['en', 'fr'],
      core: {
        template_id: 'breast_gross',
        lang: 'en',
        skin: {
          label: 'Skin',
          fields: {
            present: {
              label: 'Skin present',
              type: 'boolean',
              value: '',
            },
          },
        },
      },
      translation: {
        skin: {
          label: 'Peau',
          fields: {
            present: {
              label: 'Peau présente',
            },
          },
        },
      },
    };

    const normalized = normalizeTemplateDefinition(definition);
    const values = resolveTemplateFormValues(normalized, {
      'skin.present': 'yes',
    });

    expect(renderStructuredTemplateText(normalized, values)).toBe([
      'PEAU',
      'Peau présente: Oui',
    ].join('\n'));
  });
});