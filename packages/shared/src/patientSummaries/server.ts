import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type {
  AppLanguageCode,
} from '../templates/index.js';
import {
  PATIENT_SUMMARY_LANGUAGE_CODES,
  coercePatientSummaryLanguage,
  type PatientSummaryCatalogEntry,
  type PatientSummaryContent,
  type PatientSummaryDefinition,
  type PatientSummaryFieldMatch,
  type PatientSummaryLanguageCode,
  type PatientSummaryRule,
} from './index.js';

type RawRecord = Record<string, unknown>;

interface PatientSummarySourceRecord {
  sourceKey: string;
  family: string;
  relativeDir: string;
  templateId: string;
  system: string;
  languages: Partial<Record<PatientSummaryLanguageCode, string>>;
}

const patientSummaryAssetRoot = path.join(__dirname, '..', 'templates', 'assets', 'patient_summaries');
const patientSummaryLanguageCodes = new Set<string>(PATIENT_SUMMARY_LANGUAGE_CODES);
const patientSummaryFilePattern = /^(.+)\.([a-z]{2})\.json$/;

function walk(dirPath: string): string[] {
  const filePaths: string[] = [];

  for (const entry of readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      filePaths.push(...walk(fullPath));
      continue;
    }

    if (entry.endsWith('.json')) {
      filePaths.push(fullPath);
    }
  }

  return filePaths;
}

function readJsonFile<T extends RawRecord>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function asRecord(value: unknown): RawRecord | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RawRecord)
    : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toRelativePath(filePath: string): string {
  return path.relative(patientSummaryAssetRoot, filePath).split(path.sep).join('/');
}

function normalizeFieldMatch(value: unknown): PatientSummaryFieldMatch | null {
  if (typeof value === 'string') {
    return { equals: [value], includes: [] };
  }

  if (Array.isArray(value)) {
    const equals = value.filter((entry): entry is string => typeof entry === 'string');
    return equals.length > 0 ? { equals, includes: [] } : null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const equals = Array.isArray(record.equals)
    ? record.equals.filter((entry): entry is string => typeof entry === 'string')
    : typeof record.equals === 'string'
      ? [record.equals]
      : [];

  const includes = Array.isArray(record.includes)
    ? record.includes.filter((entry): entry is string => typeof entry === 'string')
    : typeof record.includes === 'string'
      ? [record.includes]
      : [];

  if (equals.length === 0 && includes.length === 0) {
    return null;
  }

  return { equals, includes };
}

function normalizeRuleContent(ruleId: string, baseRule: RawRecord, overlayRule: RawRecord | null): PatientSummaryContent & { ruleId: string } {
  return {
    ruleId,
    professionalLabel: asString(overlayRule?.professionalLabel, asString(baseRule.professionalLabel)),
    patientTitle: asString(overlayRule?.patientTitle, asString(baseRule.patientTitle)),
    plainLanguageSummary: asString(overlayRule?.plainLanguageSummary, asString(baseRule.plainLanguageSummary)),
    whatThisMeans: asString(overlayRule?.whatThisMeans, asString(baseRule.whatThisMeans)),
    possibleNextSteps: asString(overlayRule?.possibleNextSteps, asString(baseRule.possibleNextSteps)),
    safetyNote: asString(overlayRule?.safetyNote, asString(baseRule.safetyNote)),
  };
}

function normalizeRuleMatch(ruleId: string, baseRule: RawRecord, overlayRule: RawRecord | null, fallbackTriggerField: string): Record<string, PatientSummaryFieldMatch> {
  const overlayMatch = asRecord(overlayRule?.match);
  const baseMatch = asRecord(baseRule.match);
  const rawMatch = overlayMatch ?? baseMatch;

  if (!rawMatch) {
    return fallbackTriggerField
      ? { [fallbackTriggerField]: { equals: [ruleId], includes: [] } }
      : {};
  }

  return Object.fromEntries(
    Object.entries(rawMatch)
      .map(([fieldId, value]) => [fieldId, normalizeFieldMatch(value)] as const)
      .filter((entry): entry is readonly [string, PatientSummaryFieldMatch] => entry[1] != null)
  );
}

function getSourceRecords(): PatientSummarySourceRecord[] {
  if (!existsSync(patientSummaryAssetRoot)) {
    return [];
  }

  const groupedFiles = new Map<string, { relativeDir: string; family: string; files: Partial<Record<PatientSummaryLanguageCode, string>> }>();

  for (const filePath of walk(patientSummaryAssetRoot)) {
    const relativePath = toRelativePath(filePath);
    const relativeDir = path.posix.dirname(relativePath);
    const fileName = path.posix.basename(relativePath);
    const match = fileName.match(patientSummaryFilePattern);
    if (!match) {
      continue;
    }

    const languageCode = (match[2] ?? '').toLowerCase();
    if (!patientSummaryLanguageCodes.has(languageCode)) {
      continue;
    }

    const family = relativePath.split('/')[0] ?? match[1] ?? relativePath;
    const sourceKey = `${relativeDir}/${match[1]}`;
    const group = groupedFiles.get(sourceKey) ?? {
      relativeDir,
      family,
      files: {} as Partial<Record<PatientSummaryLanguageCode, string>>,
    };
    group.files[languageCode as PatientSummaryLanguageCode] = filePath;
    groupedFiles.set(sourceKey, group);
  }

  return Array.from(groupedFiles.entries())
    .flatMap(([sourceKey, group]) => {
      const englishPath = group.files.en;
      if (!englishPath) {
        return [];
      }

      const englishDefinition = readJsonFile(englishPath);
      const metadataRecord = asRecord(englishDefinition.metadata);
      // Derive a clean templateId: prefer root templateId, then metadata.id with the
      // trailing language-code suffix stripped (e.g. "patient_summaries.histology.en" → "patient_summaries.histology"),
      // then fall back to the raw sourceKey.
      const rawMetadataId = asString(metadataRecord?.id);
      const metadataId = rawMetadataId ? rawMetadataId.replace(/\.[a-z]{2}$/, '') : '';
      const templateId = asString(englishDefinition.templateId) || metadataId || sourceKey;
      const system = asString(englishDefinition.system) || asString(metadataRecord?.title) || sourceKey;
      return [{
        sourceKey,
        family: group.family,
        relativeDir: group.relativeDir,
        templateId,
        system,
        languages: group.files,
      } satisfies PatientSummarySourceRecord];
    })
    .sort((left, right) => left.templateId.localeCompare(right.templateId));
}

function getSourceRecord(templateId: string): PatientSummarySourceRecord {
  const sourceRecord = getSourceRecords().find((entry) => entry.templateId === templateId);
  if (!sourceRecord) {
    throw new Error(`Patient summary not found for templateId: ${templateId}`);
  }

  return sourceRecord;
}

function getRequestedLanguage(language: AppLanguageCode | PatientSummaryLanguageCode | undefined): PatientSummaryLanguageCode {
  return coercePatientSummaryLanguage(language);
}

/**
 * Replaces `{key}` tokens in `text` with values from `blocks`.
 * Unrecognized tokens are left as-is so no content is silently dropped.
 */
function expandSentenceBlocks(text: string, blocks: RawRecord): string {
  return text.replace(/\{([^}]+)\}/g, (token, key: string) => {
    const replacement = blocks[key];
    return typeof replacement === 'string' ? replacement : token;
  });
}

