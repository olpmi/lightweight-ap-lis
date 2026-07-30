import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Config for the manuscript figure captures.
 *
 *   GENERATE_MANUSCRIPT_FIGURES=1 pnpm figures:manuscript
 *
 * The capture specs are not verification tests — they drive the application to
 * produce publication artwork — so the default config ignores them and this one
 * points at them directly. Keeping them out of the verification suite matters for
 * more than tidiness: counted there, thirteen always-skipped specs made the E2E
 * results read "19 passed, 19 skipped", which misrepresents the suite in a table
 * the manuscript cites.
 *
 * Everything else is inherited, so the browser, base URL, global setup and the
 * conditional dev-server all stay defined in exactly one place.
 */
export default defineConfig({
  ...base,
  testDir: './src/tests/e2e/manuscript',
  // Cleared, not narrowed: the base config ignores this very directory.
  testIgnore: undefined,
});
