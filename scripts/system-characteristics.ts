/**
 * Regenerates the "Implemented system characteristics" table (manuscript Table 2)
 * directly from the repository, so every published figure has a reproducible source.
 *
 * Reads only static repository content — no database connection is required.
 *
 *   pnpm metrics:system
 *
 * Writes docs/verification/system-characteristics.{md,json}.
 *
 * Every count is emitted alongside the rule used to produce it. A bare number in a
 * manuscript cannot be checked by a reviewer; a number plus its counting rule can.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'docs', 'verification');

const templateAssetRoot = path.join(repoRoot, 'packages', 'shared', 'src', 'templates', 'assets');
const schemaPath = path.join(repoRoot, 'prisma', 'schema.prisma');
const referenceDataPath = path.join(
  repoRoot,
  'prisma',
  'migrations',
  '20260609000000_seed_reference_data',
  'migration.sql'
);
const seedPath = path.join(repoRoot, 'prisma', 'seed.ts');

interface Metric {
  characteristic: string;
  value: number | string;
  rule: string;
}

interface MetricGroup {
  group: string;
  metrics: Metric[];
}

// ─── Structured reporting templates ─────────────────────────────────────────

type TemplateClass = 'gross' | 'microscopic' | 'cytology';

function walkJsonFiles(dirPath: string): string[] {
  const filePaths: string[] = [];

  for (const entry of readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    if (statSync(fullPath).isDirectory()) {
      filePaths.push(...walkJsonFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.json')) {
      filePaths.push(fullPath);
    }
  }

  return filePaths;
}

/**
 * Mirrors `inferKind` in packages/shared/src/templates/server.ts (a template is a
 * gross template when its path contains a `/gross/` segment), then splits the
 * remaining reporting templates into cytology and microscopic by family suffix.
 * Classifying here rather than importing keeps the script runnable without a
 * prior `pnpm --filter @lis/shared build`.
 */
function classifyTemplate(relativePath: string): TemplateClass {
  if (relativePath.includes('/gross/')) return 'gross';
  const family = relativePath.split('/')[0] ?? '';
  return family.endsWith('_cytology') ? 'cytology' : 'microscopic';
}

function collectTemplateMetrics(): { group: MetricGroup; templateCount: number } {
  if (!existsSync(templateAssetRoot)) {
    throw new Error(`Template assets not found at ${templateAssetRoot}`);
  }

  const coreFiles = walkJsonFiles(templateAssetRoot)
    .filter((filePath) => filePath.endsWith('.core.json'))
    .map((filePath) => path.relative(templateAssetRoot, filePath).split(path.sep).join('/'));

  const counts: Record<TemplateClass, number> = { gross: 0, microscopic: 0, cytology: 0 };
  for (const relativePath of coreFiles) {
    counts[classifyTemplate(relativePath)] += 1;
  }

  const total = coreFiles.length;
  const rule = 'Count of `*.core.json` files under packages/shared/src/templates/assets (language overlay files excluded).';

  return {
    templateCount: total,
    group: {
      group: 'Structured reporting content',
      metrics: [
        {
          characteristic: 'Gross examination templates, malignant resection specimens',
          value: counts.gross,
          rule: `${rule} Gross = path contains a \`/gross/\` segment.`,
        },
        {
          characteristic: 'Microscopic reporting templates, malignant (CAP-aligned)',
          value: counts.microscopic,
          rule: `${rule} Microscopic = non-gross, family does not end in \`_cytology\`.`,
        },
        {
          characteristic: 'Cytology reporting templates (Bethesda, Milan, Paris, Yokohama)',
          value: counts.cytology,
          rule: `${rule} Cytology = non-gross, family ends in \`_cytology\`.`,
        },
        { characteristic: 'Total structured reporting templates', value: total, rule },
      ],
    },
  };
}

// ─── Ancillary testing catalog ──────────────────────────────────────────────

