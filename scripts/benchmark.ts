/**
 * Reproducible performance benchmark for the deployed stack.
 *
 *   pnpm bench
 *
 * Requires a running backend and a seeded database:
 *   BENCH_BASE_URL   backend origin           (default http://localhost:3001)
 *   BENCH_PASSWORD   seeded employee password (default Pathology1!)
 *   DATABASE_URL     used for the storage measurement and role lookups
 *   PROFILE_STAMP    output filename stamp    (default: the generated timestamp)
 *
 * Writes docs/verification/benchmark-<stamp>.{md,json}.
 *
 * This measures the five things a reviewer asked for — concurrent sessions,
 * case creation, query latency, PDF generation, and storage — under load, and is
 * deliberately distinct from the idle-footprint figures reported in the
 * manuscript's system-characteristics table. Those describe a stack at rest;
 * these describe it doing work.
 *
 * For container memory and CPU alongside these timings, run `pnpm
 * metrics:deployment`, which drives this script inside an isolated Docker stack
 * and samples the containers while it runs.
 *
 * Run it on a documented host and commit the JSON. Shared CI runners are too
 * noisy for timings that will be published.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'docs', 'verification');

const baseUrl = (process.env.BENCH_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const password = process.env.BENCH_PASSWORD ?? 'Pathology1!';

/** Discarded before timing so JIT warm-up and connection setup do not skew p50. */
const WARMUP_ITERATIONS = 5;
const SEQUENTIAL_ITERATIONS = 30;
const CONCURRENCY_LEVELS = [1, 5, 10, 25];

interface LatencySummary {
  samples: number;
  errors: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  meanMs: number;
  throughputPerSecond?: number;
}

interface Measurement {
  group: string;
  scenario: string;
  detail?: string;
  summary: LatencySummary | null;
  note?: string;
  /** Distinct failure reasons and their counts, so errors are diagnosable rather than opaque. */
  failures?: Record<string, number>;
}

const measurements: Measurement[] = [];

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function summarize(samplesMs: number[], errors: number, wallClockMs?: number): LatencySummary {
  const sorted = [...samplesMs].sort((left, right) => left - right);
  const at = (quantile: number): number =>
    sorted.length === 0 ? 0 : round(sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))]);

  return {
    samples: sorted.length,
    errors,
    minMs: sorted.length ? round(sorted[0]) : 0,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: sorted.length ? round(sorted[sorted.length - 1]) : 0,
    meanMs: sorted.length ? round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length) : 0,
    throughputPerSecond:
      wallClockMs && wallClockMs > 0 ? round((sorted.length / wallClockMs) * 1000) : undefined,
  };
}

// ─── HTTP session ───────────────────────────────────────────────────────────

/** Minimal cookie-jar session; the API authenticates with an express-session cookie. */
class Session {
  private cookie = '';

  async request(
    method: string,
    urlPath: string,
    body?: unknown
  ): Promise<{ status: number; response: Response; durationMs: number }> {
    const headers: Record<string, string> = {};
    if (this.cookie) headers.cookie = this.cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';

    const startedAt = performance.now();
    const response = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const durationMs = performance.now() - startedAt;

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];

    return { status: response.status, response, durationMs };
  }

  async login(employeeId: number): Promise<number> {
    const { status, durationMs } = await this.request('POST', '/api/auth/login', { employeeId, password });
    if (status !== 200) throw new Error(`Login failed for employee ${employeeId} (HTTP ${status})`);
    return durationMs;
  }
}

async function readJsonBody<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

// ─── Measurement helpers ────────────────────────────────────────────────────