/**
 * Normalization path for the `histology_rule_based` family.
 *
 * These JSON files use `template_groups` (per-organ/subtype summary blocks) +
 * `diagnosis_key_map` (maps specific diagnosis-key values to a group/template)
 * instead of the flat `summaries` record used by cytology templates.
 *
 * Each entry in `diagnosis_key_map` becomes one `PatientSummaryRule` whose match
 * condition is `{ <triggerField>: { equals: [diagnosisKey] } }`.
 */
function normalizeHistologyRuleBasedDefinition(
  sourceRecord: PatientSummarySourceRecord,
  baseDefinition: RawRecord,
  overlayDefinition: RawRecord | null,
  language: PatientSummaryLanguageCode
): PatientSummaryDefinition {
  const triggerField = asString(baseDefinition.triggerField) || 'diagnosis_key';

  const baseDiagnosisKeyMap = asRecord(baseDefinition.diagnosis_key_map) ?? {};
  const baseTemplateGroups = asRecord(baseDefinition.template_groups) ?? {};
  const baseSharedBlocks = asRecord(baseDefinition.shared_sentence_blocks) ?? {};

  const overlayDiagnosisKeyMap = asRecord(overlayDefinition?.diagnosis_key_map) ?? {};
  const overlayTemplateGroups = asRecord(overlayDefinition?.template_groups) ?? {};
  const overlaySharedBlocks = asRecord(overlayDefinition?.shared_sentence_blocks) ?? {};

  // Merge sentence blocks — overlay values win.
  const mergedSharedBlocks: RawRecord = { ...baseSharedBlocks, ...overlaySharedBlocks };

  const rules: PatientSummaryRule[] = Object.entries(baseDiagnosisKeyMap).flatMap(([diagnosisKey, rawMapEntry]) => {
    const baseMapEntry = asRecord(rawMapEntry);
    if (!baseMapEntry) {
      return [];
    }

    const templateGroupKey = asString(baseMapEntry.template_group);
    const templateKey = asString(baseMapEntry.template_key);
    if (!templateGroupKey || !templateKey) {
      return [];
    }

    const baseGroupEntry = asRecord(asRecord(baseTemplateGroups[templateGroupKey])?.[templateKey]);
    const overlayGroupEntry = asRecord(asRecord(overlayTemplateGroups[templateGroupKey])?.[templateKey]);
    const overlayMapEntry = asRecord(overlayDiagnosisKeyMap[diagnosisKey]);

    const patientLabel = asString(overlayMapEntry?.patient_label, asString(baseMapEntry.patient_label));
    const patientTitle = asString(overlayGroupEntry?.label, asString(baseGroupEntry?.label));
    const rawSummary = asString(overlayGroupEntry?.summary, asString(baseGroupEntry?.summary));
    const plainLanguageSummary = expandSentenceBlocks(rawSummary, mergedSharedBlocks);

    return [{
      ruleId: diagnosisKey,
      match: { [triggerField]: { equals: [diagnosisKey], includes: [] } },
      professionalLabel: patientLabel,
      patientTitle,
      plainLanguageSummary,
      whatThisMeans: '',
      possibleNextSteps: '',
      safetyNote: '',
    } satisfies PatientSummaryRule];
  });

  const triggerFields = rules.length > 0 ? [triggerField] : [];
  const availableLanguages = PATIENT_SUMMARY_LANGUAGE_CODES.filter((languageCode) => sourceRecord.languages[languageCode]);
  const overlayMetadata = asRecord(overlayDefinition?.metadata);
  const baseMetadata = asRecord(baseDefinition.metadata);
  const system = asString(overlayDefinition?.system)
    || asString(overlayMetadata?.title)
    || asString(baseDefinition.system)
    || asString(baseMetadata?.title)
    || sourceRecord.system;

  return {
    templateId: sourceRecord.templateId,
    family: sourceRecord.family,
    relativeDir: sourceRecord.relativeDir,
    language,
    availableLanguages,
    summaryType: 'rule_based_patient_facing_summary',
    system,
    triggerFields,
    rules,
  } satisfies PatientSummaryDefinition;
}

