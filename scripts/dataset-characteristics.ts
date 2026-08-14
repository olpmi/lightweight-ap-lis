/**
 * Characterizes the synthetic demonstration corpus in a seeded database.
 *
 *   DATABASE_URL=postgresql://... pnpm db:characterize
 *
 * Writes docs/verification/dataset-characteristics.{md,json}.
 *
 * Every figure is measured from the database rather than read back from the
 * seed script's constants. The case-type split in particular is a function of
 * the seeded PRNG (`pick(['Surgical Pathology','Cytology','Surgical Pathology'])`
 * in prisma/seed.ts), so the realized ratio is not exactly the nominal 2:1 and
 * must be counted, not assumed.
 *
 * Queue-membership counts reuse the same predicates as
 * apps/backend/src/services/queue.service.ts, so the table demonstrates that
 * every workflow stage is populated rather than asserting it.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'docs', 'verification');
const seedPath = path.join(repoRoot, 'prisma', 'seed.ts');

const prisma = new PrismaClient();

interface Row {
  label: string;
  count: number;
  percentOfCases?: number;
}

interface Section {
  title: string;
  note?: string;
  rows: Row[];
}

/** Matches `reports: { none: { isFinal: true, signedOutDatetime: { not: null } } }` in queue.service.ts. */
const NOT_SIGNED_OUT = {
  reports: { none: { isFinal: true, signedOutDatetime: { not: null } } },
} as const;

/**
 * Mirrors the `awaitingSignOut` predicate in QueueService.getResultQueue: never
 * signed out, or amended since sign-out with the amendment still unsigned.
 *
 * These predicates are duplicated rather than imported because this script runs
 * standalone against a database without booting the backend. Keep the two in
 * step — if the queue semantics change, this table stops describing the system.
 */
const AWAITING_SIGN_OUT = {
  OR: [
    NOT_SIGNED_OUT,
    { AND: [{ isReactivated: true }, { reports: { some: { isFinal: false, isPrelim: false } } }] },
  ],
} as const;

function percent(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 1000) / 10;
}

async function collectCaseMix(totalCases: number): Promise<Section> {
  const byCaseType = await prisma.order.groupBy({
    by: ['caseType'],
    _count: { _all: true },
    orderBy: { _count: { orderId: 'desc' } },
  });

  const rows: Row[] = byCaseType.map((entry) => ({
    label: entry.caseType ?? '(not recorded)',
    count: entry._count._all,
    percentOfCases: percent(entry._count._all, totalCases),
  }));

  // Accession prefixes are assigned from case type in apps/backend/src/utils/idGenerator.ts
  // (Cytology -> CN, everything else -> SU); counting them independently checks that
  // identifier assignment and the recorded case type agree across the whole corpus.
  const surgicalPrefix = await prisma.order.count({ where: { orderId: { startsWith: 'SU' } } });
  const cytologyPrefix = await prisma.order.count({ where: { orderId: { startsWith: 'CN' } } });

  rows.push(
    { label: 'Accession prefix SU (surgical pathology)', count: surgicalPrefix, percentOfCases: percent(surgicalPrefix, totalCases) },
    { label: 'Accession prefix CN (cytology)', count: cytologyPrefix, percentOfCases: percent(cytologyPrefix, totalCases) }
  );

  return {
    title: 'Case mix',
    note: 'Case type is drawn per case from a seeded pseudo-random generator, so the realized split is close to but not exactly the nominal 2:1 surgical:cytology ratio.',
    rows,
  };
}