async function measureSequential(
  group: string,
  scenario: string,
  operation: () => Promise<number>,
  detail?: string
): Promise<void> {
  for (let index = 0; index < WARMUP_ITERATIONS; index += 1) {
    try {
      await operation();
    } catch {
      // Warm-up failures are not recorded; a persistent fault surfaces below.
    }
  }

  const samples: number[] = [];
  const failures: Record<string, number> = {};
  let errors = 0;
  const startedAt = performance.now();

  for (let index = 0; index < SEQUENTIAL_ITERATIONS; index += 1) {
    try {
      samples.push(await operation());
    } catch (error) {
      errors += 1;
      const reason = error instanceof Error ? error.message : String(error);
      failures[reason] = (failures[reason] ?? 0) + 1;
    }
  }

  const wallClockMs = performance.now() - startedAt;

  measurements.push({
    group,
    scenario,
    detail,
    summary: samples.length > 0 ? summarize(samples, errors, wallClockMs) : null,
    failures: errors > 0 ? failures : undefined,
    note:
      samples.length === 0
        ? `All ${SEQUENTIAL_ITERATIONS} attempts failed: ${describeFailures(failures)}`
        : undefined,
  });
}

function describeFailures(failures: Record<string, number>): string {
  return Object.entries(failures)
    .sort((left, right) => right[1] - left[1])
    .map(([reason, count]) => `${reason} (×${count})`)
    .join('; ');
}

async function measureConcurrent(
  group: string,
  scenario: string,
  concurrency: number,
  operation: (index: number) => Promise<number>
): Promise<void> {
  const startedAt = performance.now();
  const settled = await Promise.allSettled(
    Array.from({ length: concurrency }, (_, index) => operation(index))
  );
  const wallClockMs = performance.now() - startedAt;

  const samples = settled
    .filter((result): result is PromiseFulfilledResult<number> => result.status === 'fulfilled')
    .map((result) => result.value);
  const errors = settled.length - samples.length;

  const failures: Record<string, number> = {};
  for (const result of settled) {
    if (result.status !== 'rejected') continue;
    const reason =
      result.reason instanceof Error ? result.reason.message : String(result.reason);
    failures[reason] = (failures[reason] ?? 0) + 1;
  }

  measurements.push({
    group,
    scenario,
    detail: `concurrency ${concurrency}`,
    summary: samples.length > 0 ? summarize(samples, errors, wallClockMs) : null,
    failures: errors > 0 ? failures : undefined,
    note:
      errors > 0
        ? `${errors} of ${concurrency} request(s) failed: ${describeFailures(failures)}`
        : undefined,
  });
}

// ─── Scenarios ──────────────────────────────────────────────────────────────

interface EmployeeRecord {
  employeeId: number | string;
  userName: string;
}

async function resolveEmployees(): Promise<EmployeeRecord[]> {
  const probe = new Session();
  const { status, response } = await probe.request('GET', '/api/employees/search?q=');
  if (status !== 200) throw new Error(`Could not list employees (HTTP ${status}). Is the backend seeded?`);

  const body = await readJsonBody<{ data?: EmployeeRecord[] }>(response);
  const employees = body.data ?? [];
  if (employees.length === 0) throw new Error('No employees returned; seed the database first.');
  return employees;
}

async function benchmarkConcurrentSessions(employees: EmployeeRecord[]): Promise<void> {
  for (const concurrency of CONCURRENCY_LEVELS) {
    await measureConcurrent('Concurrent sessions', 'Authenticated login', concurrency, async (index) => {
      const employee = employees[index % employees.length];
      return new Session().login(Number(employee.employeeId));
    });
  }
}

async function benchmarkQueries(session: Session, sampleOrderId: string, samplePatientId: string): Promise<void> {
  await measureSequential('Query latency', 'Query by accession number', async () => {
    const { status, durationMs, response } = await session.request(
      'GET',
      `/api/orders/query?orderId=${encodeURIComponent(sampleOrderId)}`
    );
    await response.arrayBuffer();
    if (status !== 200) throw new Error(`HTTP ${status}`);
    return durationMs;
  });

  await measureSequential('Query latency', 'Query by patient identifier', async () => {
    const { status, durationMs, response } = await session.request(
      'GET',
      `/api/orders/query?patientId=${encodeURIComponent(samplePatientId)}`
    );
    await response.arrayBuffer();
    if (status !== 200) throw new Error(`HTTP ${status}`);
    return durationMs;
  });

  for (const [scenario, urlPath] of [
    ['Processing queue, first page', '/api/orders/processing-queue?page=1&pageSize=20'],
    ['Result queue, first page', '/api/orders/result-queue?page=1&pageSize=20'],
    ['Histology queue, distributed', '/api/orders/histology-queue?page=1&pageSize=20&heStatus=DISTRIBUTED'],
  ] as const) {
    await measureSequential('Query latency', scenario, async () => {
      const { status, durationMs, response } = await session.request('GET', urlPath);
      await response.arrayBuffer();
      if (status !== 200) throw new Error(`HTTP ${status}`);
      return durationMs;
    });
  }
}

