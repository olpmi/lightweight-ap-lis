/**
 * convert-i18n-to-label-fields.mjs
 *
 * Converts "documentation-format" i18n overlay files to the label/fields format
 * expected by normalizeNestedTemplate() in templateForms.ts.
 *
 * Expected output format per section/field:
 * {
 *   "template_id": "...",
 *   "lang": "...",
 *   "title": "...",
 *   "sectionId": {
 *     "label": "Section title",
 *     "fields": {
 *       "fieldId": {
 *         "label": "Field label",
 *         "options": ["option1", "option2", ...]   // parallel array matching core options
 *       },
 *       "nestedGroupId": {
 *         "label": "Group label",
 *         "fields": { ... }
 *       }
 *     }
 *   }
 * }
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.join(__dirname, '../src/templates/assets');

// Templates to process: [templateKey, langCodes[]]
const TEMPLATE_LANGS = ['sw', 'fr', 'ar', 'ur'];

const TEMPLATES = [
  'breast.histology/breast/reporting/breast_invasive_carcinoma_resection',
  'breast.histology/breast/reporting/breast_dcis_resection',
  'fgt.histology/fgt/reporting/endometrium_resection',
  'fgt.histology/fgt/reporting/ovary_fallopian_tube_primary_peritoneum',
  'fgt.histology/fgt/reporting/uterine_cervix_biopsy',
  'fgt.histology/fgt/reporting/uterine_cervix_resection',
  'gi.histology/gi/reporting/colon_rectum_resection',
  'gi.histology/gi/reporting/gist_resection',
  'gi.histology/gi/reporting/esophagus_resection',
  'gi.histology/gi/reporting/stomach_resection',
  'prostate.histology/prostate/resection/prostate_radical_prostatectomy',
];

// Keys that are template-level metadata, not sections
const TEMPLATE_METADATA_KEYS = new Set([
  'template_id', 'templateId', 'template', 'language', 'lang', 'locale', 'domain',
  'title', 'protocol_posting_date', 'standards', 'meta', 'common', '$schema',
  'source_template', 'direction', 'version', 'keys', 'sections', 'protocol',
  'protocol_title', 'note', 'reference',
]);

// ─── helpers ───────────────────────────────────────────────────────────────

function asRecord(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function asArray(v) { return Array.isArray(v) ? v : []; }

function asString(v, fallback = '') { return typeof v === 'string' ? v : fallback; }

/** Extract option translations as a parallel array. Handles both array and object formats. */
function optionsToArray(optionsValue) {
  if (!optionsValue) return null;
  if (Array.isArray(optionsValue)) {
    const arr = optionsValue.filter(v => typeof v === 'string');
    return arr.length > 0 ? arr : null;
  }
  const r = asRecord(optionsValue);
  if (r) {
    const arr = Object.values(r).filter(v => typeof v === 'string');
    return arr.length > 0 ? arr : null;
  }
  return null;
}

// ─── format detection ───────────────────────────────────────────────────────

/**
 * Detect the source format of an i18n file.
 *
 * Formats:
 *   'label_fields'    - already in expected format (no conversion needed)
 *   'meta_doc'        - { meta: {...}, sectionId: { section: "...", fieldId: "...", fieldId_options: {...} } }
 *   'flat_keys'       - flat object with dotted keys like "section.sectionId", "sectionId.fieldId.label"
 *   'flat_keys_keyed' - { keys: { "section.sectionId": "...", ... } }  (prostate)
 *   'sections_wrapper'- { meta: {...}, sections: { sectionId: { title: "...", fields: { fieldId: { ... } } } } }
 *   'template_doc'    - { template: {...}, sectionId: { label: "...", fieldId: { label: "...", options: {...} } } }
 *   'template_name'   - { templateName: { metadata: {...}, fieldId: { label: "...", options: {...} } } }
 *   'proto_doc'       - { protocol_title: "...", sectionId: { fieldId: "...", fieldId_options: {...} } }
 *   'dcis_wrapper'    - { templateName: { template: {...}, sections: {...}, sectionId: {...} } }
 */
function detectFormat(i18n) {
  // Already in expected format?
  const topKeys = Object.keys(i18n);
  const nonMeta = topKeys.filter(k => !TEMPLATE_METADATA_KEYS.has(k));

  if (i18n.keys && asRecord(i18n.keys)) {
    return 'flat_keys_keyed'; // prostate
  }

  if (i18n.sections && asRecord(i18n.sections)) {
    // Check if it's the gist sections_wrapper or a dcis_wrapper inside a template name key
    return 'sections_wrapper'; // gist
  }

  if (i18n.template && asRecord(i18n.template)) {
    return 'template_doc'; // endometrium, ovary
  }

  if (i18n.protocol_title) {
    return 'proto_doc'; // uterine_cervix_resection
  }

  // Check if it's a flat dotted-key format (colon_rectum, esophagus, stomach)
  const hasDottedKeys = topKeys.some(k => k.includes('.') && k.startsWith('template.'));
  if (hasDottedKeys) {
    return 'flat_keys';
  }

  // Check if there's a top-level key matching a template name that wraps everything
  // (breast_dcis_resection, uterine_cervix_biopsy)
  if (nonMeta.length === 1) {
    const wrapperKey = nonMeta[0];
    const wrapper = asRecord(i18n[wrapperKey]);
    if (wrapper) {
      if (wrapper.sections && asRecord(wrapper.sections)) {
        return 'dcis_wrapper'; // breast_dcis_resection
      }
      if (wrapper.metadata || wrapper.histologic_type || Object.keys(wrapper).some(k => !TEMPLATE_METADATA_KEYS.has(k))) {
        return 'template_name'; // uterine_cervix_biopsy
      }
    }
  }

  // meta_doc format (breast_invasive_carcinoma_resection)
  if (i18n.meta && asRecord(i18n.meta)) {
    return 'meta_doc';
  }

  // Check if already in label/fields format: top-level section has { label } and/or { fields }
  for (const key of nonMeta) {
    const section = asRecord(i18n[key]);
    if (section && (typeof section.label === 'string' || asRecord(section.fields))) {
      return 'label_fields';
    }
  }

  return 'unknown';
}

// ─── translation extractors ─────────────────────────────────────────────────

/**
 * Get section info (label + field translations) from an i18n file for a given sectionId.
 * Returns { label, fields } where fields is a map of fieldId -> { label, options, fields }
 */
