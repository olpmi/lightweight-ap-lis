import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    // Integration tests share a single PostgreSQL instance and contend on shared
    // fixtures (the `pathologist` role, the `Test Site` body site) and on the
    // per-prefix accession-number sequence row. Running files in parallel makes
    // those setups race, which surfaced as whole suites failing in `beforeAll`
    // roughly one run in two. Serialising files makes the suite deterministic;
    // it costs a few seconds because the suite is small.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      // Conservative starting floor — ratchet up as tests are added.
      // Run `npm run test:coverage` locally to see current numbers; CI uses
      // the same thresholds via the `--coverage` flag in .github/workflows/ci.yml.
      thresholds: {
        lines: 50,
        functions: 35,
        statements: 50,
        branches: 55,
      },
      include: ['src/**/*.ts'],
      exclude: [
        'src/tests/**',
        'src/**/*.test.ts',
        'src/server.ts',
        // Stub for Phase 2 — no call sites yet, so 0% coverage.
        'src/lib/prismaReplica.ts',
      ],
    },
  },
});