interface CreatedOrder {
  orderId: string;
}

function buildOrderPayload(bodySiteId: number, index: number): Record<string, unknown> {
  return {
    patientLastName: `Bench_${index}`,
    patientFirstName: 'Load',
    patientDateOfBirth: '1980-01-01',
    patientSex: 'Female',
    doctorLastName: 'BenchDoctor',
    doctorFirstName: 'Ada',
    caseType: index % 3 === 1 ? 'Cytology' : 'Surgical Pathology',
    registeredDate: new Date().toISOString(),
    specimens: [{ bodySiteId }],
  };
}

async function benchmarkCaseCreation(
  session: Session,
  bodySiteId: number,
  createdOrderIds: string[]
): Promise<void> {
  let counter = 0;

  await measureSequential(
    'Case creation',
    'Create case, sequential',
    async () => {
      counter += 1;
      const { status, durationMs, response } = await session.request(
        'POST',
        '/api/orders',
        buildOrderPayload(bodySiteId, counter)
      );
      const body = await readJsonBody<{ data?: CreatedOrder }>(response);
      if (status !== 201) throw new Error(`HTTP ${status}`);
      if (body.data?.orderId) createdOrderIds.push(body.data.orderId);
      return durationMs;
    },
    'One specimen per case; accession number allocated server-side'
  );

  for (const concurrency of CONCURRENCY_LEVELS) {
    await measureConcurrent('Case creation', 'Create case, concurrent', concurrency, async (index) => {
      const { status, durationMs, response } = await session.request(
        'POST',
        '/api/orders',
        buildOrderPayload(bodySiteId, 10_000 + concurrency * 100 + index)
      );
      const body = await readJsonBody<{ data?: CreatedOrder }>(response);
      if (status !== 201) throw new Error(`HTTP ${status}`);
      if (body.data?.orderId) createdOrderIds.push(body.data.orderId);
      return durationMs;
    });
  }
}

/**
 * Drives one case from accessioning to a signed-out final report and returns the
 * timings of each step.
 *
 * The seed does not generate report PDFs, so timing an existing report would
 * measure a 404. Sign-out is where a PDF is actually produced, so that is what
 * gets measured — which also yields an end-to-end case-lifecycle figure.
 */