/** Extracts the `VALUES (...)` rows of a named INSERT block from the reference-data migration. */
function extractInsertRows(sql: string, tableName: string): string[] {
  const startIndex = sql.indexOf(`INSERT INTO ${tableName} (`);
  if (startIndex === -1) throw new Error(`INSERT INTO ${tableName} not found in ${referenceDataPath}`);

  const endIndex = sql.indexOf('ON CONFLICT', startIndex);
  if (endIndex === -1) throw new Error(`Unterminated INSERT INTO ${tableName} in ${referenceDataPath}`);

  return sql
    .slice(startIndex, endIndex)
    .split('\n')
    .map((line) => line.replace(/--.*$/, '').trim())
    .filter((line) => line.startsWith('('));
}

function countByCategory(rows: string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    // Rows are `('<name>', '<CATEGORY>', <sort_order>)`; the category is the
    // last quoted field, so a name containing a comma cannot skew the split.
    const quoted = row.match(/'((?:[^']|'')*)'/g);
    if (!quoted || quoted.length < 2) continue;
    const category = quoted[quoted.length - 1].slice(1, -1);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return counts;
}

function collectAncillaryMetrics(): MetricGroup {
  const sql = readFileSync(referenceDataPath, 'utf8');
  const orderables = countByCategory(extractInsertRows(sql, 'ancillary_orderable'));
  const panels = countByCategory(extractInsertRows(sql, 'ancillary_panel'));

  const totalPanels = [...panels.values()].reduce((sum, count) => sum + count, 0);
  const orderableRule = 'Rows in the `ancillary_orderable` INSERT of prisma/migrations/20260609000000_seed_reference_data/migration.sql.';
  const panelRule = 'Rows in the `ancillary_panel` INSERT of the same migration.';

  return {
    group: 'Ancillary testing catalog',
    metrics: [
      {
        characteristic: 'Ancillary test categories',
        value: orderables.size,
        rule: `Distinct categories present in the seeded catalog (${[...orderables.keys()].sort().join(', ')}). The AncillaryCategory enum additionally defines HE, which is applied to per-block H&E orders created at accessioning rather than ordered from the catalog.`,
      },
      {
        characteristic: 'Individual immunohistochemistry orderables',
        value: orderables.get('IHC') ?? 0,
        rule: `${orderableRule} Category = IHC.`,
      },
      {
        characteristic: 'Immunohistochemistry panels',
        value: panels.get('IHC') ?? 0,
        rule: `${panelRule} Category = IHC.`,
      },
      {
        characteristic: 'Molecular panels (colorectal, lung, PD-L1)',
        value: panels.get('MOLECULAR') ?? 0,
        rule: `${panelRule} Category = MOLECULAR.`,
      },
      {
        characteristic: 'Special stains',
        value: orderables.get('SPECIAL_STAIN') ?? 0,
        rule: `${orderableRule} Category = SPECIAL_STAIN.`,
      },
      {
        characteristic: 'Send-out categories',
        value: orderables.get('SEND_OUT') ?? 0,
        rule: `${orderableRule} Category = SEND_OUT.`,
      },
      { characteristic: 'Total preconfigured panels', value: totalPanels, rule: panelRule },
    ],
  };
}

// ─── Data model ─────────────────────────────────────────────────────────────

/**
 * Tables excluded from the "relational entities" headline count. These are
 * structural rather than domain entities; the exclusion is published alongside
 * the number so the count can be reproduced or contested.
 */
const NON_DOMAIN_MODELS: Record<string, string> = {
  AncillaryPanelItem: 'pure join table (panel ↔ orderable)',
  OrderSequenceYear: 'identifier-sequence counter',
  CustomTemplateTranslation: 'translation side-table',
};