async function collectWorkflowStages(totalCases: number): Promise<Section> {
  const [specimensOnly, blocksNoSlides, slidesNotSignedOut, signedOut, amended] = await Promise.all([
    prisma.order.count({ where: { specimens: { none: { blocks: { some: {} } } } } }),
    prisma.order.count({
      where: {
        specimens: { some: { blocks: { some: {} } } },
        NOT: { specimens: { some: { blocks: { some: { slides: { some: {} } } } } } },
      },
    }),
    prisma.order.count({
      where: {
        specimens: { some: { blocks: { some: { slides: { some: {} } } } } },
        ...NOT_SIGNED_OUT,
      },
    }),
    prisma.order.count({
      where: { reports: { some: { isFinal: true, signedOutDatetime: { not: null } } }, isReactivated: false },
    }),
    prisma.order.count({ where: { isReactivated: true } }),
  ]);

  const rows: Row[] = [
    { label: 'Accessioned, specimens only (no blocks)', count: specimensOnly },
    { label: 'Blocks created, no slides', count: blocksNoSlides },
    { label: 'Blocks and slides, awaiting sign-out', count: slidesNotSignedOut },
    { label: 'Signed out', count: signedOut },
    { label: 'Amended after sign-out (reactivated)', count: amended },
  ].map((row) => ({ ...row, percentOfCases: percent(row.count, totalCases) }));

  return {
    title: 'Workflow stage distribution',
    note: 'Derived from material and report state in the database, not read back from the seed script\'s stage plan, so this table checks the seed rather than restating it. Amended cases are counted separately and are also signed out.',
    rows,
  };
}

async function collectQueuePopulation(): Promise<Section> {
  const [processing, resultQueue, microtomy, slideStain, distributed] = await Promise.all([
    // getProcessingQueue default view: not signed out AND no report with a saved gross.
    prisma.order.count({
      where: {
        ...NOT_SIGNED_OUT,
        NOT: { reports: { some: { AND: [{ gross: { not: null } }, { gross: { not: '' } }] } } },
      },
    }),
    // getResultQueue: has a DISTRIBUTED block or DISTRIBUTED ancillary order,
    // and is awaiting sign-out (never signed out, or amended and unsigned).
    prisma.order.count({
      where: {
        AND: [
          {
            OR: [
              { specimens: { some: { blocks: { some: { heStatus: 'DISTRIBUTED', discarded: false } } } } },
              { ancillaryOrders: { some: { status: 'DISTRIBUTED' } } },
            ],
          },
          AWAITING_SIGN_OUT,
        ],
      },
    }),
    // getHistologyQueue, one count per block heStatus tab.
    prisma.order.count({
      where: { specimens: { some: { blocks: { some: { heStatus: 'MICROTOMY', discarded: false } } } }, ...NOT_SIGNED_OUT },
    }),
    prisma.order.count({
      where: { specimens: { some: { blocks: { some: { heStatus: 'SLIDE_STAIN', discarded: false } } } }, ...NOT_SIGNED_OUT },
    }),
    prisma.order.count({
      where: { specimens: { some: { blocks: { some: { heStatus: 'DISTRIBUTED', discarded: false } } } } },
    }),
  ]);

  return {
    title: 'Workflow queue population',
    note: 'Counted with the same Prisma predicates used by QueueService (apps/backend/src/services/queue.service.ts). A non-zero count in every row is what establishes that each workflow stage is populated by the corpus. The seed advances blocks from MICROTOMY directly to DISTRIBUTED, so the intermediate slide-staining tab is expected to be empty; that transition is covered by automated tests rather than by seeded data.',
    rows: [
      { label: 'Processing queue (accessioning, default view)', count: processing },
      { label: 'Histology queue — microtomy', count: microtomy },
      { label: 'Histology queue — slide staining', count: slideStain },
      { label: 'Histology queue — distributed', count: distributed },
      { label: 'Result queue (awaiting sign-out)', count: resultQueue },
    ],
  };
}

async function collectMaterialCounts(): Promise<Section> {
  const [patients, specimens, blocks, blocksDiscarded, slides, slidesDiscarded] = await Promise.all([
    prisma.patient.count(),
    prisma.specimen.count(),
    prisma.block.count(),
    prisma.block.count({ where: { discarded: true } }),
    prisma.slide.count(),
    prisma.slide.count({ where: { discarded: true } }),
  ]);

  return {
    title: 'Material hierarchy',
    rows: [
      { label: 'Patients', count: patients },
      { label: 'Specimens', count: specimens },
      { label: 'Blocks', count: blocks },
      { label: 'Blocks discarded', count: blocksDiscarded },
      { label: 'Slides', count: slides },
      { label: 'Slides discarded', count: slidesDiscarded },
    ],
  };
}