async function runCaseLifecycle(
  session: Session,
  bodySiteId: number,
  index: number,
  pathologistEmployeeId: number,
  steps: Record<string, number>
): Promise<{ reportId: string | null }> {

  const orderResponse = await session.request('POST', '/api/orders', buildOrderPayload(bodySiteId, index));
  if (orderResponse.status !== 201) throw new Error(`Create case: HTTP ${orderResponse.status}`);
  steps.createCase = orderResponse.durationMs;

  const orderBody = await readJsonBody<{
    data?: { orderId: string; specimens: Array<{ specimenId: string }> };
  }>(orderResponse.response);
  const orderId = orderBody.data?.orderId;
  const specimenId = orderBody.data?.specimens?.[0]?.specimenId;
  if (!orderId || !specimenId) throw new Error('Create case: missing orderId or specimenId in response');

  const blockResponse = await session.request('POST', `/api/specimens/${specimenId}/blocks`, { count: 1 });
  if (blockResponse.status !== 201) throw new Error(`Create block: HTTP ${blockResponse.status}`);
  steps.createBlock = blockResponse.durationMs;

  const blockBody = await readJsonBody<{ data?: Array<{ blockId: string }> }>(blockResponse.response);
  const blockId = blockBody.data?.[0]?.blockId;
  if (!blockId) throw new Error('Create block: missing blockId in response');

  const slideResponse = await session.request('POST', `/api/blocks/${blockId}/slides`, { count: 1 });
  if (slideResponse.status !== 201) throw new Error(`Create slide: HTTP ${slideResponse.status}`);
  steps.createSlide = slideResponse.durationMs;
  await slideResponse.response.arrayBuffer();

  const distributeResponse = await session.request('PATCH', `/api/blocks/${blockId}/he-status`, {
    status: 'DISTRIBUTED',
  });
  if (distributeResponse.status !== 200) throw new Error(`Distribute block: HTTP ${distributeResponse.status}`);
  steps.distributeBlock = distributeResponse.durationMs;
  await distributeResponse.response.arrayBuffer();

  const draftResponse = await session.request('POST', `/api/orders/${orderId}/reports/draft`, {
    diagnosis: 'Benchmark synthetic diagnosis.',
    comment: 'Generated by scripts/benchmark.ts.',
    gross: 'Benchmark synthetic gross description.',
  });
  if (draftResponse.status !== 201 && draftResponse.status !== 200) {
    throw new Error(`Create draft: HTTP ${draftResponse.status}`);
  }
  steps.createDraft = draftResponse.durationMs;

  const draftBody = await readJsonBody<{ data?: { reportId: number | string } }>(draftResponse.response);
  const reportId = draftBody.data?.reportId != null ? String(draftBody.data.reportId) : null;
  if (!reportId) throw new Error('Create draft: missing reportId in response');

  const signOutResponse = await session.request('POST', `/api/reports/${reportId}/signout`, {
    diagnosis: 'Benchmark synthetic diagnosis.',
    comment: 'Generated by scripts/benchmark.ts.',
    gross: 'Benchmark synthetic gross description.',
    pathologistEmployeeId,
  });
  const signOutBody = await signOutResponse.response.text();
  if (signOutResponse.status !== 200) {
    throw new Error(`Sign out: HTTP ${signOutResponse.status} ${signOutBody.slice(0, 160)}`);
  }
  steps.signOut = signOutResponse.durationMs;

  steps.total = Object.values(steps).reduce((sum, value) => sum + value, 0);
  return { reportId };
}