function extractSection(sectionId, sectionRecord, i18n, format, templateName) {
  switch (format) {
    case 'label_fields':
      return asRecord(i18n[sectionId]) ?? {};

    case 'meta_doc':
    case 'proto_doc': {
      // Some templates use different section keys in the i18n vs the core.
      // PROTO_DOC_SECTION_ALIASES maps templateName → coreSectionId → [i18nSectionIds to merge].
      const PROTO_DOC_SECTION_ALIASES = {
        uterine_cervix_resection: {
          tumor: ['histology', 'stromal_invasion', 'tumor_extent', 'lymphovascular_invasion'],
          pathologic_stage: ['ptnm_classification', 'figo_stage'],
        },
      };
      const aliases = PROTO_DOC_SECTION_ALIASES[templateName]?.[sectionId];
      let raw;
      if (aliases) {
        // Merge all aliased section objects into one flat record
        const merged = {};
        for (const alias of aliases) {
          const src = asRecord(i18n[alias]) ?? {};
          Object.assign(merged, src);
        }
        raw = merged;
      } else {
        raw = asRecord(i18n[sectionId]) ?? {};
      }
      return extractMetaDocSection(sectionId, sectionRecord, raw);
    }

    case 'template_doc': {
      const raw = asRecord(i18n[sectionId]) ?? {};
      return extractTemplateDoctSection(sectionId, raw);
    }

    case 'flat_keys': {
      return extractFlatKeysSection(sectionId, sectionRecord, i18n);
    }

    case 'flat_keys_keyed': {
      return extractFlatKeysSection(sectionId, sectionRecord, i18n.keys ?? {});
    }

    case 'sections_wrapper': {
      const sections = asRecord(i18n.sections) ?? {};
      // Try the sectionId directly, also try camelCase variant
      const rawSection = asRecord(sections[sectionId]) ?? asRecord(sections[toCamel(sectionId)]) ?? {};
      return extractSectionsWrapperSection(rawSection);
    }

    case 'template_name': {
      const wrapper = asRecord(i18n[templateName]) ?? {};
      // In this format, all fields are at the top level (no section grouping)
      // We return the entire wrapper as a flat bag of field translations
      return extractTemplateNameSection(sectionId, sectionRecord, wrapper);
    }

    case 'dcis_wrapper': {
      const wrapper = asRecord(i18n[templateName]) ?? {};
      const sections = asRecord(wrapper.sections) ?? {};
      const sectionLabel = asString(sections[sectionId]);
      const rawSection = asRecord(wrapper[sectionId]) ?? {};
      return extractDcisWrapperSection(sectionId, sectionRecord, sectionLabel, rawSection);
    }

    default:
      return {};
  }
}

/**
 * meta_doc: { section: "...", fieldId: "...", fieldId_options: {...}, ... }
 * Handles both exact key names and abbreviated variants.
 */
function extractMetaDocSection(sectionId, coreSection, raw) {
  // Try raw.section, raw.label, raw.title for the section-level label
  const label = asString(raw.section ?? raw.label ?? raw.title ?? '');
  const coreSectionFields = asRecord(coreSection.fields) ?? {};
  const fields = {};
  // Build a lowercased key map for case-insensitive lookups
  const lowerRaw = {};
  for (const [k, v] of Object.entries(raw)) lowerRaw[k.toLowerCase()] = { key: k, val: v };
  function rawGet(key) {
    return raw[key] !== undefined ? raw[key] : lowerRaw[key.toLowerCase()]?.val;
  }
  for (const [fieldId, fieldValue] of Object.entries(coreSectionFields)) {
    const fieldLabel = findMetaDocLabel(fieldId, raw, rawGet);
    const optionsRaw = findMetaDocOptions(fieldId, raw, rawGet);
    const fieldRecord = asRecord(fieldValue) ?? {};
    const childCoreFields = asRecord(fieldRecord.fields);
    const entry = {};
    if (fieldLabel) entry.label = fieldLabel;
    const optArr = optionsToArray(optionsRaw);
    if (optArr) entry.options = optArr;
    if (childCoreFields) {
      const nested = extractNestedMetaDoc(fieldId, childCoreFields, raw, rawGet);
      if (Object.keys(nested).length > 0) entry.fields = nested;
    }
    if (Object.keys(entry).length > 0) fields[fieldId] = entry;
  }
  // Last resort: if no fields extracted but raw has a generic "options" key,
  // assign it to the first (and likely only) field
  if (Object.keys(fields).length === 0 && Object.keys(coreSectionFields).length === 1) {
    const [soloFieldId] = Object.keys(coreSectionFields);
    const genericOpts = optionsToArray(raw.options);
    if (genericOpts) {
      const soloLabel = rawGet(soloFieldId + '_label') ?? rawGet(soloFieldId) ?? '';
      fields[soloFieldId] = { label: asString(soloLabel), options: genericOpts };
    }
  }
  const result = {};
  if (label) result.label = label;
  if (Object.keys(fields).length > 0) result.fields = fields;
  return result;
}

/**
 * Find a field label in a meta_doc raw section.
 * rawGet: case-insensitive key accessor.
 */
function findMetaDocLabel(fieldId, raw, rawGet) {
  rawGet = rawGet ?? (k => raw[k]);
  const direct = rawGet(fieldId);
  if (typeof direct === 'string') return direct;
  // Try last segment: "tumor_site" -> "site"
  const parts = fieldId.split('_');
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1];
    const lp = rawGet(lastPart);
    if (typeof lp === 'string') return lp;
    // Try last two parts
    const lastTwo = parts.slice(-2).join('_');
    if (lastTwo !== fieldId) {
      const lt = rawGet(lastTwo);
      if (typeof lt === 'string') return lt;
    }
  }
  return '';
}

/**
 * Find options in a meta_doc raw section.
 * rawGet: case-insensitive key accessor.
 * Tries exact, progressively shorter prefixes, then suffixes, then generic "options".
 */
function findMetaDocOptions(fieldId, raw, rawGet) {
  rawGet = rawGet ?? (k => raw[k]);
  // Exact match first
  const exact = rawGet(fieldId + '_options') ?? rawGet(fieldId + 'options');
  if (exact != null) return exact;
  const parts = fieldId.split('_');
  if (parts.length >= 2) {
    // Try progressively shorter prefixes (drop from right)
    for (let i = parts.length - 1; i >= 1; i--) {
      const prefix = parts.slice(0, i).join('_');
      const candidate = rawGet(prefix + '_options');
      if (candidate != null) return candidate;
    }
    // Try progressively shorter suffixes (drop from left)
    for (let i = 1; i < parts.length; i++) {
      const suffix = parts.slice(i).join('_');
      const candidate = rawGet(suffix + '_options');
      if (candidate != null) return candidate;
    }
  }
  return null;
}

function extractNestedMetaDoc(parentId, coreFields, raw, rawGet) {
  rawGet = rawGet ?? (k => raw[k]);

  const fields = {};
  for (const [fieldId, fieldValue] of Object.entries(coreFields)) {
    const combinedKey = parentId + '_' + fieldId;
    const fieldLabel = asString(rawGet(combinedKey) ?? findMetaDocLabel(fieldId, raw, rawGet));
    const optionsRaw = rawGet(combinedKey + '_options') ?? findMetaDocOptions(fieldId, raw, rawGet);
    const fieldRecord = asRecord(fieldValue) ?? {};
    const childCoreFields = asRecord(fieldRecord.fields);
    const entry = {};
    if (fieldLabel) entry.label = fieldLabel;
    const optArr = optionsToArray(optionsRaw);
    if (optArr) entry.options = optArr;
    if (childCoreFields) {
      const nested = extractNestedMetaDoc(fieldId, childCoreFields, raw, rawGet);
      if (Object.keys(nested).length > 0) entry.fields = nested;
    }
    if (Object.keys(entry).length > 0) fields[fieldId] = entry;
  }
  return fields;
}

