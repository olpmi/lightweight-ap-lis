import type {
  AppLanguageCode,
  TemplateDefinition,
  TemplateKind,
  TemplateSchemaStyle,
} from '@lis/shared';

type RawTemplateRecord = Record<string, unknown>;

export type TemplateFormValue = string | string[];
export type TemplateFormValues = Record<string, TemplateFormValue>;

type TemplateInputType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multi_select' | 'boolean';

interface NormalizedTemplateOption {
  value: string;
  label: string;
}

export interface NormalizedTemplateField {
  path: string;
  fieldId: string;
  label: string;
  kind: 'field' | 'group';
  inputType?: TemplateInputType;
  options?: NormalizedTemplateOption[];
  defaultValue: TemplateFormValue;
  children?: NormalizedTemplateField[];
}

export interface NormalizedTemplateSection {
  id: string;
  title: string;
  fields: NormalizedTemplateField[];
}

export interface NormalizedTemplateDefinition {
  templateKey: string;
  templateId: string;
  title: string;
  kind: TemplateKind;
  language: AppLanguageCode;
  schemaStyle: TemplateSchemaStyle;
  sections: NormalizedTemplateSection[];
}

export interface StructuredTemplatePayload {
  version: 1;
  templateKey: string;
  templateId: string;
  title: string;
  kind: TemplateKind;
  language: AppLanguageCode;
  values: TemplateFormValues;
}

export type RawTemplateDefinition = TemplateDefinition<RawTemplateRecord, RawTemplateRecord>;

const TEMPLATE_METADATA_KEYS = new Set([
  'templateId',
  'templateName',
  'language',
  'template_id',
  'lang',
  'domain',
  'title',
  'protocol_posting_date',
]);

const FIELD_METADATA_KEYS = new Set(['id', 'label', 'type', 'options', 'value', 'default', 'fields', 'reference_note']);

const BOOLEAN_OPTION_LABELS: Record<AppLanguageCode, { yes: string; no: string }> = {
  en: { yes: 'Yes', no: 'No' },
  sw: { yes: 'Ndiyo', no: 'Hapana' },
  fr: { yes: 'Oui', no: 'Non' },
  ar: { yes: 'نعم', no: 'لا' },
  ur: { yes: 'ہاں', no: 'نہیں' },
};

const BOOLEAN_TRUE_ALIASES = new Set(['yes', 'true', '1', 'oui', 'ndiyo', 'نعم', 'ہاں']);
const BOOLEAN_FALSE_ALIASES = new Set(['no', 'false', '0', 'non', 'hapana', 'لا', 'نہیں']);

function asRecord(value: unknown): RawTemplateRecord | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RawTemplateRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeBooleanValue(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return 'yes';
    }
    if (value === 0) {
      return 'no';
    }
    return '';
  }

  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  if (BOOLEAN_TRUE_ALIASES.has(normalized)) {
    return 'yes';
  }

  if (BOOLEAN_FALSE_ALIASES.has(normalized)) {
    return 'no';
  }

  return value;
}

function createBooleanOptions(language: AppLanguageCode): NormalizedTemplateOption[] {
  const labels = BOOLEAN_OPTION_LABELS[language] ?? BOOLEAN_OPTION_LABELS.en;
  return [
    { value: 'yes', label: labels.yes },
    { value: 'no', label: labels.no },
  ];
}

