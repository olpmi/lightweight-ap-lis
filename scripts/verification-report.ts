/**
 * Runs the automated test suites and aggregates their machine-readable output
 * into a single verification table.
 *
 *   pnpm verify:report              # Vitest suites only (no running stack needed)
 *   pnpm verify:report --e2e        # additionally run Playwright against a running stack
 *
 * Writes docs/verification/verification-report.{md,json}.
 *
 * The skipped column is deliberately prominent. Backend integration suites are
 * wrapped in `describe.skipIf(!hasDb)`, so a run without DATABASE_URL and
 * SESSION_SECRET silently exercises far less than a CI run does. A verification
 * table that reported only passes would hide that; this one surfaces it.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'docs', 'verification');
const runE2E = process.argv.includes('--e2e');

interface SuiteResult {
  suite: string;
  runner: string;
  scope: string;
  files: number;
  cases: number;
  passed: number;
  failed: number;
  skipped: number;
  /** Files whose setup hook threw, so their tests never ran. See parseVitestReport. */
  erroredFiles: number;
  durationSeconds: number;
  executed: boolean;
  note?: string;
}

interface CoverageResult {
  suite: string;
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

/** Jest-compatible shape emitted by Vitest's `json` reporter. */
interface VitestAssertionResult {
  status?: string;
  title?: string;
}

interface VitestFileResult {
  name?: string;
  status?: string;
  assertionResults?: VitestAssertionResult[];
}

interface VitestJsonReport {
  success?: boolean;
  numFailedTestSuites?: number;
  testResults?: VitestFileResult[];
}

/**
 * Derives counts from the per-assertion records rather than the report's
 * top-level aggregates.
 *
 * The aggregates cannot be trusted: when a file's `beforeAll` hook throws, Vitest
 * marks the file `failed` and every assertion inside it `pending`, but still
 * reports those tests under `numPassedTests` with `numFailedTests: 0`. Reading
 * the aggregates would publish a clean sheet for a run in which whole suites
 * never executed — precisely the kind of unverified claim this report exists to
 * prevent. Files that failed without any failing assertion are counted as
 * errored and reported separately.
 */
function parseVitestReport(report: VitestJsonReport): {
  files: number;
  cases: number;
  passed: number;
  failed: number;
  skipped: number;
  erroredFiles: number;
  erroredNames: string[];
} {
  const files = report.testResults ?? [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let erroredFiles = 0;
  const erroredNames: string[] = [];

  for (const file of files) {
    const assertions = file.assertionResults ?? [];
    let failedInFile = 0;

    for (const assertion of assertions) {
      switch (assertion.status) {
        case 'passed':
          passed += 1;
          break;
        case 'failed':
          failed += 1;
          failedInFile += 1;
          break;
        default:
          // 'pending', 'skipped', 'todo'
          skipped += 1;
      }
    }

    if (file.status === 'failed' && failedInFile === 0) {
      erroredFiles += 1;
      erroredNames.push(path.basename(file.name ?? 'unknown'));
    }
  }

  return {
    files: files.length,
    cases: passed + failed + skipped,
    passed,
    failed,
    skipped,
    erroredFiles,
    erroredNames,
  };
}

/** Shape emitted by Playwright's `json` reporter. */
interface PlaywrightJsonReport {
  stats?: { expected?: number; unexpected?: number; flaky?: number; skipped?: number; duration?: number };
  suites?: unknown[];
}

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function runVitestSuite(
  suite: string,
  filterPackage: string,
  scope: string,
  scratchDir: string
): { result: SuiteResult; coverage: CoverageResult | null } {
  const reportPath = path.join(scratchDir, `${filterPackage.replace(/[^a-z]/gi, '-')}.json`);
  const startedAt = Date.now();

  const invoke = (withCoverage: boolean) =>
    // `vitest run` exits non-zero when tests fail. That is a result to report, not
    // a reason to abort — the whole point of the table is to state pass/fail honestly.
    spawnSync(
      'pnpm',
      [
        '--filter',
        filterPackage,
        'exec',
        'vitest',
        'run',
        ...(withCoverage ? ['--coverage'] : []),
        '--reporter=json',
        `--outputFile=${reportPath}`,
      ],
      { cwd: repoRoot, encoding: 'utf8', shell: true }
    );

  let run = invoke(true);
  let report = readJson<VitestJsonReport>(reportPath);
  let coverageUnavailable = false;

  // The v8 coverage provider can bring the worker down during teardown on
  // Windows (exit 0xC0000005), which kills the process before the JSON reporter
  // flushes — losing an otherwise complete run. Retry once without coverage so
  // the pass/fail record survives, and report coverage as unmeasured rather
  // than reporting nothing at all.
  if (!report) {
    coverageUnavailable = true;
    run = invoke(false);
    report = readJson<VitestJsonReport>(reportPath);
  }

  const durationSeconds = Math.round(((Date.now() - startedAt) / 1000) * 10) / 10;

  if (!report) {
    return {
      result: {
        suite,
        runner: 'Vitest',
        scope,
        files: 0,
        cases: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        erroredFiles: 0,
        durationSeconds,
        executed: false,
        note: `Runner produced no JSON report (exit code ${run.status ?? 'unknown'}).`,
      },
      coverage: null,
    };
  }

  const counts = parseVitestReport(report);

  const packageDir = filterPackage.replace('@lis/', 'apps/');
  // Only trust the coverage summary when the instrumented run actually
  // completed; a file left over from an earlier run would silently misreport.
  const summary = coverageUnavailable
    ? null
    : (readJson<Record<string, { pct: number }>>(
        path.join(repoRoot, packageDir, 'coverage', 'coverage-summary.json')
      ) as { total?: Record<string, { pct: number }> } | null);

  const totals = summary?.total;

  const notes: string[] = [];
  if (counts.erroredFiles > 0) {
    notes.push(
      `${counts.erroredFiles} file(s) failed during setup, so their tests did not run: ${counts.erroredNames.join(', ')}. Their cases are counted under Skipped, not Passed.`
    );
  }
  if (coverageUnavailable) {
    notes.push(
      'The instrumented run did not complete, so coverage is not reported for this suite; test results are from a re-run without coverage.'
    );
  }

  return {
    result: {
      suite,
      runner: 'Vitest',
      scope,
      files: counts.files,
      cases: counts.cases,
      passed: counts.passed,
      failed: counts.failed,
      skipped: counts.skipped,
      erroredFiles: counts.erroredFiles,
      durationSeconds,
      executed: true,
      note: notes.length > 0 ? notes.join(' ') : undefined,
    },
    coverage: totals
      ? {
          suite,
          statements: totals.statements?.pct ?? 0,
          branches: totals.branches?.pct ?? 0,
          functions: totals.functions?.pct ?? 0,
          lines: totals.lines?.pct ?? 0,
        }
      : null,
  };
}

function runPlaywrightSuite(scratchDir: string): SuiteResult {
  const reportPath = path.join(scratchDir, 'playwright.json');
  const startedAt = Date.now();

  const run = spawnSync('pnpm', ['--filter', '@lis/frontend', 'exec', 'playwright', 'test', '--reporter=json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath },
  });

  const durationSeconds = Math.round(((Date.now() - startedAt) / 1000) * 10) / 10;

  // Playwright writes JSON to stdout unless PLAYWRIGHT_JSON_OUTPUT_NAME is honoured.
  const report =
    readJson<PlaywrightJsonReport>(reportPath) ??
    (() => {
      try {
        return JSON.parse(run.stdout) as PlaywrightJsonReport;
      } catch {
        return null;
      }
    })();

  const base = {
    suite: 'End-to-end (browser)',
    runner: 'Playwright',
    scope: 'Authenticated browser workflows against a built frontend and backend',
    durationSeconds,
  };

  if (!report?.stats) {
    return {
      ...base,
      files: 0,
      cases: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      erroredFiles: 0,
      executed: false,
      note: `Runner produced no JSON report (exit code ${run.status ?? 'unknown'}). Playwright requires a running stack; see .github/workflows/ci.yml for the exact startup sequence.`,
    };
  }

  const passed = report.stats.expected ?? 0;
  const failed = report.stats.unexpected ?? 0;
  const skipped = report.stats.skipped ?? 0;

  return {
    ...base,
    files: report.suites?.length ?? 0,
    cases: passed + failed + skipped + (report.stats.flaky ?? 0),
    passed,
    failed,
    skipped,
    erroredFiles: 0,
    executed: true,
    note: report.stats.flaky ? `${report.stats.flaky} flaky (passed on retry).` : undefined,
  };
}

function describeEnvironment(): { hasDb: boolean; commit: string; node: string } {
  let commit = 'unknown (not a git checkout)';
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    // Reported as unknown rather than omitted.
  }

  return {
    // Mirrors the `hasDb` guard in apps/backend/src/tests/integration/*.
    hasDb: Boolean(process.env.DATABASE_URL && process.env.SESSION_SECRET),
    commit,
    node: process.version,
  };
}

function renderMarkdown(
  results: SuiteResult[],
  coverage: CoverageResult[],
  environment: ReturnType<typeof describeEnvironment>,
  generatedAt: string
): string {
  const executed = results.filter((result) => result.executed);
  const totals = executed.reduce(
    (accumulator, result) => ({
      files: accumulator.files + result.files,
      cases: accumulator.cases + result.cases,
      passed: accumulator.passed + result.passed,
      failed: accumulator.failed + result.failed,
      skipped: accumulator.skipped + result.skipped,
      erroredFiles: accumulator.erroredFiles + result.erroredFiles,
      durationSeconds: accumulator.durationSeconds + result.durationSeconds,
    }),
    { files: 0, cases: 0, passed: 0, failed: 0, skipped: 0, erroredFiles: 0, durationSeconds: 0 }
  );

  const isClean = totals.failed === 0 && totals.erroredFiles === 0;

  const lines = [
    '# Automated verification results',
    '',
    'Generated by `pnpm verify:report` — do not edit by hand.',
    '',
    `- Commit: \`${environment.commit}\``,
    `- Generated: ${generatedAt}`,
    `- Node: ${environment.node}`,
    `- Database-backed integration tests: **${environment.hasDb ? 'executed' : 'skipped'}** ` +
      `(\`DATABASE_URL\` and \`SESSION_SECRET\` ${environment.hasDb ? 'present' : 'absent'})`,
    '',
    `- Overall: **${isClean ? 'clean' : 'NOT clean'}** ` +
      `(${totals.failed} failed case(s), ${totals.erroredFiles} file(s) errored during setup)`,
    '',
    '## Results by suite',
    '',
    '| Suite | Runner | Files | Cases | Passed | Failed | Skipped | Setup errors | Duration (s) |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const result of results) {
    lines.push(
      result.executed
        ? `| ${result.suite} | ${result.runner} | ${result.files} | ${result.cases} | ${result.passed} | ${result.failed} | ${result.skipped} | ${result.erroredFiles} | ${result.durationSeconds} |`
        : `| ${result.suite} | ${result.runner} | — | — | — | — | — | — | not executed |`
    );
  }

  lines.push(
    `| **Total (executed suites)** | | **${totals.files}** | **${totals.cases}** | **${totals.passed}** | **${totals.failed}** | **${totals.skipped}** | **${totals.erroredFiles}** | **${Math.round(totals.durationSeconds * 10) / 10}** |`,
    ''
  );

  const notes = results.filter((result) => result.note);
  if (notes.length > 0) {
    lines.push('Notes:', '');
    for (const result of notes) lines.push(`- ${result.suite}: ${result.note}`);
    lines.push('');
  }

  lines.push('## Suite scope', '', '| Suite | What it exercises |', '| --- | --- |');
  for (const result of results) lines.push(`| ${result.suite} | ${result.scope} |`);
  lines.push('');

  if (coverage.length > 0) {
    lines.push(
      '## Coverage',
      '',
      'Line, branch, function, and statement coverage as measured by the v8 provider.',
      '',
      '| Suite | Statements | Branches | Functions | Lines |',
      '| --- | ---: | ---: | ---: | ---: |'
    );
    for (const entry of coverage) {
      lines.push(
        `| ${entry.suite} | ${entry.statements}% | ${entry.branches}% | ${entry.functions}% | ${entry.lines}% |`
      );
    }
    lines.push('');
  }

  lines.push(
    '## Definition of successful completion',
    '',
    'A test case counts as passed when every assertion in it holds. Beyond assertion',
    'success, the suites define completion as follows:',
    '',
    '- **Workflow tests** — the case reaches its terminal state (a signed-out final report)',
    '  and the queue predicates that governed its earlier stages no longer match it.',
    '- **State-machine tests** — every legal transition is accepted and every illegal',
    '  transition is rejected with the documented error code, across the full cross',
    '  product of statuses.',
    '- **Concurrency tests** — the losing writer receives HTTP 409 with the documented',
    '  conflict code, and the persisted record reflects exactly one of the two writes.',
    '- **PDF tests** — generated bytes parse as a valid PDF document with at least the',
    '  expected page count.',
    '',
    'Failures are reported in the table above rather than summarised in prose. A run is',
    'reported as clean only when the Failed column is zero for every executed suite.',
    ''
  );

  return lines.join('\n');
}

function main(): void {
  const scratchDir = mkdtempSync(path.join(tmpdir(), 'lis-verify-'));

  try {
    const environment = describeEnvironment();

    if (!environment.hasDb) {
      console.warn(
        'DATABASE_URL and/or SESSION_SECRET are not set — backend integration suites will report as skipped.\n'
      );
    }

    const backend = runVitestSuite(
      'Backend unit and integration',
      '@lis/backend',
      'Identifier generation, ancillary state machine, middleware, PDF generation, and HTTP integration against PostgreSQL',
      scratchDir
    );
    const frontend = runVitestSuite(
      'Frontend component and unit',
      '@lis/frontend',
      'React components, template normalisation, patient-summary rule matching, and conflict handling',
      scratchDir
    );

    const results: SuiteResult[] = [backend.result, frontend.result];
    if (runE2E) results.push(runPlaywrightSuite(scratchDir));

    const coverage = [backend.coverage, frontend.coverage].filter(
      (entry): entry is CoverageResult => entry !== null
    );

    const generatedAt = new Date().toISOString();
    mkdirSync(outputDir, { recursive: true });

    writeFileSync(
      path.join(outputDir, 'verification-report.json'),
      `${JSON.stringify({ ...environment, generatedAt, results, coverage }, null, 2)}\n`,
      'utf8'
    );
    writeFileSync(
      path.join(outputDir, 'verification-report.md'),
      renderMarkdown(results, coverage, environment, generatedAt),
      'utf8'
    );

    for (const result of results) {
      console.log(
        result.executed
          ? `${result.suite}: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped, ${result.erroredFiles} setup error(s) (${result.cases} cases)`
          : `${result.suite}: not executed — ${result.note ?? ''}`
      );
      if (result.note && result.executed) console.log(`  ! ${result.note}`);
    }

    console.log('\nWrote docs/verification/verification-report.md and .json');

    if (results.some((result) => result.executed && (result.failed > 0 || result.erroredFiles > 0))) {
      process.exitCode = 1;
    }
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}

main();