/**
 * template_doc: { label: "...", fieldId: { label: "...", options: {...} }, ... }
 */
function extractTemplateDoctSection(sectionId, raw) {
  const label = asString(raw.label, '');
  const fields = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'label' || key === 'note') continue;
    const fieldRec = asRecord(value);
    if (!fieldRec) continue;
    const entry = {};
    if (typeof fieldRec.label === 'string') entry.label = fieldRec.label;
    const optArr = optionsToArray(fieldRec.options);
    if (optArr) entry.options = optArr;
    // Recurse into nested fields
    const nestedFields = {};
    for (const [nk, nv] of Object.entries(fieldRec)) {
      if (nk === 'label' || nk === 'options' || nk === 'note') continue;
      const nRec = asRecord(nv);
      if (!nRec) continue;
      const nEntry = {};
      if (typeof nRec.label === 'string') nEntry.label = nRec.label;
      const nOpts = optionsToArray(nRec.options);
      if (nOpts) nEntry.options = nOpts;
      if (Object.keys(nEntry).length > 0) nestedFields[nk] = nEntry;
    }
    if (Object.keys(nestedFields).length > 0) entry.fields = nestedFields;
    if (Object.keys(entry).length > 0) fields[key] = entry;
  }
  const result = {};
  if (label) result.label = label;
  if (Object.keys(fields).length > 0) result.fields = fields;
  return result;
}

/**
 * sections_wrapper (GIST): { title: "...", fields: { fieldId: { label: "...", options: {...} } } }
 */
function extractSectionsWrapperSection(rawSection) {
  const label = asString(rawSection.title, '');
  const rawFields = asRecord(rawSection.fields) ?? {};
  const fields = {};
  for (const [fieldId, fieldValue] of Object.entries(rawFields)) {
    const fieldRec = asRecord(fieldValue);
    if (!fieldRec) continue;
    const entry = {};
    if (typeof fieldRec.label === 'string') entry.label = fieldRec.label;
    const optArr = optionsToArray(fieldRec.options);
    if (optArr) entry.options = optArr;
    // Recurse into nested fields
    const nestedRawFields = asRecord(fieldRec.fields) ?? {};
    const nestedFields = {};
    for (const [nk, nv] of Object.entries(nestedRawFields)) {
      const nRec = asRecord(nv);
      if (!nRec) continue;
      const nEntry = {};
      if (typeof nRec.label === 'string') nEntry.label = nRec.label;
      const nOpts = optionsToArray(nRec.options);
      if (nOpts) nEntry.options = nOpts;
      if (Object.keys(nEntry).length > 0) nestedFields[nk] = nEntry;
    }
    if (Object.keys(nestedFields).length > 0) entry.fields = nestedFields;
    if (Object.keys(entry).length > 0) fields[fieldId] = entry;
  }
  const result = {};
  if (label) result.label = label;
  if (Object.keys(fields).length > 0) result.fields = fields;
  return result;
}

/**
 * flat_keys: object with dotted keys. We look up keys matching sectionId.fieldId.*
 *
 * For a field at path sectionId.fieldId:
 *   label: i18n["sectionId.fieldId.label"] or i18n["section.sectionId" -> fallback label]
 *   options: collect all keys starting with "sectionId.fieldId." that don't have further sub-components
 *
 * sectionId lookup variants: snake_case, camelCase, PascalCase, etc.
 * This implementation uses word-overlap scoring to handle aliased section prefixes
 * (e.g., "nodes" for "regional_lymph_nodes") and nested label paths
 * (e.g., "margins.invasive.status.label" for field "margin_status_invasive").
 */