function normalizeDefinition(
  sourceRecord: PatientSummarySourceRecord,
  language: PatientSummaryLanguageCode
): PatientSummaryDefinition {
  const basePath = sourceRecord.languages.en;
  if (!basePath) {
    throw new Error(`Patient summary base language missing for templateId: ${sourceRecord.templateId}`);
  }

  const baseDefinition = readJsonFile(basePath);
  const overlayPath = language === 'en' ? null : sourceRecord.languages[language] ?? null;
  const overlayDefinition = overlayPath ? readJsonFile(overlayPath) : null;

  // Dispatch to the histology_rule_based normalizer when the file uses the
  // template_groups + diagnosis_key_map layout instead of a flat summaries record.
  if (asRecord(baseDefinition.template_groups) && asRecord(baseDefinition.diagnosis_key_map)) {
    return normalizeHistologyRuleBasedDefinition(sourceRecord, baseDefinition, overlayDefinition, language);
  }

  const baseSummaries = asRecord(baseDefinition.summaries) ?? {};
  const overlaySummaries = asRecord(overlayDefinition?.summaries) ?? {};
  const fallbackTriggerField = asString(baseDefinition.triggerField);

  const rules: PatientSummaryRule[] = Object.entries(baseSummaries).map(([ruleId, rawRule]) => {
    const baseRule = asRecord(rawRule) ?? {};
    const overlayRule = asRecord(overlaySummaries[ruleId]);
    const content = normalizeRuleContent(ruleId, baseRule, overlayRule);

    return {
      ...content,
      match: normalizeRuleMatch(ruleId, baseRule, overlayRule, fallbackTriggerField),
    } satisfies PatientSummaryRule;
  });

  const triggerFields = Array.from(new Set(rules.flatMap((rule) => Object.keys(rule.match))));
  const availableLanguages = PATIENT_SUMMARY_LANGUAGE_CODES.filter((languageCode) => sourceRecord.languages[languageCode]);

  return {
    templateId: sourceRecord.templateId,
    family: sourceRecord.family,
    relativeDir: sourceRecord.relativeDir,
    language,
    availableLanguages,
    summaryType: asString(baseDefinition.summaryType, 'rule_based_patient_facing_summary'),
    system: asString(overlayDefinition?.system, asString(baseDefinition.system, sourceRecord.system)),
    triggerFields,
    rules,
  } satisfies PatientSummaryDefinition;
}

export function listPatientSummaryCatalog(
  language: AppLanguageCode | PatientSummaryLanguageCode = 'en'
): PatientSummaryCatalogEntry[] {
  const requestedLanguage = getRequestedLanguage(language);

  return getSourceRecords().map((sourceRecord) => {
    const definition = normalizeDefinition(sourceRecord, requestedLanguage);
    return {
      templateId: definition.templateId,
      family: definition.family,
      relativeDir: definition.relativeDir,
      availableLanguages: definition.availableLanguages,
      triggerFields: definition.triggerFields,
      system: definition.system,
    } satisfies PatientSummaryCatalogEntry;
  });
}

export function getPatientSummaryDefinition(
  templateId: string,
  language: AppLanguageCode | PatientSummaryLanguageCode = 'en'
): PatientSummaryDefinition {
  const sourceRecord = getSourceRecord(templateId);
  return normalizeDefinition(sourceRecord, getRequestedLanguage(language));
}

export function getPatientSummaryAssetRoot(): string {
  return patientSummaryAssetRoot;
}