async function collectReportCounts(): Promise<Section> {
  const [total, finalReports, prelim, drafts, revisions, addenda] = await Promise.all([
    prisma.report.count(),
    prisma.report.count({ where: { isFinal: true, signedOutDatetime: { not: null } } }),
    prisma.report.count({ where: { isPrelim: true } }),
    prisma.report.count({ where: { isFinal: false, isPrelim: false } }),
    prisma.report.count({ where: { reactivationType: 'revise' } }),
    prisma.report.count({ where: { reactivationType: 'addend' } }),
  ]);

  const byVersion = await prisma.report.groupBy({
    by: ['versionNumber'],
    _count: { _all: true },
    orderBy: { versionNumber: 'asc' },
  });

  return {
    title: 'Reports',
    rows: [
      { label: 'Reports (all versions)', count: total },
      { label: 'Final, signed out', count: finalReports },
      { label: 'Preliminary', count: prelim },
      { label: 'Draft (unsigned)', count: drafts },
      { label: 'Revisions', count: revisions },
      { label: 'Addenda', count: addenda },
      ...byVersion.map((entry) => ({
        label: `Reports at version ${entry.versionNumber}`,
        count: entry._count._all,
      })),
    ],
  };
}

async function collectAncillaryCounts(): Promise<Section> {
  // Category lives on the orderable, not on the placed order, so it is grouped
  // by joining through orderableId rather than with a single groupBy.
  const [byOrderable, byStatus, orderables] = await Promise.all([
    prisma.ancillaryOrder.groupBy({ by: ['orderableId'], _count: { _all: true } }),
    prisma.ancillaryOrder.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
    prisma.ancillaryOrderable.findMany({ select: { id: true, category: true } }),
  ]);

  const categoryById = new Map(orderables.map((orderable) => [orderable.id, orderable.category]));
  const byCategory = new Map<string, number>();

  for (const entry of byOrderable) {
    const category = categoryById.get(entry.orderableId) ?? '(unknown)';
    byCategory.set(category, (byCategory.get(category) ?? 0) + entry._count._all);
  }

  return {
    title: 'Ancillary orders',
    note: 'Categories and statuses are the AncillaryCategory and AncillaryOrderStatus enums; transitions between statuses are governed by packages/shared/src/utils/ancillaryStateMachine.ts.',
    rows: [
      ...[...byCategory.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([category, count]) => ({ label: `Category ${category}`, count })),
      ...byStatus.map((entry) => ({ label: `Status ${entry.status}`, count: entry._count._all })),
    ],
  };
}

