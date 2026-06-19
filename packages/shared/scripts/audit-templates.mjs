import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptsDir, '..');
const assetRoot = path.join(packageRoot, 'src', 'templates', 'assets');

const overlayLanguages = ['ar', 'fr', 'pt', 'sw', 'ur'];
const templateFiles = [];
const namingErrors = [];
const parseErrors = [];
const warnings = [];

function walk(dirPath) {
  for (const entry of readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!entry.endsWith('.json')) {
      continue;
    }

    templateFiles.push(fullPath);
  }
}

function toRelative(fullPath) {
  return path.relative(assetRoot, fullPath).split(path.sep).join('/');
}

walk(assetRoot);

const groups = new Map();

for (const filePath of templateFiles) {
  const relativePath = toRelative(filePath);
  const fileName = path.basename(filePath);
  const coreMatch = fileName.match(/^(.*)\.core\.json$/);
  const overlayMatch = fileName.match(/^(.*)\.i18n_([a-z]{2})\.json$/);
  // Patient-summary files (patient_summaries.<id>.<lang>.json) live under
  // templates/assets/patient_summaries/ and use their own naming convention.
  // They are validated by the patientSummaries loader, not here.
  const isPatientSummary = /^patient_summaries\..+\.[a-z]{2}\.json$/.test(fileName);

  if (!coreMatch && !overlayMatch && !isPatientSummary) {
    namingErrors.push(relativePath);
    continue;
  }

  if (isPatientSummary) {
    try {
      JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (error) {
      parseErrors.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    continue;
  }

  try {
    JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    parseErrors.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }

  const baseName = coreMatch?.[1] ?? overlayMatch?.[1];
  const group = groups.get(baseName) ?? { hasCore: false, overlays: new Set() };

  if (coreMatch) {
    group.hasCore = true;
  }

  if (overlayMatch) {
    group.overlays.add(overlayMatch[2]);
  }

  groups.set(baseName, group);
}

for (const [baseName, group] of groups.entries()) {
  if (!group.hasCore) {
    warnings.push(`${baseName}: missing .core.json file`);
  }

  for (const languageCode of overlayLanguages) {
    if (!group.overlays.has(languageCode)) {
      warnings.push(`${baseName}: missing .i18n_${languageCode}.json overlay`);
    }
  }
}

if (namingErrors.length > 0) {
  console.error('[audit-templates] Invalid template filenames detected:');
  for (const entry of namingErrors) {
    console.error(`  - ${entry}`);
  }
}

if (parseErrors.length > 0) {
  console.error('[audit-templates] Invalid JSON detected:');
  for (const entry of parseErrors) {
    console.error(`  - ${entry}`);
  }
}

if (warnings.length > 0) {
  console.warn('[audit-templates] Template coverage warnings:');
  for (const entry of warnings) {
    console.warn(`  - ${entry}`);
  }
}

if (namingErrors.length > 0 || parseErrors.length > 0) {
  process.exit(1);
}

console.log(`[audit-templates] Validated ${templateFiles.length} template asset files.`);