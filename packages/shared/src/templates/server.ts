import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  APP_LANGUAGE_CODES,
  type AppLanguageCode,
  type TemplateCatalogEntry,
  type TemplateDefinition,
  type TemplateKind,
  type TemplateSchemaStyle,
} from './index.js';

type RawTemplateRecord = Record<string, unknown>;

interface TemplateSourceRecord {
  templateKey: string;
  templateId: string;
  family: string;
  kind: TemplateKind;
  schemaStyle: TemplateSchemaStyle;
  relativeDir: string;
  corePath: string;
  title: string;
  translations: Partial<Record<AppLanguageCode, string>>;
}

const templateAssetRoot = path.join(__dirname, 'assets');
const overlayLanguageCodes = APP_LANGUAGE_CODES.filter((languageCode) => languageCode !== 'en');

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

function readJsonFile<T extends RawTemplateRecord>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function getRelativePath(filePath: string): string {
  return path.relative(templateAssetRoot, filePath).split(path.sep).join('/');
}

function inferKind(relativePath: string): TemplateKind {
  return relativePath.includes('/gross/') ? 'gross' : 'reporting';
}

function inferSchemaStyle(core: RawTemplateRecord): TemplateSchemaStyle {
  return Array.isArray(core.sections) ? 'flat' : 'nested';
}

function getTemplateId(core: RawTemplateRecord, fallbackKey: string): string {
  const templateId = core.templateId;
  if (typeof templateId === 'string' && templateId.length > 0) {
    return templateId;
  }

  const snakeTemplateId = core.template_id;
  if (typeof snakeTemplateId === 'string' && snakeTemplateId.length > 0) {
    return snakeTemplateId;
  }

  return fallbackKey;
}

function getTemplateTitle(core: RawTemplateRecord, fallbackKey: string): string {
  const templateName = core.templateName;
  if (typeof templateName === 'string' && templateName.length > 0) {
    return templateName;
  }

  const title = core.title;
  if (typeof title === 'string' && title.length > 0) {
    return title;
  }

  return fallbackKey;
}

function getOverlayTitle(translation: RawTemplateRecord | null, fallbackTitle: string): string {
  if (!translation) {
    return fallbackTitle;
  }

  const templateName = translation.templateName;
  if (typeof templateName === 'string' && templateName.length > 0) {
    return templateName;
  }

  const title = translation.title;
  if (typeof title === 'string' && title.length > 0) {
    return title;
  }

  return fallbackTitle;
}

function getTemplateSourceRecords(): TemplateSourceRecord[] {
  if (!existsSync(templateAssetRoot)) {
    return [];
  }

  const files = walk(templateAssetRoot);
  const coreFiles = files.filter((filePath) => filePath.endsWith('.core.json'));

  return coreFiles
    .map((corePath) => {
      const relativePath = getRelativePath(corePath);
      const relativeDir = path.posix.dirname(relativePath);
      const fileStem = path.basename(relativePath, '.core.json');
      const templateKey = `${relativeDir}/${fileStem}`;
      const family = relativePath.split('/')[0] ?? fileStem;
      const core = readJsonFile(corePath);
      const translations: Partial<Record<AppLanguageCode, string>> = {};

      for (const languageCode of overlayLanguageCodes) {
        const overlayPath = corePath.replace('.core.json', `.i18n_${languageCode}.json`);
        if (existsSync(overlayPath)) {
          translations[languageCode] = overlayPath;
        }
      }

      return {
        templateKey,
        templateId: getTemplateId(core, templateKey),
        family,
        kind: inferKind(relativePath),
        schemaStyle: inferSchemaStyle(core),
        relativeDir,
        corePath,
        title: getTemplateTitle(core, fileStem),
        translations,
      } satisfies TemplateSourceRecord;
    })
    .sort((left, right) => left.templateKey.localeCompare(right.templateKey));
}

function getSourceRecordByKey(templateKey: string): TemplateSourceRecord {
  const sourceRecord = getTemplateSourceRecords().find((entry) => entry.templateKey === templateKey);
  if (!sourceRecord) {
    throw new Error(`Template not found: ${templateKey}`);
  }

  return sourceRecord;
}

export function listTemplateCatalog(language: AppLanguageCode = 'en'): TemplateCatalogEntry[] {
  return getTemplateSourceRecords().map((entry) => {
    const translation = language === 'en' ? null : entry.translations[language]
      ? readJsonFile(entry.translations[language] as string)
      : null;

    const availableLanguages = ['en', ...Object.keys(entry.translations)] as AppLanguageCode[];

    return {
      templateKey: entry.templateKey,
      templateId: entry.templateId,
      family: entry.family,
      kind: entry.kind,
      schemaStyle: entry.schemaStyle,
      title: getOverlayTitle(translation, entry.title),
      relativeDir: entry.relativeDir,
      availableLanguages,
    } satisfies TemplateCatalogEntry;
  });
}

export function getTemplateDefinition(
  templateKey: string,
  language: AppLanguageCode = 'en'
): TemplateDefinition<RawTemplateRecord, RawTemplateRecord> {
  const sourceRecord = getSourceRecordByKey(templateKey);
  const core = readJsonFile(sourceRecord.corePath);
  const translationPath = language === 'en' ? null : sourceRecord.translations[language] ?? null;
  const translation = translationPath ? readJsonFile(translationPath) : null;
  const availableLanguages = ['en', ...Object.keys(sourceRecord.translations)] as AppLanguageCode[];

  return {
    templateKey: sourceRecord.templateKey,
    templateId: sourceRecord.templateId,
    family: sourceRecord.family,
    kind: sourceRecord.kind,
    schemaStyle: sourceRecord.schemaStyle,
    title: getOverlayTitle(translation, sourceRecord.title),
    language,
    availableLanguages,
    core,
    translation,
  };
}

export function getTemplateAssetRoot(): string {
  return templateAssetRoot;
}