async function benchmarkLifecycleAndPdf(
  session: Session,
  adminSession: Session | null,
  bodySiteId: number,
  pathologistEmployeeId: number,
  createdOrderIds: string[]
): Promise<void> {
  const stepSamples: Record<string, number[]> = {};
  const failures: Record<string, number> = {};
  let signedOutReportId: string | null = null;
  let errors = 0;
  const iterations = 15;

  const startedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    // Steps completed before a failure are still valid samples, so the object is
    // passed in and read back even when the lifecycle throws part-way through.
    const steps: Record<string, number> = {};
    try {
      const { reportId } = await runCaseLifecycle(
        session,
        bodySiteId,
        20_000 + index,
        pathologistEmployeeId,
        steps
      );
      if (reportId) signedOutReportId = reportId;
    } catch (error) {
      errors += 1;
      const reason = error instanceof Error ? error.message : String(error);
      failures[reason] = (failures[reason] ?? 0) + 1;
    } finally {
      for (const [step, durationMs] of Object.entries(steps)) {
        (stepSamples[step] ??= []).push(durationMs);
      }
    }
  }
  const wallClockMs = performance.now() - startedAt;

  const stepLabels: Record<string, string> = {
    createCase: 'Create case (accessioning)',
    createBlock: 'Create block',
    createSlide: 'Create slide',
    distributeBlock: 'Distribute block (H&E)',
    createDraft: 'Create draft report',
    signOut: 'Sign out (generates report PDF)',
    total: 'Full case lifecycle, accessioning to sign-out',
  };

  for (const [step, label] of Object.entries(stepLabels)) {
    const samples = stepSamples[step];
    measurements.push({
      group: 'Case lifecycle',
      scenario: label,
      detail: `${iterations} cases`,
      summary: samples?.length ? summarize(samples, 0, step === 'total' ? wallClockMs : undefined) : null,
      failures: step === 'total' && errors > 0 ? failures : undefined,
      note:
        !samples?.length && errors > 0 ? `All attempts failed: ${describeFailures(failures)}` : undefined,
    });
  }

  createdOrderIds.push(...Array.from({ length: iterations - errors }, (_, index) => `lifecycle-${index}`));

  if (signedOutReportId) {
    await measureSequential(
      'PDF generation',
      'Download generated report PDF',
      async () => {
        const { status, durationMs, response } = await session.request(
          'GET',
          `/api/reports/${signedOutReportId}/pdf`
        );
        const bytes = await response.arrayBuffer();
        if (status !== 200) throw new Error(`HTTP ${status}`);
        if (bytes.byteLength === 0) throw new Error('Empty PDF body');
        return durationMs;
      },
      'GET /api/reports/:reportId/pdf for a report signed out during this run'
    );
  }

  // The Handlebars + headless-Chromium path is the production report renderer.
  // It needs a Chromium binary, so it is measured separately and reported as
  // unavailable rather than silently folded into the pdf-lib numbers.
  //
  // It is also the one scenario that needs a different identity. The preview route
  // became Administrator-only in 782b5ff (requireAdmin, config.reportLayout.routes.ts),
  // so driving it with the pathologist session records 30 × HTTP 403 and quietly
  // drops the production renderer — the dominant cost of sign-out — out of the
  // table. That is a silent regression, so the absence of an admin is reported.
  if (!adminSession) {
    measurements.push({
      group: 'PDF generation',
      scenario: 'Report layout render (Handlebars + headless Chromium)',
      detail: 'Administrator session unavailable',
      summary: null,
      note:
        'Not measured: the preview route requires the Administrator role and no ' +
        'usable Administrator employee was available. Seed the database (prisma/seed.ts ' +
        'creates one) and re-run.',
    });
    return;
  }

  await measureSequential(
    'PDF generation',
    'Report layout render (Handlebars + headless Chromium)',
    async () => {
      const { status, durationMs, response } = await adminSession.request(
        'POST',
        '/api/config/report-layouts/final/preview',
        {}
      );
      const bytes = await response.arrayBuffer();
      if (status !== 200) throw new Error(`HTTP ${status}`);
      if (bytes.byteLength === 0) throw new Error('Empty PDF body');
      return durationMs;
    },
    'Administrator session; requires PUPPETEER_EXECUTABLE_PATH to point at a Chromium binary'
  );
}

// ─── Storage ────────────────────────────────────────────────────────────────

/**
 * Tables whose row count grows with case volume. Everything else in the schema is
 * reference or configuration data whose size is independent of how many cases a
 * laboratory has accessioned, so folding it into a per-case figure would
 * misattribute fixed overhead to marginal cost.
 *
 * These are the `@@map` names from prisma/schema.prisma. The list is written out
 * rather than derived because "does this grow per case" is a domain judgement the
 * schema does not encode. Keep it in step with the schema.
 */
const CASE_SCALING_TABLES = [
  'orders',
  'specimen',
  'block',
  'slide',
  'report',
  'report_file',
  'ancillary_order',
  'patient',
] as const;

interface TableSize {
  table: string;
  totalBytes: number;
  caseScaling: boolean;
}

interface StorageProfile {
  cases: number;
  databaseBytes: number;
  caseScalingBytes: number;
  referenceBytes: number;
  bytesPerCase: number;
  tables: TableSize[];
  quiesced: boolean;
  quiesceNote?: string;
}

/**
 * Measures how much disk the corpus occupies, per table.
 *
 * This replaces a before/after `pg_database_size` delta, which could not work:
 * whole-database size includes catalogue churn, the free-space map, and space
 * autovacuum has reclaimed, so the 91 cases the benchmark inserts sat inside the
 * noise floor. The committed run at `d83f39b` reported growth of **-56.0 KB** —
 * the database shrank while cases were being added — while an earlier run of the
 * same code reported *+2 KB per case*. A metric that cannot reproduce its own
 * sign is not a measurement.
 *
 * Measuring the absolute size of a known, deterministic corpus is monotonic and
 * needs no delta. It must therefore run *before* the benchmark inserts cases of
 * its own.
 */