async function collectCytologySites(): Promise<Section> {
  const cytologySpecimens = await prisma.specimen.findMany({
    where: { order: { caseType: 'Cytology' } },
    select: { bodySite: { select: { bodySiteName: true } } },
  });

  const counts = new Map<string, number>();
  for (const specimen of cytologySpecimens) {
    const site = specimen.bodySite?.bodySiteName ?? '(not recorded)';
    counts.set(site, (counts.get(site) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
  );

  // The full distribution is a long tail across the whole 88-entry body-site
  // lookup; only the head is useful in a manuscript table.
  const TOP_N = 10;
  const rows: Row[] = ranked.slice(0, TOP_N).map(([label, count]) => ({ label, count }));

  const tail = ranked.slice(TOP_N);
  if (tail.length > 0) {
    rows.push({
      label: `Other sites (${tail.length} distinct)`,
      count: tail.reduce((sum, [, count]) => sum + count, 0),
    });
  }

  return {
    title: 'Cytology specimen sites',
    note: `Body sites recorded on specimens belonging to cytology cases; ${ranked.length} distinct sites in total, top ${TOP_N} shown. Note that the seed draws body sites from the full anatomic lookup independently of case type, so some cytology cases carry sites that would be implausible for a cytology specimen in practice. This is a property of the synthetic corpus, not of the application's data model.`,
    rows,
  };
}

function readProvenance(): { commit: string; rngSeed: string; declaredOrderCount: string } {
  const seed = readFileSync(seedPath, 'utf8');

  let commit = 'unknown (not a git checkout)';
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    // Leave the placeholder; provenance is reported as unknown rather than omitted.
  }

  return {
    commit,
    rngSeed: seed.match(/makeRng\((\d+)\)/)?.[1] ?? 'unknown',
    declaredOrderCount: seed.match(/const\s+ORDER_COUNT\s*=\s*(\d+)/)?.[1] ?? 'unknown',
  };
}

function renderMarkdown(
  sections: Section[],
  totalCases: number,
  provenance: ReturnType<typeof readProvenance>,
  generatedAt: string
): string {
  const lines = [
    '# Synthetic demonstration dataset characteristics',
    '',
    'Generated by `pnpm db:characterize` against a freshly seeded database — do not edit by hand.',
    '',
    `- Commit: \`${provenance.commit}\``,
    `- Generated: ${generatedAt}`,
    `- Pseudo-random generator seed: \`${provenance.rngSeed}\``,
    `- Cases declared by \`ORDER_COUNT\` in prisma/seed.ts: ${provenance.declaredOrderCount}`,
    `- Cases measured in the database: **${totalCases}**`,
    '',
    'Reproduce with:',
    '',
    '```bash',
    'pnpm db:reset && pnpm db:seed && pnpm db:characterize',
    '```',
    '',
    'The seed uses a fixed-seed linear congruential generator rather than `Math.random`,',
    'so the corpus is byte-reproducible across runs on any host.',
    '',
  ];

  for (const section of sections) {
    lines.push(`## ${section.title}`, '');
    if (section.note) lines.push(section.note, '');

    const showPercent = section.rows.some((row) => row.percentOfCases !== undefined);
    lines.push(
      showPercent ? '| Measure | n | % of cases |' : '| Measure | n |',
      showPercent ? '| --- | ---: | ---: |' : '| --- | ---: |'
    );

    for (const row of section.rows) {
      lines.push(
        showPercent
          ? `| ${row.label} | ${row.count} | ${row.percentOfCases === undefined ? '—' : `${row.percentOfCases}%`} |`
          : `| ${row.label} | ${row.count} |`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const totalCases = await prisma.order.count();

  if (totalCases === 0) {
    throw new Error(
      'No orders found. Seed the database first: `pnpm db:seed` (see README for the DATABASE_URL to use).'
    );
  }

  const sections: Section[] = [
    await collectCaseMix(totalCases),
    await collectWorkflowStages(totalCases),
    await collectQueuePopulation(),
    await collectMaterialCounts(),
    await collectReportCounts(),
    await collectAncillaryCounts(),
    await collectCytologySites(),
  ];

  const provenance = readProvenance();
  const generatedAt = new Date().toISOString();

  mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, 'dataset-characteristics.json');
  const markdownPath = path.join(outputDir, 'dataset-characteristics.md');

  writeFileSync(
    jsonPath,
    `${JSON.stringify({ ...provenance, totalCases, sections }, null, 2)}\n`,
    'utf8'
  );
  writeFileSync(markdownPath, renderMarkdown(sections, totalCases, provenance, generatedAt), 'utf8');

  for (const section of sections) {
    console.log(`\n${section.title}`);
    for (const row of section.rows) {
      console.log(`  ${String(row.count).padStart(6)}  ${row.label}`);
    }
  }

  console.log(`\nWrote ${path.relative(repoRoot, markdownPath)} and ${path.relative(repoRoot, jsonPath)}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