function humanize(value: string): string {
  return value
    .replace(/[._]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function normalizeOptionEntries(
  optionsValue: unknown,
  translatedOptionsValue: unknown,
  language: AppLanguageCode,
): NormalizedTemplateOption[] {
  const translatedOptionsRecord = asRecord(translatedOptionsValue) ?? {};
  const translatedOptionsList = asArray(translatedOptionsValue);

  return asArray(optionsValue).flatMap((entry, index) => {
    if (typeof entry === 'string') {
      const translatedLabel = asString(translatedOptionsRecord[entry], asString(translatedOptionsList[index], entry));
      return [{ value: entry, label: translatedLabel || entry }];
    }

    const optionRecord = asRecord(entry);
    if (!optionRecord) {
      return [];
    }

    const value = asString(optionRecord.code, asString(optionRecord.value));
    if (!value) {
      return [];
    }

    const defaultLabel = asString(optionRecord.label, humanize(value));
    const translatedLabel = asString(
      translatedOptionsRecord[value],
      asString(translatedOptionsList[index], defaultLabel),
    );

    return [{ value, label: translatedLabel || defaultLabel }];
  });
}

function normalizeInputType(value: unknown): TemplateInputType {
  const normalized = asString(value, 'text').toLowerCase();
  if (normalized === 'textarea' || normalized === 'number' || normalized === 'select' || normalized === 'boolean') {
    return normalized;
  }
  if (normalized === 'multiselect' || normalized === 'multi_select') {
    return 'multi_select';
  }
  if (normalized === 'date') {
    return 'date';
  }
  return 'text';
}

function toFormValue(value: unknown, inputType: TemplateInputType): TemplateFormValue {
  if (inputType === 'boolean') {
    return normalizeBooleanValue(value);
  }

  if (inputType === 'multi_select') {
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === 'string');
    }
    if (typeof value === 'string' && value.length > 0) {
      return [value];
    }
    return [];
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return typeof value === 'string' ? value : '';
}

function deriveDefaultValue(fieldRecord: RawTemplateRecord, inputType: TemplateInputType, overrideDefault?: unknown): TemplateFormValue {
  if (overrideDefault !== undefined) {
    return toFormValue(overrideDefault, inputType);
  }

  if ('default' in fieldRecord) {
    return toFormValue(fieldRecord.default, inputType);
  }

  if ('value' in fieldRecord) {
    return toFormValue(fieldRecord.value, inputType);
  }

  return inputType === 'multi_select' ? [] : '';
}

function resolveSupplementalLabel(translationRecord: RawTemplateRecord, key: string): string {
  const translatedValue = translationRecord[key];
  if (typeof translatedValue === 'string' && translatedValue.trim().length > 0) {
    return translatedValue;
  }

  const translatedRecord = asRecord(translatedValue);
  return asString(translatedRecord?.label, humanize(key));
}

function createSupplementalFields(
  fieldRecord: RawTemplateRecord,
  basePath: string,
  translationRecord: RawTemplateRecord = {}
): NormalizedTemplateField[] {
  return Object.entries(fieldRecord)
    .filter(([key, value]) => !FIELD_METADATA_KEYS.has(key) && (typeof value === 'string' || typeof value === 'number' || Array.isArray(value)))
    .map(([key, value]) => {
      const inputType: TemplateInputType = Array.isArray(value)
        ? 'multi_select'
        : typeof value === 'number'
          ? 'number'
          : 'text';

      return {
        path: `${basePath}.${key}`,
        fieldId: key,
        label: resolveSupplementalLabel(translationRecord, key),
        kind: 'field' as const,
        inputType,
        defaultValue: toFormValue(value, inputType),
      };
    });
}

function normalizeFlatField(
  fieldRecord: RawTemplateRecord,
  sectionId: string,
  translationFieldRecord: RawTemplateRecord,
  translatedFields: RawTemplateRecord,
  translatedOptions: RawTemplateRecord,
  translatedDefaults: RawTemplateRecord,
  language: AppLanguageCode,
): NormalizedTemplateField[] {
  const fieldId = asString(fieldRecord.id, 'field');
  const inputType = normalizeInputType(fieldRecord.type);
  const path = `${sectionId}.${fieldId}`;
  const options = inputType === 'boolean'
    ? createBooleanOptions(language)
    : normalizeOptionEntries(fieldRecord.options, translationFieldRecord.options ?? translatedOptions, language);

  return [
    {
      path,
      fieldId,
      label: asString(
        translationFieldRecord.label,
        asString(translatedFields[fieldId], asString(fieldRecord.label, humanize(fieldId))),
      ),
      kind: 'field',
      inputType,
      options,
      defaultValue: deriveDefaultValue(
        fieldRecord,
        inputType,
        translationFieldRecord.default ?? translationFieldRecord.value ?? translatedDefaults[fieldId],
      ),
    },
    ...createSupplementalFields(fieldRecord, path, translationFieldRecord),
  ];
}

function normalizeFlatTemplate(definition: RawTemplateDefinition): NormalizedTemplateDefinition {
  const core = definition.core;
  const translation = definition.translation ?? {};
  const translatedSections = asRecord(translation.sections) ?? {};
  const translatedFields = asRecord(translation.fields) ?? {};
  const translatedOptions = asRecord(translation.options) ?? {};
  const translatedDefaults = asRecord(translation.defaults) ?? {};
  const sections = asArray(core.sections).map((section, sectionIndex) => {
    const sectionRecord = asRecord(section) ?? {};
    const sectionId = asString(sectionRecord.id, `section_${sectionIndex + 1}`);
    const sectionTranslationValue = translatedSections[sectionId];
    const sectionTranslationRecord = asRecord(sectionTranslationValue) ?? {};
    const sectionFieldTranslations = asRecord(sectionTranslationRecord.fields) ?? {};
    const fields = asArray(sectionRecord.fields)
      .flatMap((field) => {
        const fieldRecord = asRecord(field) ?? {};
        const fieldId = asString(fieldRecord.id, 'field');

        return normalizeFlatField(
          fieldRecord,
          sectionId,
          asRecord(sectionFieldTranslations[fieldId]) ?? {},
          translatedFields,
          translatedOptions,
          translatedDefaults,
          definition.language,
        );
      });

    return {
      id: sectionId,
      title: typeof sectionTranslationValue === 'string'
        ? sectionTranslationValue
        : asString(
            sectionTranslationRecord.title,
            asString(sectionTranslationRecord.label, asString(sectionRecord.title, humanize(sectionId))),
          ),
      fields,
    } satisfies NormalizedTemplateSection;
  });

  return {
    templateKey: definition.templateKey,
    templateId: definition.templateId,
    title: definition.title,
    kind: definition.kind,
    language: definition.language,
    schemaStyle: definition.schemaStyle,
    sections,
  };
}

function normalizeNestedField(
  fieldId: string,
  fieldRecord: RawTemplateRecord,
  translationFieldRecord: RawTemplateRecord,
  pathSegments: string[],
  language: AppLanguageCode,
): NormalizedTemplateField[] {
  const path = [...pathSegments, fieldId].join('.');
  const childRecord = asRecord(fieldRecord.fields);
  const translatedChildRecord = asRecord(translationFieldRecord.fields);
  const childFields = childRecord
    ? Object.entries(childRecord).flatMap(([childFieldId, childFieldValue]) => normalizeNestedField(
        childFieldId,
        asRecord(childFieldValue) ?? {},
        asRecord(translatedChildRecord?.[childFieldId]) ?? {},
        [...pathSegments, fieldId],
        language,
      ))
    : [];

  if (childFields.length > 0 && !fieldRecord.type) {
    return [
      {
        path,
        fieldId,
        label: asString(translationFieldRecord.label, asString(fieldRecord.label, humanize(fieldId))),
        kind: 'group',
        defaultValue: '',
        children: childFields,
      },
      ...createSupplementalFields(fieldRecord, path, translationFieldRecord),
    ];
  }

  const inputType = normalizeInputType(fieldRecord.type);
  const options = inputType === 'boolean'
    ? createBooleanOptions(language)
    : normalizeOptionEntries(fieldRecord.options, translationFieldRecord.options, language);

  return [
    {
      path,
      fieldId,
      label: asString(translationFieldRecord.label, asString(fieldRecord.label, humanize(fieldId))),
      kind: 'field',
      inputType,
      options,
      defaultValue: deriveDefaultValue(fieldRecord, inputType),
    },
    ...childFields,
    ...createSupplementalFields(fieldRecord, path, translationFieldRecord),
  ];
}

function normalizeNestedTemplate(definition: RawTemplateDefinition): NormalizedTemplateDefinition {
  const core = definition.core;
  const translation = definition.translation ?? {};
  const sections = Object.entries(core)
    .filter(([key]) => !TEMPLATE_METADATA_KEYS.has(key))
    .map(([sectionId, sectionValue]) => {
      const sectionRecord = asRecord(sectionValue) ?? {};
      const translationSectionRecord = asRecord(translation[sectionId]) ?? {};
      const sectionFields = asRecord(sectionRecord.fields) ?? {};

      return {
        id: sectionId,
        title: asString(translationSectionRecord.label, asString(sectionRecord.label, humanize(sectionId))),
        fields: Object.entries(sectionFields).flatMap(([fieldId, fieldValue]) => normalizeNestedField(
          fieldId,
          asRecord(fieldValue) ?? {},
          asRecord(asRecord(translationSectionRecord.fields)?.[fieldId]) ?? {},
          [sectionId],
          definition.language,
        )),
      } satisfies NormalizedTemplateSection;
    });

  return {
    templateKey: definition.templateKey,
    templateId: definition.templateId,
    title: definition.title,
    kind: definition.kind,
    language: definition.language,
    schemaStyle: definition.schemaStyle,
    sections,
  };
}

export function normalizeTemplateDefinition(definition: RawTemplateDefinition | null | undefined): NormalizedTemplateDefinition | null {
  if (!definition) {
    return null;
  }

  return definition.schemaStyle === 'flat'
    ? normalizeFlatTemplate(definition)
    : normalizeNestedTemplate(definition);
}

function collectDefaultValues(fields: NormalizedTemplateField[], defaultValues: TemplateFormValues): void {
  for (const field of fields) {
    if (field.kind === 'group') {
      collectDefaultValues(field.children ?? [], defaultValues);
      continue;
    }

    defaultValues[field.path] = field.defaultValue;
  }
}

function normalizeResolvedValues(fields: NormalizedTemplateField[], values: TemplateFormValues): void {
  for (const field of fields) {
    if (field.kind === 'group') {
      normalizeResolvedValues(field.children ?? [], values);
      continue;
    }

    if (field.inputType === 'boolean' && typeof values[field.path] === 'string') {
      values[field.path] = normalizeBooleanValue(values[field.path]);
    }
  }
}

export function resolveTemplateFormValues(
  template: NormalizedTemplateDefinition | null | undefined,
  values: TemplateFormValues
): TemplateFormValues {
  if (!template) {
    return values;
  }

  const defaultValues: TemplateFormValues = {};
  for (const section of template.sections) {
    collectDefaultValues(section.fields, defaultValues);
  }

  const resolvedValues = { ...defaultValues, ...values };
  for (const section of template.sections) {
    normalizeResolvedValues(section.fields, resolvedValues);
  }

  return resolvedValues;
}

function hasMeaningfulValue(value: TemplateFormValue | undefined): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return typeof value === 'string' && value.trim().length > 0;
}

