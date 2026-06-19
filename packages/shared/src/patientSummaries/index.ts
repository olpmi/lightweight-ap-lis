import type { AppLanguageCode } from '../templates/index.js';

export const PATIENT_SUMMARY_LANGUAGE_CODES = ['en', 'sw', 'fr', 'ar', 'ur', 'pt'] as const;

export type PatientSummaryLanguageCode = (typeof PATIENT_SUMMARY_LANGUAGE_CODES)[number];

export type PatientSummaryValue = string | string[];

export type PatientSummaryValues = Record<string, PatientSummaryValue>;

export interface PatientSummaryFieldMatch {
  equals: string[];
  includes: string[];
}

export interface PatientSummaryContent {
  professionalLabel: string;
  patientTitle: string;
  plainLanguageSummary: string;
  whatThisMeans: string;
  possibleNextSteps: string;
  safetyNote: string;
}

export interface PatientSummaryRule extends PatientSummaryContent {
  ruleId: string;
  match: Record<string, PatientSummaryFieldMatch>;
}

export interface PatientSummaryCatalogEntry {
  templateId: string;
  family: string;
  relativeDir: string;
  availableLanguages: PatientSummaryLanguageCode[];
  triggerFields: string[];
  system: string;
}

export interface PatientSummaryDefinition {
  templateId: string;
  family: string;
  relativeDir: string;
  language: PatientSummaryLanguageCode;
  availableLanguages: PatientSummaryLanguageCode[];
  summaryType: string;
  system: string;
  triggerFields: string[];
  rules: PatientSummaryRule[];
}

export interface ResolvedPatientSummary extends PatientSummaryContent {
  templateId: string;
  language: PatientSummaryLanguageCode;
  ruleId: string;
}

export function coercePatientSummaryLanguage(
  language: AppLanguageCode | PatientSummaryLanguageCode | undefined
): PatientSummaryLanguageCode {
  return (PATIENT_SUMMARY_LANGUAGE_CODES as readonly string[]).includes(language ?? '')
    ? (language as PatientSummaryLanguageCode)
    : 'en';
}

function matchesScalar(value: string, candidates: string[]): boolean {
  return candidates.length > 0 && candidates.includes(value);
}

function matchesArray(values: string[], candidates: string[]): boolean {
  return candidates.length > 0 && values.some((value) => candidates.includes(value));
}

function getMatchedFieldValue(values: PatientSummaryValues, fieldId: string): PatientSummaryValue | undefined {
  if (fieldId in values) {
    return values[fieldId];
  }

  const matchedEntry = Object.entries(values).find(([key]) => key === fieldId || key.endsWith(`.${fieldId}`));
  return matchedEntry?.[1];
}

function ruleMatchesField(value: PatientSummaryValue | undefined, match: PatientSummaryFieldMatch): boolean {
  if (value == null) {
    return false;
  }

  if (Array.isArray(value)) {
    const equalsMatch = match.equals.length === 0 || matchesArray(value, match.equals);
    const includesMatch = match.includes.length === 0 || matchesArray(value, match.includes);
    return equalsMatch && includesMatch;
  }

  const equalsMatch = match.equals.length === 0 || matchesScalar(value, match.equals);
  const includesMatch = match.includes.length === 0 || matchesScalar(value, match.includes);
  return equalsMatch && includesMatch;
}

function ruleMatchesValues(rule: PatientSummaryRule, values: PatientSummaryValues): boolean {
  const entries = Object.entries(rule.match);
  if (entries.length === 0) {
    return false;
  }

  return entries.every(([fieldId, match]) => ruleMatchesField(getMatchedFieldValue(values, fieldId), match));
}

export function resolvePatientSummary(
  definition: PatientSummaryDefinition | null | undefined,
  values: PatientSummaryValues
): ResolvedPatientSummary | null {
  if (!definition) {
    return null;
  }

  const matchedRule = definition.rules.find((rule) => ruleMatchesValues(rule, values));
  if (!matchedRule) {
    return null;
  }

  return {
    templateId: definition.templateId,
    language: definition.language,
    ruleId: matchedRule.ruleId,
    professionalLabel: matchedRule.professionalLabel,
    patientTitle: matchedRule.patientTitle,
    plainLanguageSummary: matchedRule.plainLanguageSummary,
    whatThisMeans: matchedRule.whatThisMeans,
    possibleNextSteps: matchedRule.possibleNextSteps,
    safetyNote: matchedRule.safetyNote,
  } satisfies ResolvedPatientSummary;
}