import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  type AppLanguageCode,
  type TemplateCatalogEntry,
  TEMPLATE_OVERLAY_LANGUAGE_CODES,
} from '@lis/shared';
import {
  listTemplateCatalog,
  getTemplateDefinition,
} from '@lis/shared/templates/server';
import { type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

type RawJson = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Dev-file mode helpers
// ---------------------------------------------------------------------------

function isDevFileMode(): boolean {
  return !!process.env.TEMPLATE_SOURCE_DIR;
}

function getTemplateWriteRoot(): string {
  const dir = process.env.TEMPLATE_SOURCE_DIR!;
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

// ---------------------------------------------------------------------------
// i18n skeleton builder
// ---------------------------------------------------------------------------

/**
 * Builds a minimal i18n overlay skeleton for a new language.
 * Walks the core JSON and extracts labels + option arrays so translators
 * have the structure ready to fill in.  Values are empty strings.
 */
function buildI18nSkeleton(
  coreJson: RawJson,
  lang: string,
  templateKey: string,
): RawJson {
  const templateId =
    (typeof coreJson['templateId'] === 'string' ? coreJson['templateId'] : null) ??
    (typeof coreJson['template_id'] === 'string' ? coreJson['template_id'] : null) ??
    templateKey;

  const skeleton: RawJson = { template_id: templateId, lang, title: '' };

  const METADATA = new Set([
    'templateId', 'template_id', 'templateName', 'title', 'language', 'lang',
    'domain', 'protocol_posting_date',
  ]);

  function extractLabels(node: unknown): unknown {
    if (node === null || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) {
      // An options array → replace each string with an empty string skeleton
      return node.map((item) => (typeof item === 'string' ? '' : item));
    }
    const obj = node as RawJson;
    const out: RawJson = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'label' && typeof value === 'string') {
        out['label'] = '';
      } else if (key === 'options' && Array.isArray(value)) {
        out['options'] = value.map((item) => (typeof item === 'string' ? '' : item));
      } else if (key === 'other_specify' && typeof value === 'string') {
        out['other_specify'] = '';
      } else if (
        key === 'fields' &&
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        const nested = extractLabels(value);
        if (nested !== undefined) out['fields'] = nested;
      } else if (
        key === 'sections' &&
        Array.isArray(value)
      ) {
        out['sections'] = value.map((s) => extractLabels(s)).filter(Boolean);
      }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  // Flat schema (has top-level sections array)
  if (Array.isArray(coreJson['sections'])) {
    const extracted = extractLabels({ sections: coreJson['sections'] });
    if (extracted && typeof extracted === 'object' && !Array.isArray(extracted)) {
      Object.assign(skeleton, extracted);
    }
  } else {
    // Nested schema — walk top-level section objects
    for (const [key, value] of Object.entries(coreJson)) {
      if (METADATA.has(key)) continue;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const extracted = extractLabels(value);
        if (extracted !== undefined) skeleton[key] = extracted;
      }
    }
  }

  return skeleton;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TemplateFiles {
  coreJson: RawJson;
  translations: Partial<Record<AppLanguageCode, RawJson>>;
}

/**
 * List all available templates (built-in filesystem + DB custom).
 * DB custom templates override same-key built-in entries.
 */
export async function listAllTemplates(
  language: AppLanguageCode = 'en',
  kind?: string,
): Promise<TemplateCatalogEntry[]> {
  // Built-in templates from filesystem
  const builtIn = listTemplateCatalog(language);

  // Custom templates from DB
  const dbRows = await prisma.customTemplate.findMany({
    select: {
      templateKey: true,
      family: true,
      kind: true,
      schemaStyle: true,
      title: true,
      translations: { select: { languageCode: true } },
    },
  });

  const dbMap = new Map<string, TemplateCatalogEntry>();
  for (const row of dbRows) {
    const availableLanguages: AppLanguageCode[] = [
      'en',
      ...row.translations.map((t) => t.languageCode as AppLanguageCode),
    ];
    dbMap.set(row.templateKey, {
      templateKey: row.templateKey,
      templateId: row.templateKey,
      family: row.family,
      kind: row.kind as TemplateCatalogEntry['kind'],
      schemaStyle: row.schemaStyle as TemplateCatalogEntry['schemaStyle'],
      title: row.title,
      relativeDir: path.posix.dirname(row.templateKey),
      availableLanguages,
    });
  }

  // Merge: DB entries override built-in for same key; append new DB-only entries
  const merged = builtIn.map((entry) => dbMap.get(entry.templateKey) ?? entry);
  for (const [key, entry] of dbMap) {
    if (!merged.find((e) => e.templateKey === key)) {
      merged.push(entry);
    }
  }

  const result = merged.sort((a, b) => a.templateKey.localeCompare(b.templateKey));
  return kind ? result.filter((e) => e.kind === kind) : result;
}

/**
 * Get the raw core JSON + all translation JSONs for a template.
 * Used by the editor to load the full file set for editing.
 */
export async function getTemplateFiles(templateKey: string): Promise<TemplateFiles> {
  if (isDevFileMode()) {
    const root = getTemplateWriteRoot();
    const corePath = path.join(root, ...templateKey.split('/')) + '.core.json';

    if (!existsSync(corePath)) {
      // Fall through to DB/built-in
    } else {
      const coreJson = JSON.parse(readFileSync(corePath, 'utf8')) as RawJson;
      const translations: Partial<Record<AppLanguageCode, RawJson>> = {};
      for (const lang of TEMPLATE_OVERLAY_LANGUAGE_CODES) {
        const overlayPath =
          path.join(root, ...templateKey.split('/')) + `.i18n_${lang}.json`;
        if (existsSync(overlayPath)) {
          translations[lang] = JSON.parse(readFileSync(overlayPath, 'utf8')) as RawJson;
        }
      }
      return { coreJson, translations };
    }
  }

  // DB first
  const dbRow = await prisma.customTemplate.findUnique({
    where: { templateKey },
    include: { translations: true },
  });
  if (dbRow) {
    const translations: Partial<Record<AppLanguageCode, RawJson>> = {};
    for (const t of dbRow.translations) {
      translations[t.languageCode as AppLanguageCode] = t.translationJson as RawJson;
    }
    return { coreJson: dbRow.coreJson as RawJson, translations };
  }

  // Fall back to built-in filesystem templates via shared loader
  const def = getTemplateDefinition(templateKey, 'en');
  const translations: Partial<Record<AppLanguageCode, RawJson>> = {};
  for (const lang of TEMPLATE_OVERLAY_LANGUAGE_CODES) {
    if (def.availableLanguages.includes(lang)) {
      const langDef = getTemplateDefinition(templateKey, lang);
      if (langDef.translation) {
        translations[lang] = langDef.translation as RawJson;
      }
    }
  }
  return { coreJson: def.core as RawJson, translations };
}

/**
 * Save (create or update) a template.
 * In dev-file mode: writes .core.json and .i18n_*.json to TEMPLATE_SOURCE_DIR.
 * In DB mode: upserts CustomTemplate + CustomTemplateTranslation rows.
 * Auto-generates skeleton i18n files for any missing overlay languages.
 */
export async function saveTemplate(params: {
  templateKey: string;
  family: string;
  kind: string;
  schemaStyle: string;
  title: string;
  coreJson: RawJson;
  translations: Partial<Record<AppLanguageCode, RawJson>>;
}): Promise<void> {
  const { templateKey, family, kind, schemaStyle, title, coreJson, translations } = params;

  if (isDevFileMode()) {
    const root = getTemplateWriteRoot();
    const segments = templateKey.split('/');
    const stem = segments[segments.length - 1]!;
    const dir = path.join(root, ...segments.slice(0, -1));

    mkdirSync(dir, { recursive: true });

    writeFileSync(
      path.join(dir, `${stem}.core.json`),
      JSON.stringify(coreJson, null, 2),
      'utf8',
    );

    for (const lang of TEMPLATE_OVERLAY_LANGUAGE_CODES) {
      const overlayPath = path.join(dir, `${stem}.i18n_${lang}.json`);
      const json = translations[lang] ?? buildI18nSkeleton(coreJson, lang, templateKey);
      writeFileSync(overlayPath, JSON.stringify(json, null, 2), 'utf8');
    }
  } else {
    // DB mode
    const coreJsonInput = coreJson as unknown as Prisma.InputJsonValue;
    await prisma.customTemplate.upsert({
      where: { templateKey },
      create: { templateKey, family, kind, schemaStyle, title, coreJson: coreJsonInput },
      update: { family, kind, schemaStyle, title, coreJson: coreJsonInput },
    });

    for (const lang of TEMPLATE_OVERLAY_LANGUAGE_CODES) {
      const json = (translations[lang] ?? buildI18nSkeleton(coreJson, lang, templateKey)) as unknown as Prisma.InputJsonValue;
      await prisma.customTemplateTranslation.upsert({
        where: { templateKey_languageCode: { templateKey, languageCode: lang } },
        create: { templateKey, languageCode: lang, translationJson: json },
        update: { translationJson: json },
      });
    }
  }
}
