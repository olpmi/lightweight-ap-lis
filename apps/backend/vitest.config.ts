import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Restore threads pool (vitest 3.x default changed to forks; threads is
    // more reliable for V8 coverage collection on Node 20 in CI).
    pool: 'threads',
    include: ['src/tests/**/*.test.ts'],
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