function formatFieldValue(field: NormalizedTemplateField, value: TemplateFormValue | undefined): string {
  if (!hasMeaningfulValue(value)) {
    return '';
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => field.options?.find((option) => option.value === entry)?.label ?? entry)
      .join(', ');
  }

  if (typeof value !== 'string') {
    return '';
  }

  return field.options?.find((option) => option.value === value)?.label ?? value;
}

function renderFieldLines(fields: NormalizedTemplateField[], values: TemplateFormValues, depth = 0): string[] {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];

  for (const field of fields) {
    if (field.kind === 'group') {
      const childLines = renderFieldLines(field.children ?? [], values, depth + 1);
      if (childLines.length > 0) {
        lines.push(`${indent}${field.label}:`);
        lines.push(...childLines);
      }
      continue;
    }

    const formattedValue = formatFieldValue(field, values[field.path]);
    if (!formattedValue) {
      continue;
    }

    lines.push(`${indent}${field.label}: ${formattedValue}`);
  }

  return lines;
}

export function renderStructuredTemplateText(
  template: NormalizedTemplateDefinition | null | undefined,
  values: TemplateFormValues
): string {
  if (!template) {
    return '';
  }

  const lines: string[] = [];
  for (const section of template.sections) {
    const fieldLines = renderFieldLines(section.fields, values);
    if (fieldLines.length === 0) {
      continue;
    }

    lines.push(section.title.toUpperCase());
    lines.push(...fieldLines);
    lines.push('');
  }

  return lines.join('\n').trim();
}