async function readStorageProfile(prisma: PrismaClient): Promise<StorageProfile> {
  // CHECKPOINT flushes dirty buffers so the on-disk numbers are settled rather
  // than dependent on bgwriter timing; VACUUM (ANALYZE) makes the figure
  // repeatable on a database that has already been written to. Both are
  // permitted because the compose stacks connect as the bootstrap superuser.
  // Neither is required for correctness on a freshly seeded corpus, so a failure
  // is recorded and reported rather than aborting the run.
  let quiesced = true;
  let quiesceNote: string | undefined;
  try {
    await prisma.$executeRawUnsafe('VACUUM (ANALYZE)');
    await prisma.$executeRawUnsafe('CHECKPOINT');
  } catch (error) {
    quiesced = false;
    quiesceNote = error instanceof Error ? error.message : String(error);
  }

  // pg_total_relation_size covers the heap, its indexes and any TOAST overflow,
  // which is what a deployment actually has to store.
  const rows = await prisma.$queryRaw<Array<{ table_name: string; total_bytes: bigint }>>`
    SELECT c.relname AS table_name,
           pg_total_relation_size(c.oid) AS total_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
     ORDER BY pg_total_relation_size(c.oid) DESC
  `;

  const scaling: Set<string> = new Set(CASE_SCALING_TABLES);
  const tables: TableSize[] = rows.map((row) => ({
    table: row.table_name,
    totalBytes: Number(row.total_bytes),
    caseScaling: scaling.has(row.table_name),
  }));

  const databaseRows = await prisma.$queryRaw<Array<{ size: bigint }>>`
    SELECT pg_database_size(current_database()) AS size
  `;

  const sumBytes = (predicate: (table: TableSize) => boolean): number =>
    tables.filter(predicate).reduce((sum, table) => sum + table.totalBytes, 0);

  const caseScalingBytes = sumBytes((table) => table.caseScaling);
  const cases = await prisma.order.count();

  return {
    cases,
    databaseBytes: Number(databaseRows[0]?.size ?? 0),
    caseScalingBytes,
    referenceBytes: sumBytes((table) => !table.caseScaling),
    bytesPerCase: cases > 0 ? caseScalingBytes / cases : 0,
    tables,
    quiesced,
    quiesceNote,
  };
}

// ─── Host description ───────────────────────────────────────────────────────