function collectDataModelMetrics(): MetricGroup {
  const schema = readFileSync(schemaPath, 'utf8');
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
  const enums = [...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((match) => match[1]);

  const excluded = models.filter((model) => model in NON_DOMAIN_MODELS);
  const domainModels = models.length - excluded.length;
  const exclusionNote = excluded
    .map((model) => `${model} (${NON_DOMAIN_MODELS[model]})`)
    .join('; ');

  return {
    group: 'Data model',
    metrics: [
      {
        characteristic: 'Relational entities in the data model',
        value: domainModels,
        rule: `\`model\` blocks in prisma/schema.prisma (${models.length}) excluding ${excluded.length} structural tables: ${exclusionNote}. Enums are not counted as entities.`,
      },
      {
        characteristic: 'Total database tables',
        value: models.length,
        rule: 'All `model` blocks in prisma/schema.prisma, including join, sequence, and translation tables.',
      },
      {
        characteristic: 'Enumerated types',
        value: enums.length,
        rule: 'All `enum` blocks in prisma/schema.prisma.',
      },
    ],
  };
}

// ─── Demonstration data ─────────────────────────────────────────────────────

function collectDemonstrationDataMetrics(): MetricGroup {
  const seed = readFileSync(seedPath, 'utf8');

  const orderCount = seed.match(/const\s+ORDER_COUNT\s*=\s*(\d+)/)?.[1];
  const patientCount = seed.match(/const\s+PATIENT_COUNT\s*=\s*(\d+)/)?.[1];
  const rngSeed = seed.match(/makeRng\((\d+)\)/)?.[1];

  if (!orderCount) throw new Error(`Could not read ORDER_COUNT from ${seedPath}`);

  const metrics: Metric[] = [
    {
      characteristic: 'Synthetic demonstration cases',
      value: Number(orderCount),
      rule: '`ORDER_COUNT` in prisma/seed.ts. Run `pnpm db:characterize` against a seeded database for the realized case mix and stage distribution.',
    },
  ];

  if (patientCount) {
    metrics.push({
      characteristic: 'Synthetic patients',
      value: Number(patientCount),
      rule: '`PATIENT_COUNT` in prisma/seed.ts.',
    });
  }

  if (rngSeed) {
    metrics.push({
      characteristic: 'Pseudo-random generator seed',
      value: Number(rngSeed),
      rule: 'Seed passed to `makeRng` in prisma/seed.ts. Fixing this value is what makes the synthetic corpus byte-reproducible.',
    });
  }

  return { group: 'Data model and demonstration data', metrics };
}

// ─── Provenance ─────────────────────────────────────────────────────────────

function readCommitHash(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown (not a git checkout)';
  }
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function renderMarkdown(groups: MetricGroup[], commit: string, generatedAt: string): string {
  const lines = [
    '# Implemented system characteristics',
    '',
    'Generated by `pnpm metrics:system` — do not edit by hand.',
    '',
    `- Commit: \`${commit}\``,
    `- Generated: ${generatedAt}`,
    '',
    'This table is derived from repository content at the commit above. It corresponds to',
    'Table 2 of the manuscript, excluding the idle deployment footprint rows, which are',
    'host measurements rather than repository facts.',
    '',
    '| Characteristic | Value | Counting rule |',
    '| --- | ---: | --- |',
  ];

  for (const { group, metrics } of groups) {
    lines.push(`| **${group}** | | |`);
    for (const metric of metrics) {
      lines.push(`| ${metric.characteristic} | ${metric.value} | ${metric.rule} |`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ─── Entry point ────────────────────────────────────────────────────────────

function main(): void {
  const { group: templateGroup } = collectTemplateMetrics();
  const groups: MetricGroup[] = [
    templateGroup,
    collectAncillaryMetrics(),
    collectDataModelMetrics(),
    collectDemonstrationDataMetrics(),
  ];

  const commit = readCommitHash();
  const generatedAt = new Date().toISOString();

  mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, 'system-characteristics.json');
  const markdownPath = path.join(outputDir, 'system-characteristics.md');

  writeFileSync(jsonPath, `${JSON.stringify({ commit, generatedAt, groups }, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdown(groups, commit, generatedAt), 'utf8');

  for (const { group, metrics } of groups) {
    console.log(`\n${group}`);
    for (const metric of metrics) {
      console.log(`  ${String(metric.value).padStart(6)}  ${metric.characteristic}`);
    }
  }

  console.log(`\nWrote ${path.relative(repoRoot, markdownPath)} and ${path.relative(repoRoot, jsonPath)}`);
}

main();
