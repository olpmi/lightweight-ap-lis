import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/tests/e2e',
  // The manuscript specs live under this directory but are not verification tests:
  // they capture figures, and they skip unless GENERATE_MANUSCRIPT_FIGURES is set.
  // Counted here they made the suite read "19 passed, 19 skipped", which says the
  // wrong thing about a system's test coverage. They run through
  // playwright.figures.config.ts instead.
  testIgnore: '**/manuscript/**',
  globalSetup: './src/tests/e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start dev server for local E2E runs
  webServer: process.env.CI
    ? undefined
    : {
        command: 'pnpm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