async function describeHost(prisma: PrismaClient): Promise<Record<string, string>> {
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    // Reported as unknown rather than omitted.
  }

  let postgresVersion = 'unknown';
  try {
    const rows = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`;
    postgresVersion = rows[0]?.version.split(',')[0] ?? 'unknown';
  } catch {
    // Left as unknown; the benchmark still reports HTTP-level timings.
  }

  const cpus = os.cpus();

  return {
    commit,
    node: process.version,
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    cpu: cpus[0]?.model ?? 'unknown',
    logicalCores: String(cpus.length),
    totalMemoryGiB: (os.totalmem() / 1024 ** 3).toFixed(2),
    postgres: postgresVersion,
    baseUrl,
  };
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function renderMarkdown(
  host: Record<string, string>,
  storage: StorageProfile,
  generatedAt: string
): string {
  const lines = [
    '# Performance benchmark',
    '',
    'Generated by `pnpm bench` — do not edit by hand.',
    '',
    'These are **loaded** measurements. They are separate from, and should not be',
    'confused with, the idle deployment footprint reported in the system-characteristics',
    'table, which describes the stack at rest with no workload.',
    '',
    '## Host and build',
    '',
    '| Property | Value |',
    '| --- | --- |',
    ...Object.entries(host).map(([key, value]) => `| ${key} | ${value} |`),
    `| generated | ${generatedAt} |`,
    '',
    '## Latency and throughput',
    '',
    'Latencies are wall-clock, measured client-side over HTTP, after',
    `${WARMUP_ITERATIONS} discarded warm-up iterations. Sequential scenarios run`,
    `${SEQUENTIAL_ITERATIONS} iterations.`,
    '',
    '| Group | Scenario | Detail | n | Errors | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | Throughput (/s) |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const measurement of measurements) {
    if (!measurement.summary) {
      lines.push(
        `| ${measurement.group} | ${measurement.scenario} | ${measurement.detail ?? '—'} | — | — | — | — | — | — | not measured |`
      );
      continue;
    }
    const summary = measurement.summary;
    lines.push(
      `| ${measurement.group} | ${measurement.scenario} | ${measurement.detail ?? '—'} | ${summary.samples} | ${summary.errors} | ${summary.p50Ms} | ${summary.p95Ms} | ${summary.p99Ms} | ${summary.maxMs} | ${summary.throughputPerSecond ?? '—'} |`
    );
  }

  const notes = measurements.filter((measurement) => measurement.note ?? measurement.failures);
  if (notes.length > 0) {
    lines.push(
      '',
      '### Errors and unavailable measurements',
      '',
      'Failures are reported rather than discarded. An error column of zero across a row',
      'is part of the result; a non-zero one is a finding.',
      ''
    );
    for (const measurement of notes) {
      const detail = measurement.note ?? describeFailures(measurement.failures ?? {});
      lines.push(`- **${measurement.group} / ${measurement.scenario}** (${measurement.detail ?? '—'}): ${detail}`);
    }
  }

  const mib = (bytes: number): string => (bytes / 1024 ** 2).toFixed(2);

  lines.push(
    '',
    '## Storage',
    '',
    'Measured on the seeded corpus **before** this run inserted any cases of its own.',
    '',
    '| Measure | Value |',
    '| --- | ---: |',
    `| Cases in the corpus | ${storage.cases} |`,
    `| Case-scaling tables, total | ${mib(storage.caseScalingBytes)} MB |`,
    `| Reference and configuration tables, total | ${mib(storage.referenceBytes)} MB |`,
    '| Whole database (`pg_database_size`) | ' + `${mib(storage.databaseBytes)} MB |`,
    `| **Storage per case** | **${(storage.bytesPerCase / 1024).toFixed(1)} KB** |`,
    '',
    '### By table',
    '',
    '| Table | Total size | Scales per case |',
    '| --- | ---: | :---: |',
    ...storage.tables
      .filter((table) => table.totalBytes > 0)
      .map(
        (table) =>
          `| \`${table.table}\` | ${mib(table.totalBytes)} MB | ${table.caseScaling ? 'yes' : 'no'} |`
      ),
    '',
    'Sizes are `pg_total_relation_size`, which covers the heap, its indexes and any',
    'TOAST overflow — what a deployment actually has to store. Storage per case divides',
    'only the case-scaling tables by the case count; reference and configuration data is',
    'fixed overhead and would otherwise be misattributed to marginal cost.',
    '',
    'Read it as an average at corpus scale over the documented stage mix — half the',
    'cases signed out, a fifth still awaiting blocks — and not as the marginal cost of',
    'one further case. Two specifics understate it against a real deployment: the corpus',
    'reuses 50 patients across all cases, so the `patient` contribution per case is lower',
    'than where every case is a distinct patient; and no case carries an addendum or a',
    'preliminary report.',
    '',
    'For the replicated production topology, double these figures: the hot standby is a',
    'physical replica, so its on-disk size tracks the primary.',
    storage.quiesced
      ? '\nThe database was quiesced with `VACUUM (ANALYZE)` and `CHECKPOINT` before measurement, so the figures do not depend on background-writer timing.'
      : `\nThe database could **not** be quiesced before measurement (\`${storage.quiesceNote ?? 'unknown error'}\`), so these figures may include unreclaimed dead tuples and unflushed buffers.`,
    ''
  );

  return lines.join('\n');
}

