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
const patientSummaryFilePattern = /^(.*)\.patient_summary(?:_([a-z]{2})|\.([a-z]{2}))\.json$/;

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

    const languageCode = (match[2] ?? match[3] ?? '').toLowerCase();
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
      return [{
        sourceKey,
        family: group.family,
        relativeDir: group.relativeDir,
        templateId: asString(englishDefinition.templateId, sourceKey),
        system: asString(englishDefinition.system, sourceKey),
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