export function serializeStructuredTemplatePayload(
  template: NormalizedTemplateDefinition | null | undefined,
  language: AppLanguageCode,
  values: TemplateFormValues
): string {
  if (!template) {
    return '';
  }

  const payload: StructuredTemplatePayload = {
    version: 1,
    templateKey: template.templateKey,
    templateId: template.templateId,
    title: template.title,
    kind: template.kind,
    language,
    values,
  };

  return JSON.stringify(payload);
}

function coerceTemplateValues(value: unknown): TemplateFormValues {
  const rawValues = asRecord(value) ?? {};
  const values: TemplateFormValues = {};

  for (const [key, entry] of Object.entries(rawValues)) {
    if (typeof entry === 'string') {
      values[key] = entry;
      continue;
    }

    if (Array.isArray(entry)) {
      values[key] = entry.filter((item): item is string => typeof item === 'string');
    }
  }

  return values;
}

export function parseStructuredTemplatePayload(rawPayload: string | null | undefined): StructuredTemplatePayload | null {
  if (!rawPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawPayload) as Partial<StructuredTemplatePayload>;
    if (parsed.version !== 1 || typeof parsed.templateKey !== 'string' || typeof parsed.templateId !== 'string') {
      return null;
    }

    if (parsed.kind !== 'gross' && parsed.kind !== 'reporting') {
      return null;
    }

    if (typeof parsed.language !== 'string') {
      return null;
    }

    return {
      version: 1,
      templateKey: parsed.templateKey,
      templateId: parsed.templateId,
      title: typeof parsed.title === 'string' ? parsed.title : parsed.templateId,
      kind: parsed.kind,
      language: parsed.language as AppLanguageCode,
      values: coerceTemplateValues(parsed.values),
    };
  } catch {
    return null;
  }
}