// ─── Entry point ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const health = await fetch(`${baseUrl}/health`).catch(() => null);
    if (!health?.ok) {
      throw new Error(
        `Backend not reachable at ${baseUrl}/health. Start it first (see README), then re-run.`
      );
    }

    const host = await describeHost(prisma);
    const employees = await resolveEmployees();

    // Sign-out requires both the Pathologist role and self-attribution
    // (report.routes.ts), so the signing identity is selected by role. It used to
    // be `employees[0]` from /api/employees/search, which returns 20 rows with no
    // ORDER BY — the lifecycle group worked only because the seed happens to list
    // pathologists first.
    const pathologist = await prisma.employee.findFirst({
      where: { employeeRole: { roleName: 'Pathologist' } },
      select: { employeeId: true, userName: true },
      orderBy: { employeeId: 'asc' },
    });
    if (!pathologist) {
      throw new Error('No employee holds the Pathologist role; seed the database first.');
    }
    const pathologistEmployeeId = Number(pathologist.employeeId);
    const session = new Session();
    await session.login(pathologistEmployeeId);
    host.pathologist = pathologist.userName;

    // The report-layout preview route is Administrator-only, so it needs its own
    // session. A missing or unusable admin is reported against that one scenario
    // rather than failing the run.
    const administrator = await prisma.employee.findFirst({
      where: { employeeRole: { roleName: 'Administrator' } },
      select: { employeeId: true, userName: true },
      orderBy: { employeeId: 'asc' },
    });
    let adminSession: Session | null = null;
    if (administrator) {
      try {
        const candidate = new Session();
        await candidate.login(Number(administrator.employeeId));
        adminSession = candidate;
        host.administrator = administrator.userName;
      } catch (error) {
        host.administrator = `login failed (${error instanceof Error ? error.message : String(error)})`;
      }
    } else {
      host.administrator = 'none seeded';
    }

    const sampleOrder = await prisma.order.findFirst({ select: { orderId: true, patientId: true } });
    if (!sampleOrder) throw new Error('No orders in the database; seed first.');

    const bodySite = await prisma.bodySite.findFirst({ select: { bodySiteId: true } });
    if (!bodySite) throw new Error('No body sites in the database; run migrations first.');

    // Before any scenario runs: the benchmark inserts 91 cases of its own, and
    // counting those would describe a corpus nobody published.
    const storage = await readStorageProfile(prisma);
    const createdOrderIds: string[] = [];

    await benchmarkConcurrentSessions(employees);
    await benchmarkQueries(session, sampleOrder.orderId, sampleOrder.patientId);
    await benchmarkCaseCreation(session, bodySite.bodySiteId, createdOrderIds);
    await benchmarkLifecycleAndPdf(
      session,
      adminSession,
      bodySite.bodySiteId,
      pathologistEmployeeId,
      createdOrderIds
    );

    const generatedAt = new Date().toISOString();
    // PROFILE_STAMP lets `pnpm metrics:deployment` pair this file with the
    // deployment profile from the same run instead of two adjacent timestamps.
    const stamp = process.env.PROFILE_STAMP ?? generatedAt.replace(/[:.]/g, '-');

    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      path.join(outputDir, `benchmark-${stamp}.json`),
      `${JSON.stringify({ host, generatedAt, measurements, storage }, null, 2)}\n`,
      'utf8'
    );
    writeFileSync(
      path.join(outputDir, `benchmark-${stamp}.md`),
      renderMarkdown(host, storage, generatedAt),
      'utf8'
    );

    for (const measurement of measurements) {
      console.log(
        measurement.summary
          ? `${measurement.group} / ${measurement.scenario} (${measurement.detail ?? '—'}): p50 ${measurement.summary.p50Ms}ms, p95 ${measurement.summary.p95Ms}ms, ${measurement.summary.errors} error(s)`
          : `${measurement.group} / ${measurement.scenario}: not measured — ${measurement.note ?? ''}`
      );
    }

    console.log(
      `\nStorage: ${storage.cases} cases, ${(storage.bytesPerCase / 1024).toFixed(1)} KB per case ` +
        `(${(storage.caseScalingBytes / 1024 ** 2).toFixed(2)} MB case-scaling, ` +
        `${(storage.referenceBytes / 1024 ** 2).toFixed(2)} MB reference)`
    );
    console.log(
      `\nBenchmark created ${createdOrderIds.length} cases. Wrote docs/verification/benchmark-${stamp}.md`
    );
    console.log(
      'These cases remain in the database; re-seed with `pnpm db:reset && pnpm db:seed` to restore the published corpus.'
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