/** Split a camelCase/snake_case/dot-notation string into lowercase words (length >= 2). */
function wordSet(str) {
  return new Set(
    str.split(/[_.]|(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)
      .map(w => w.toLowerCase())
      .filter(w => w.length >= 2)
  );
}

/** Jaccard overlap score between two word sets. */
function overlapScore(a, b) {
  const overlap = [...a].filter(w => b.has(w)).length;
  const union = new Set([...a, ...b]).size;
  return union > 0 ? overlap / union : 0;
}

/**
 * Find the flat key prefix that best corresponds to a core sectionId.
 * Returns the matched prefix (e.g., "nodes" for "regional_lymph_nodes").
 */
function findSectionPrefix(sectionId, flat) {
  const SKIP_PREFIXES = new Set(['template', 'section', 'common', 'ui']);
  const sWords = wordSet(sectionId);

  // Collect all first-segment prefixes from flat keys with counts
  const prefixCounts = new Map();
  for (const k of Object.keys(flat)) {
    const seg = k.split('.')[0];
    if (!SKIP_PREFIXES.has(seg)) {
      prefixCounts.set(seg, (prefixCounts.get(seg) ?? 0) + 1);
    }
  }

  for (const [prefix] of prefixCounts) {
    // Exact or camelCase exact match → return immediately
    if (prefix === sectionId || prefix === toCamel(sectionId)) return prefix;
  }

  // Fuzzy: find the prefix whose words best overlap with sectionId words
  let bestPrefix = sectionId;
  let bestScore = 0;
  for (const [prefix, count] of prefixCounts) {
    if (count < 2) continue;
    const pWords = wordSet(prefix);
    const score = overlapScore(sWords, pWords);
    if (score > bestScore) {
      bestScore = score;
      bestPrefix = prefix;
    }
  }
  return bestPrefix;
}

/**
 * Collect all candidate label entries under a flat prefix.
 * Returns [{key, path, words, value}] for .label keys AND direct string leaf values.
 */
function collectPrefixLabelEntries(prefix, flat) {
  const entries = [];
  const seen = new Set();

  for (const [k, v] of Object.entries(flat)) {
    if (typeof v !== 'string' || !v) continue;
    if (!k.startsWith(prefix + '.')) continue;

    const rest = k.slice(prefix.length + 1);

    if (rest === 'label') {
      // prefix.label itself
      if (!seen.has(k)) {
        entries.push({ key: k, path: '', words: new Set(), value: v });
        seen.add(k);
      }
    } else if (rest.endsWith('.label')) {
      const path = rest.slice(0, -6); // strip ".label"
      if (!seen.has(k)) {
        entries.push({ key: k, path, words: wordSet(path), value: v });
        seen.add(k);
      }
    } else if (!rest.includes('.')) {
      // Direct leaf value at prefix.key (e.g., margins.comment = "...")
      // Only include if no prefix.key.label also exists (i.e., this IS the label)
      if (!flat[k + '.label'] && !seen.has(k)) {
        entries.push({ key: k, path: rest, words: wordSet(rest), value: v });
        seen.add(k);
      }
    }
  }
  return entries;
}

/**
 * Collect translated options from flat keys, ordered to match the core options array.
 * Uses word-overlap between the camelCase flat option key suffix and the English core option string.
 */
function collectAndAlignOptions(flat, optPrefixes, coreOptions) {
  if (!Array.isArray(coreOptions) || coreOptions.length === 0) return null;

  // Collect candidate (key suffix, value) pairs from all option prefixes
  const candidates = [];
  const seenKeys = new Set();
  for (const prefix of optPrefixes) {
    for (const [k, v] of Object.entries(flat)) {
      if (!k.startsWith(prefix) || typeof v !== 'string' || !v) continue;
      const rest = k.slice(prefix.length);
      if (rest === 'label' || rest === 'note' || rest === 'comment') continue;
      if (rest.includes('.')) continue; // only leaf values
      if (!seenKeys.has(k)) {
        candidates.push({ suffix: rest, value: v });
        seenKeys.add(k);
      }
    }
  }
  if (candidates.length === 0) return null;

  // If candidate count matches core count exactly and scoring is ambiguous, use insertion order
  if (candidates.length === coreOptions.length) {
    // Try ordering by key word match first; fall back to positional
    const result = new Array(coreOptions.length).fill('');
    const usedCandIdx = new Set();
    for (const [i, coreOpt] of coreOptions.entries()) {
      const cWords = wordSet(typeof coreOpt === 'string' ? coreOpt : String(coreOpt));
      let best = -1, bestSc = 0;
      for (const [j, cand] of candidates.entries()) {
        if (usedCandIdx.has(j)) continue;
        const sc = overlapScore(cWords, wordSet(cand.suffix));
        if (sc > bestSc) { bestSc = sc; best = j; }
      }
      if (best >= 0 && bestSc > 0) {
        result[i] = candidates[best].value;
        usedCandIdx.add(best);
      }
    }
    // Fill unmatched positions positionally
    let candPos = 0;
    for (let i = 0; i < result.length; i++) {
      if (!result[i]) {
        while (candPos < candidates.length && usedCandIdx.has(candPos)) candPos++;
        if (candPos < candidates.length) { result[i] = candidates[candPos].value; usedCandIdx.add(candPos++); }
      }
    }
    return result.filter(s => s.length > 0).length > 0 ? result.filter(s => s.length > 0) : null;
  }

  // More candidates than core options (or fewer): match by word overlap, allow gaps
  const result = new Array(coreOptions.length).fill('');
  const usedCandIdx = new Set();
  for (const [i, coreOpt] of coreOptions.entries()) {
    const cWords = wordSet(typeof coreOpt === 'string' ? coreOpt : String(coreOpt));
    let best = -1, bestSc = 0;
    for (const [j, cand] of candidates.entries()) {
      if (usedCandIdx.has(j)) continue;
      const sc = overlapScore(cWords, wordSet(cand.suffix));
      if (sc > bestSc) { bestSc = sc; best = j; }
    }
    if (best >= 0 && bestSc > 0) {
      result[i] = candidates[best].value;
      usedCandIdx.add(best);
    }
  }
  // Append any unmatched candidates
  for (const [j, cand] of candidates.entries()) {
    if (!usedCandIdx.has(j)) result.push(cand.value);
  }
  return result.filter(s => s.length > 0).length > 0 ? result.filter(s => s.length > 0) : null;
}

function extractFlatKeysSection(sectionId, coreSection, flat) {
  const sectionLabel = findFlatValue(flat, [`section.${sectionId}`, `section.${toCamel(sectionId)}`]);
  const prefix = findSectionPrefix(sectionId, flat);

  const coreSectionFields = asRecord(coreSection.fields) ?? {};
  const labelEntries = collectPrefixLabelEntries(prefix, flat);

  // Score all (field, labelEntry) pairs and do greedy assignment
  const scored = [];
  for (const [fieldId] of Object.entries(coreSectionFields)) {
    const fWords = wordSet(fieldId);
    for (const entry of labelEntries) {
      const score = overlapScore(fWords, entry.words);
      scored.push({ fieldId, entry, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);

  const fieldLabels = {};
  const usedKeys = new Set();
  for (const { fieldId, entry, score } of scored) {
    if (score <= 0) continue;
    if (fieldLabels[fieldId]) continue;
    if (usedKeys.has(entry.key)) continue;
    fieldLabels[fieldId] = entry;
    usedKeys.add(entry.key);
  }

  // Fallback: if a field still has no label, try the section-level "prefix.label" key
  // (handles cases like additionalFindings.label for the single "findings" field)
  const prefixLabelEntry = labelEntries.find(e => e.path === '' && e.words.size === 0);
  if (prefixLabelEntry && !usedKeys.has(prefixLabelEntry.key)) {
    for (const fieldId of Object.keys(coreSectionFields)) {
      if (!fieldLabels[fieldId]) {
        fieldLabels[fieldId] = prefixLabelEntry;
        usedKeys.add(prefixLabelEntry.key);
        break; // assign only to first unmatched field
      }
    }
  }

  // Build fields
  const fields = {};
  for (const [fieldId, fieldValue] of Object.entries(coreSectionFields)) {
    const labelEntry = fieldLabels[fieldId];
    const fieldRecord = asRecord(fieldValue) ?? {};
    const coreOptions = Array.isArray(fieldRecord.options) ? fieldRecord.options : [];

    // Build option prefix list from label path and fallbacks
    const optPrefixes = [];
    if (labelEntry) {
      const labelPath = labelEntry.key.slice(prefix.length + 1).replace(/\.label$/, '');
      const parts = labelPath.split('.').filter(Boolean);
      // Try path.* and parent.* and grandparent.*
      if (parts.length > 0) {
        optPrefixes.push(prefix + '.' + labelPath + '.');
        if (parts.length > 1) optPrefixes.push(prefix + '.' + parts.slice(0, -1).join('.') + '.');
        if (parts.length > 2) optPrefixes.push(prefix + '.' + parts.slice(0, -2).join('.') + '.');
      }
    }
    optPrefixes.push(prefix + '.' + toCamel(fieldId) + '.');
    optPrefixes.push(prefix + '.' + fieldId + '.');
    // Last resort: collect options directly at the section prefix level (e.g. additionalFindings.*)
    optPrefixes.push(prefix + '.');

    const orderedOptions = collectAndAlignOptions(flat, optPrefixes, coreOptions);

    const entry = {};
    if (labelEntry?.value) entry.label = labelEntry.value;
    if (orderedOptions && orderedOptions.length > 0) entry.options = orderedOptions;

    if (Object.keys(entry).length > 0) fields[fieldId] = entry;
  }

  const result = {};
  if (sectionLabel) result.label = sectionLabel;
  if (Object.keys(fields).length > 0) result.fields = fields;
  return result;
}

function findFlatValue(flat, keys) {
  for (const k of keys) {
    const v = flat[k];
    if (typeof v === 'string' && v.length > 0) return v;
    // Case-insensitive search
    const lk = k.toLowerCase();
    for (const [fk, fv] of Object.entries(flat)) {
      if (fk.toLowerCase() === lk && typeof fv === 'string' && fv.length > 0) return fv;
    }
  }
  return '';
}

/**
 * Collect option translations from flat keys.
 * Looks for all keys under the given prefix that are NOT sub-section labels.
 * Returns values in insertion order.
 */
function collectFlatOptions(flat, prefixes, coreOptions) {
  const coreCount = Array.isArray(coreOptions) ? coreOptions.length : 0;
  if (coreCount === 0) return null;

  for (const prefix of prefixes) {
    const matching = [];
    for (const [k, v] of Object.entries(flat)) {
      if (k.startsWith(prefix) && typeof v === 'string') {
        const rest = k.slice(prefix.length);
        // Skip if it's a deeper path (has a dot after the prefix) that ends in .label
        // or is a metadata key
        if (rest === 'label' || rest === 'note' || rest === 'comment') continue;
        // Only collect leaf values (no further dot) to avoid sub-field labels
        if (!rest.includes('.')) {
          matching.push(v);
        }
      }
    }
    if (matching.length > 0) return matching;
  }
  return null;
}

/**
 * template_name format: { templateName: { metadata, fieldId: { label, options }, ... } }
 * All fields are flat under the wrapper, regardless of section
 */
function extractTemplateNameSection(sectionId, coreSection, wrapper) {
  if (!wrapper) return {};
  // The wrapper has all fields from all sections at the top level.
  // Field keys in i18n may differ from core field IDs (e.g. lymphovascular_invasion vs lymphatic_or_vascular_invasion).
  const coreSectionFields = asRecord(coreSection.fields) ?? {};
  const fields = {};
  for (const [fieldId, fieldValue] of Object.entries(coreSectionFields)) {
    // Try: exact key, sectionId wrapper (section acts as the field), then try alternate names
    const candidates = [
      asRecord(wrapper[fieldId]),
      // Also try wrapper[sectionId] which bundles the section's single-field translation
      asRecord(wrapper[sectionId]),
    ].filter(Boolean);

    const fieldRec = candidates[0];
    if (!fieldRec) continue;

    const entry = {};
    // field_label overrides label (some formats store section label separately)
    const labelStr = asString(fieldRec.field_label ?? fieldRec.label ?? '');
    if (labelStr) entry.label = labelStr;
    const optArr = optionsToArray(fieldRec.options);
    if (optArr) entry.options = optArr;
    // Recurse nested
    const childCoreFields = asRecord((asRecord(fieldValue) ?? {}).fields);
    if (childCoreFields) {
      const nestedFields = {};
      for (const [nk] of Object.entries(childCoreFields)) {
        const nRec = asRecord(wrapper[nk]) ?? asRecord(wrapper[fieldId + '_' + nk]);
        if (!nRec) continue;
        const nEntry = {};
        const nLabel = asString(nRec.field_label ?? nRec.label ?? '');
        if (nLabel) nEntry.label = nLabel;
        const nOpts = optionsToArray(nRec.options);
        if (nOpts) nEntry.options = nOpts;
        if (Object.keys(nEntry).length > 0) nestedFields[nk] = nEntry;
      }
      if (Object.keys(nestedFields).length > 0) entry.fields = nestedFields;
    }
    if (Object.keys(entry).length > 0) fields[fieldId] = entry;
  }
  const result = {};
  // Use sectionId key to get the section label if available
  const sectionRec = asRecord(wrapper[sectionId]);
  const sectionLabel = asString(sectionRec?.label ?? coreSection.label ?? '');
  if (sectionLabel) result.label = sectionLabel;
  if (Object.keys(fields).length > 0) result.fields = fields;
  return result;
}

/**
 * dcis_wrapper format: { templateName: { template: {...}, sections: { sectionId: "..." }, sectionId: { fieldId: { label, options } } } }
 */
function extractDcisWrapperSection(sectionId, coreSection, sectionLabel, raw) {
  const coreSectionFields = asRecord(coreSection.fields) ?? {};
  const fields = {};
  for (const [fieldId] of Object.entries(coreSectionFields)) {
    const fieldRec = asRecord(raw[fieldId]);
    if (!fieldRec) continue;
    const entry = {};
    if (typeof fieldRec.label === 'string') entry.label = fieldRec.label;
    const optArr = optionsToArray(fieldRec.options);
    if (optArr) entry.options = optArr;
    if (Object.keys(entry).length > 0) fields[fieldId] = entry;
  }
  const result = {};
  if (sectionLabel) result.label = sectionLabel;
  if (Object.keys(fields).length > 0) result.fields = fields;
  return result;
}

// ─── string helpers ──────────────────────────────────────────────────────────

function toCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// ─── template metadata extraction ───────────────────────────────────────────

function extractTitle(i18n, format, templateName) {
  switch (format) {
    case 'meta_doc':
      return asString(asRecord(i18n.meta)?.title ?? asRecord(i18n.protocol)?.title ?? '');
    case 'flat_keys_keyed':
      return asString(i18n.keys?.['template.title'] ?? '');
    case 'flat_keys':
      return asString(i18n['template.title'] ?? i18n['template.Title'] ?? '');
    case 'template_doc':
      return asString(asRecord(i18n.template)?.title ?? '');
    case 'sections_wrapper':
      return asString(asRecord(i18n.meta)?.template ?? '');
    case 'template_name':
      return asString(asRecord(i18n[templateName])?.metadata?.title ?? '');
    case 'dcis_wrapper':
      return asString(asRecord(asRecord(i18n[templateName])?.template)?.title ?? '');
    case 'proto_doc':
      return asString(i18n.protocol_title ?? '');
    default:
      return '';
  }
}

function extractLang(i18n, format, templateName) {
  switch (format) {
    case 'meta_doc':
      return asString(asRecord(i18n.meta)?.language ?? '');
    case 'flat_keys_keyed':
      return asString(i18n.locale ?? '');
    case 'flat_keys':
      return asString(i18n['template.language'] ?? '');
    case 'template_doc':
      return asString(asRecord(i18n.template)?.lang ?? asRecord(i18n.template)?.language ?? '');
    case 'sections_wrapper':
      return asString(asRecord(i18n.meta)?.lang ?? '');
    case 'template_name':
      return '';
    case 'dcis_wrapper':
      return '';
    case 'proto_doc':
      return '';
    default:
      return '';
  }
}

// ─── prostate-specific converter ────────────────────────────────────────────

/**
 * Prostate radical prostatectomy uses a flat_keys_keyed format where:
 * - Section labels come from "section.*" keys
 * - Field labels come from "<sectionAlias>.<fieldAlias>.label" keys
 * - Options are individual values under "<sectionAlias>.<fieldAlias>.*" OR "common.*"
 *
 * The section/field aliases differ from the core paths, so we need explicit mapping.
 */
function buildProstateOutput(keys, coreTemplateId) {
  const k = keys; // shorthand

  // Helper to collect options from an array of flat key names
  const opt = (...flatKeys) => flatKeys.map(fk => asString(k[fk])).filter(Boolean);

  return {
    template_id: coreTemplateId,
    lang: asString(k['template.language'] ?? k['locale'] ?? ''),
    title: asString(k['template.title'] ?? ''),

    specimen: {
      label: asString(k['section.specimen'] ?? ''),
      fields: {
        procedure: {
          label: asString(k['specimen.procedure.label'] ?? ''),
          options: opt(
            'specimen.procedure.radical_prostatectomy',
            'common.other_specify',
            'common.not_specified',
          ),
        },
        prostate_weight_g: { label: asString(k['specimen.prostate_weight_g'] ?? '') },
        prostate_size_cm: { label: asString(k['specimen.prostate_size_cm'] ?? '') },
        additional_prostate_dimensions_cm: { label: asString(k['specimen.additional_dimension_cm'] ?? '') },
      },
    },

    tumor: {
      label: asString(k['section.tumor'] ?? ''),
      fields: {
        histologic_type: {
          label: asString(k['tumor.histologic_type.label'] ?? ''),
          fields: {
            category: {
              label: asString(k['tumor.histologic_type.label'] ?? ''),
              options: opt(
                'tumor.histologic_type.glandular',
                'tumor.histologic_type.squamous',
                'tumor.histologic_type.neuroendocrine',
                'tumor.histologic_type.other_not_listed',
                'tumor.histologic_type.cannot_determine',
              ),
            },
            type: {
              label: asString(k['tumor.histologic_type.label'] ?? ''),
              options: opt(
                'tumor.histologic_type.acinar_conventional',
                'tumor.histologic_type.acinar_signet_ring_like',
                'tumor.histologic_type.acinar_pleomorphic_giant_cell',
                'tumor.histologic_type.acinar_sarcomatoid',
                'tumor.histologic_type.acinar_pin_like',
                'tumor.histologic_type.intraductal_carcinoma',
                'tumor.histologic_type.ductal_adenocarcinoma',
                'tumor.histologic_type.adenosquamous',
                'tumor.histologic_type.squamous_cell',
                'tumor.histologic_type.basal_cell_adenoid_cystic',
                'tumor.histologic_type.adeno_neuroendocrine_diff',
                'tumor.histologic_type.well_diff_net',
                'tumor.histologic_type.small_cell_nec',
                'tumor.histologic_type.large_cell_nec',
                'tumor.histologic_type.other_not_listed',
                'tumor.histologic_type.cannot_determine',
              ),
            },
            comment: { label: asString(k['tumor.histologic_type.comment'] ?? '') },
          },
        },
        histologic_grade: {
          label: asString(k['tumor.histologic_grade.label'] ?? ''),
          fields: {
            grade_group: {
              label: asString(k['tumor.grade.label'] ?? ''),
              options: opt(
                'tumor.grade.group_1_gleason_3_3_6',
                'tumor.grade.group_2_gleason_3_4_7',
                'tumor.grade.group_3_gleason_4_3_7',
                'tumor.grade.group_4_gleason_4_4_8',
                'tumor.grade.group_4_gleason_3_5_8',
                'tumor.grade.group_4_gleason_5_3_8',
                'tumor.grade.group_5_gleason_4_5_9',
                'tumor.grade.group_5_gleason_5_4_9',
                'tumor.grade.group_5_gleason_5_5_10',
                'tumor.grade.cannot_be_assessed',
                'common.not_applicable',
              ),
            },
            minor_tertiary_pattern_5_for_group_2: {
              label: asString(k['tumor.grade.minor_tertiary_pattern_5'] ?? ''),
              options: opt('common.not_applicable_not_identified', 'common.present'),
            },
            pattern_4_percentage_for_group_2: {
              label: asString(k['tumor.grade.percentage_pattern_4'] ?? ''),
              options: opt(
                'common.less_equal_5_percent', 'common.6_10_percent', 'common.11_20_percent',
                'common.21_30_percent', 'common.31_40_percent', 'common.greater_40_percent',
              ),
            },
            minor_tertiary_pattern_5_for_group_3: {
              label: asString(k['tumor.grade.minor_tertiary_pattern_5'] ?? ''),
              options: opt('common.not_applicable_not_identified', 'common.present'),
            },
            pattern_4_percentage_for_group_3: {
              label: asString(k['tumor.grade.percentage_pattern_4'] ?? ''),
              options: opt(
                'common.less_61_percent', 'common.61_70_percent', 'common.71_80_percent',
                'common.81_90_percent', 'common.greater_90_percent',
              ),
            },
            pattern_4_percentage_if_greater_than_7: { label: asString(k['tumor.grade.percent_pattern_4_gt7'] ?? '') },
            pattern_5_percentage_if_greater_than_7: { label: asString(k['tumor.grade.percent_pattern_5_gt7'] ?? '') },
          },
        },
        intraductal_carcinoma: {
          label: asString(k['tumor.idc.label'] ?? ''),
          fields: {
            status: {
              label: asString(k['tumor.idc.label'] ?? ''),
              options: opt('common.not_identified', 'common.present'),
            },
            incorporated_into_grade: {
              label: asString(k['tumor.idc.incorporated_into_grade'] ?? ''),
              options: opt('common.yes', 'common.no', 'common.cannot_be_determined'),
            },
          },
        },
        cribriform_glands: {
          label: asString(k['tumor.cribriform_glands.label'] ?? ''),
          fields: {
            status: {
              label: asString(k['tumor.cribriform_glands.label'] ?? ''),
              options: opt('common.not_applicable', 'common.not_identified', 'common.present', 'common.cannot_be_determined'),
            },
          },
        },
        treatment_effect: {
          label: asString(k['tumor.treatment_effect.label'] ?? ''),
          fields: {
            effects: {
              label: asString(k['tumor.treatment_effect.label'] ?? ''),
              options: opt(
                'tumor.treatment_effect.no_known_presurgical',
                'common.not_identified',
                'tumor.treatment_effect.radiation_present',
                'tumor.treatment_effect.hormonal_present',
                'tumor.treatment_effect.other_present',
                'common.cannot_be_determined',
              ),
            },
          },
        },
      },
    },

    tumor_quantitation: {
      label: asString(k['section.tumor_quantitation'] ?? k['tumor_quantitation.label'] ?? ''),
      fields: {
        quantitation_methods: {
          label: asString(k['tumor_quantitation.label'] ?? ''),
          options: opt('tumor_quantitation.via_percentage', 'tumor_quantitation.via_dimension'),
        },
        estimated_percentage_of_prostate_involved: {
          label: asString(k['tumor_quantitation.estimated_percent_prostate_involved'] ?? ''),
          options: opt(
            'common.less_1_percent', 'common.1_5_percent', 'common.6_10_percent',
            'common.11_20_percent', 'common.21_30_percent', 'common.31_40_percent',
            'common.41_50_percent', 'common.51_60_percent', 'common.61_70_percent',
            'common.71_80_percent', 'common.81_90_percent', 'common.greater_90_percent',
            'common.cannot_be_determined',
          ),
        },
        dominant_nodule_greatest_dimension_mm: { label: asString(k['tumor_quantitation.greatest_dimension_dominant_nodule_mm'] ?? '') },
        dominant_nodule_additional_dimensions_mm: { label: asString(k['tumor_quantitation.additional_dimension_dominant_nodule_mm'] ?? '') },
        dominant_nodule_location: { label: asString(k['tumor_quantitation.location_dominant_nodule'] ?? '') },
      },
    },

    extension_and_invasion: {
      label: asString(k['section.extension_and_invasion'] ?? ''),
      fields: {
        extraprostatic_extension: {
          label: asString(k['tumor.epe.label'] ?? ''),
          fields: {
            status: {
              label: asString(k['tumor.epe.label'] ?? ''),
              options: opt(
                'common.not_identified',
                'tumor.epe.present_focal',
                'tumor.epe.present_nonfocal',
                'common.cannot_be_determined',
              ),
            },
            locations: {
              label: asString(k['tumor.epe.location_label'] ?? ''),
              options: opt(
                'common.right_apical', 'common.right_bladder_neck', 'common.right_anterior',
                'common.right_lateral', 'common.right_posterolateral_neurovascular_bundle', 'common.right_posterior',
                'common.left_apical', 'common.left_bladder_neck', 'common.left_anterior',
                'common.left_lateral', 'common.left_posterolateral_neurovascular_bundle', 'common.left_posterior',
                'common.other_specify', 'common.cannot_be_determined',
              ),
            },
          },
        },
        urinary_bladder_neck_invasion: {
          label: asString(k['tumor.urinary_bladder_neck_invasion.label'] ?? ''),
          fields: {
            status: {
              label: asString(k['tumor.urinary_bladder_neck_invasion.label'] ?? ''),
              options: opt('common.not_identified', 'common.present', 'common.cannot_be_determined'),
            },
          },
        },
        seminal_vesicle_invasion: {
          label: asString(k['tumor.seminal_vesicle_invasion.label'] ?? ''),
          fields: {
            status: {
              label: asString(k['tumor.seminal_vesicle_invasion.label'] ?? ''),
              options: opt(
                'common.not_identified',
                'tumor.seminal_vesicle.present_right',
                'tumor.seminal_vesicle.present_left',
                'tumor.seminal_vesicle.present_bilateral',
                'tumor.seminal_vesicle.present_laterality_cannot_be_determined',
                'tumor.seminal_vesicle.no_seminal_vesicle_present',
                'common.cannot_be_determined',
              ),
            },
          },
        },
        lymphovascular_invasion: {
          label: asString(k['tumor.lvi.label'] ?? ''),
          fields: {
            status: {
              label: asString(k['tumor.lvi.label'] ?? ''),
              options: opt('common.not_identified', 'common.present', 'common.cannot_be_determined'),
            },
          },
        },
        perineural_invasion: {
          label: asString(k['tumor.perineural_invasion.label'] ?? ''),
          fields: {
            status: {
              label: asString(k['tumor.perineural_invasion.label'] ?? ''),
              options: opt('common.not_identified', 'common.present', 'common.cannot_be_determined'),
            },
          },
        },
      },
    },

    margins: {
      label: asString(k['section.margins'] ?? ''),
      fields: {
        margin_status: {
          label: asString(k['margins.status.label'] ?? ''),
          fields: {
            status: {
              label: asString(k['margins.status.label'] ?? ''),
              options: opt(
                'margins.cannot_be_assessed',
                'margins.all_negative',
                'margins.invasive_present',
              ),
            },
            linear_length_involved: {
              label: asString(k['margins.linear_length_involved.label'] ?? ''),
              fields: {
                length_type: {
                  label: asString(k['margins.linear_length_involved.label'] ?? ''),
                  options: opt(
                    'margins.specify_exact_length_mm',
                    'margins.less_than_3mm_limited',
                    'margins.greater_equal_3mm_nonlimited',
                  ),
                },
              },
            },
            focality: {
              label: asString(k['margins.focality.label'] ?? ''),
              options: opt('margins.unifocal', 'margins.multifocal'),
            },
            margins_involved: {
              label: asString(k['margins.involved_by_invasive.label'] ?? ''),
              fields: {
                margin: {
                  label: asString(k['margins.involved_by_invasive.label'] ?? ''),
                  options: opt(
                    'common.right_apical', 'common.right_bladder_neck', 'common.right_anterior',
                    'common.right_lateral', 'common.right_posterolateral_neurovascular_bundle', 'common.right_posterior',
                    'common.left_apical', 'common.left_bladder_neck', 'common.left_anterior',
                    'common.left_lateral', 'common.left_posterolateral_neurovascular_bundle', 'common.left_posterior',
                    'common.other_specify', 'common.cannot_be_determined',
                  ),
                },
              },
            },
          },
        },
        involvement_in_epe_area: {
          label: asString(k['margins.involvement_in_epe_area.label'] ?? ''),
          options: opt('common.not_identified', 'common.present', 'common.cannot_be_determined'),
        },
        gleason_pattern_at_margin: {
          label: asString(k['margins.gleason_pattern_at_margin.label'] ?? ''),
          options: opt('common.pattern_3', 'common.pattern_4', 'common.pattern_5'),
        },
      },
    },

    regional_lymph_nodes: {
      label: asString(k['section.regional_lymph_nodes'] ?? ''),
      fields: {
        regional_lymph_node_status: {
          label: asString(k['nodes.status.label'] ?? ''),
          options: opt(
            'nodes.not_applicable_none_submitted',
            'nodes.present',
            'nodes.all_negative',
            'nodes.tumor_present',
          ),
        },
        number_of_positive_lymph_nodes: {
          label: asString(k['nodes.number_with_tumor.label'] ?? ''),
          fields: {
            count_type: {
              label: asString(k['nodes.number_with_tumor.label'] ?? ''),
              options: opt('common.exact_number_specify', 'common.at_least_specify'),
            },
          },
        },
        sites_of_involved_nodes: {
          label: asString(k['nodes.sites_with_tumor.label'] ?? ''),
          fields: {
            laterality: {
              label: asString(k['nodes.laterality.label'] ?? ''),
              options: opt('common.right', 'common.left'),
            },
            site: {
              label: asString(k['nodes.sites_with_tumor.label'] ?? ''),
              options: opt(
                'nodes.site.hypogastric', 'nodes.site.obturator', 'nodes.site.internal_iliac',
                'nodes.site.external_iliac', 'nodes.site.iliac_nos', 'nodes.site.pelvic_nos',
                'nodes.site.lateral_sacral', 'nodes.site.presacral', 'nodes.site.promontory', 'nodes.site.sacral_nos',
              ),
            },
          },
        },
        largest_metastatic_deposit_size: {
          label: asString(k['nodes.largest_met_deposit_size.label'] ?? ''),
          fields: {
            size_type: {
              label: asString(k['nodes.largest_met_deposit_size.label'] ?? ''),
              options: opt('common.exact_size_cm', 'common.at_least_cm', 'common.greater_than_cm', 'common.less_than_cm'),
            },
          },
        },
        extranodal_extension: {
          label: asString(k['nodes.extranodal_extension.label'] ?? ''),
          fields: {
            status: {
              label: asString(k['nodes.extranodal_extension.label'] ?? ''),
              options: opt('common.not_identified', 'common.present', 'common.cannot_be_determined'),
            },
          },
        },
        total_number_examined: { label: asString(k['nodes.number_examined.label'] ?? '') },
      },
    },

    distant_metastasis: {
      label: asString(k['section.distant_metastasis'] ?? ''),
      fields: {
        sites_involved: {
          label: asString(k['metastasis.distant_sites.label'] ?? ''),
          options: opt(
            'common.not_applicable',
            'metastasis.nonregional_lymph_nodes',
            'metastasis.bone',
            'common.other_specify',
            'common.cannot_be_determined',
          ),
        },
      },
    },

    ptnm_classification: {
      label: asString(k['section.ptnm_classification'] ?? ''),
      fields: {
        modified_classification: {
          label: asString(k['ptnm.modified_classification.label'] ?? ''),
          options: opt('ptnm.modified.y_post_neoadjuvant', 'ptnm.modified.r_recurrence'),
        },
        pT_category: {
          label: asString(k['ptnm.pt_category.label'] ?? ''),
          options: opt(
            'ptnm.pt2',
            'ptnm.pt3a',
            'ptnm.pt3b',
            'ptnm.pt3_subcategory_cannot',
            'ptnm.pt4',
          ),
        },
        T_suffix: {
          label: asString(k['ptnm.t_suffix.label'] ?? ''),
          options: opt('common.not_applicable', 'ptnm.t_suffix.multiple'),
        },
        pN_category: {
          label: asString(k['ptnm.pn_category.label'] ?? ''),
          options: opt(
            'ptnm.pn_not_assigned_no_nodes',
            'ptnm.pn_not_assigned_cannot',
            'ptnm.pn0',
            'ptnm.pn1',
          ),
        },
        pM_category: {
          label: asString(k['ptnm.pm_category.label'] ?? ''),
          options: opt(
            'ptnm.pm_not_applicable',
            'ptnm.pm1a',
            'ptnm.pm1b',
            'ptnm.pm1c',
            'ptnm.pm1_subcategory_cannot',
          ),
        },
      },
    },

    additional_findings: {
      label: asString(k['section.additional_findings'] ?? ''),
      fields: {
        findings: {
          label: asString(k['additional_findings.label'] ?? ''),
          options: opt(
            'common.none_identified',
            'additional_findings.aip',
            'additional_findings.high_grade_pin',
            'additional_findings.adenosis',
            'additional_findings.nodular_hyperplasia',
            'additional_findings.inflammation',
          ),
        },
      },
    },
  };
}

// ─── main conversion logic ───────────────────────────────────────────────────

function convertI18nFile(templateKey, lang) {
  const parts = templateKey.split('/');
  const stemName = parts[parts.length - 1];
  const relDir = parts.slice(0, -1).join(path.sep);
  const templateDir = path.join(assetRoot, relDir);

  const corePath = path.join(templateDir, `${stemName}.core.json`);
  const i18nPath = path.join(templateDir, `${stemName}.i18n_${lang}.json`);

  let core, i18n;
  try {
    core = JSON.parse(readFileSync(corePath, 'utf8'));
  } catch (e) {
    console.error(`  ERROR reading core: ${corePath}: ${e.message}`);
    return false;
  }
  try {
    i18n = JSON.parse(readFileSync(i18nPath, 'utf8'));
  } catch (e) {
    console.error(`  ERROR reading i18n: ${i18nPath}: ${e.message}`);
    return false;
  }

  const format = detectFormat(i18n);
  const templateName = stemName; // e.g. "uterine_cervix_biopsy"

  if (format === 'label_fields') {
    console.log(`  SKIP ${stemName}.i18n_${lang}.json (already in label/fields format)`);
    return true;
  }

  if (format === 'unknown') {
    console.warn(`  WARN ${stemName}.i18n_${lang}.json: unknown format, skipping`);
    return false;
  }

  console.log(`  Converting ${stemName}.i18n_${lang}.json [${format}]`);

  // Prostate uses a hand-crafted converter that maps known flat keys directly
  if (format === 'flat_keys_keyed') {
    const coreId = asString(core.template_id ?? core.templateId ?? stemName);
    const flatKeys = asRecord(i18n.keys) ?? {};
    const output = buildProstateOutput(flatKeys, coreId);
    output.lang = asString(i18n.locale ?? '') || lang;
    output.title = asString(flatKeys['template.title'] ?? '');
    writeFileSync(i18nPath, JSON.stringify(output, null, 2), 'utf8');
    return true;
  }

  const title = extractTitle(i18n, format, templateName);
  const detectedLang = extractLang(i18n, format, templateName) || lang;

  // Build output
  const output = {};

  // Template metadata
  const coreTemplateId = asString(core.template_id ?? core.templateId ?? stemName);
  output.template_id = coreTemplateId;
  output.lang = detectedLang || lang;
  if (title) output.title = title;

  // Walk core sections (filter out metadata keys)
  const CORE_META = new Set(['template_id', 'templateId', 'domain', 'title', 'protocol_posting_date', 'standards', 'note']);
  for (const [sectionId, sectionValue] of Object.entries(core)) {
    if (CORE_META.has(sectionId)) continue;
    const sectionRecord = asRecord(sectionValue);
    if (!sectionRecord) continue;
    // Must have a "fields" key to be a real section
    if (!asRecord(sectionRecord.fields) && !Array.isArray(sectionRecord.fields)) {
      // Might still be a valid section (fields could be empty)
      // Include if it has a label
      if (typeof sectionRecord.label !== 'string') continue;
    }

    const sectionTranslation = extractSection(sectionId, sectionRecord, i18n, format, templateName);

    if (Object.keys(sectionTranslation).length > 0) {
      output[sectionId] = sectionTranslation;
    }
  }

  // Write the new file
  writeFileSync(i18nPath, JSON.stringify(output, null, 2), 'utf8');
  return true;
}

// ─── entry point ────────────────────────────────────────────────────────────

let converted = 0;
let skipped = 0;
let failed = 0;

for (const templateKey of TEMPLATES) {
  const stemName = path.basename(templateKey);
  console.log(`\nProcessing: ${stemName}`);
  for (const lang of TEMPLATE_LANGS) {
    const ok = convertI18nFile(templateKey, lang);
    if (ok === true) converted++;
    else if (ok === false) failed++;
    else skipped++;
  }
}

console.log(`\n✅ Done. Converted: ${converted}, Skipped: ${skipped}, Failed: ${failed}`);
