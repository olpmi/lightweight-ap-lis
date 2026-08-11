import { test, expect, Page } from '@playwright/test';

// ─── Helpers ──────────────────────────────────────────────────────────────

const DEFAULT_USER = process.env.E2E_USER ?? 'asmith';
const DEFAULT_PASSWORD = process.env.E2E_PASSWORD ?? 'Pathology1!';

// The seeded administrator. /api/config/* is Administrator-only, so the
// configuration specs need an account the seeded pathologists cannot provide.
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'padmin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? DEFAULT_PASSWORD;

async function loginAsExistingEmployee(page: Page, userName = DEFAULT_USER, password = DEFAULT_PASSWORD) {
  await page.goto('/login');
  await page.getByTestId('employee-search-input').fill(userName);
  await page.waitForSelector(`[data-testid="employee-option-${userName}"]`);
  await page.getByTestId(`employee-option-${userName}`).click();
  // Password prompt appears after selecting an existing employee.
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  // Different roles land on different pages (Pathologist -> /, others -> /order-entry).
  // Just wait for navigation away from /login.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Authentication', () => {
  test('login as existing employee', async ({ page }) => {
    await loginAsExistingEmployee(page);
    // Pathologist users land on Home (/), others on /order-entry. Verify
    // we're authenticated by the presence of the side-nav Logout button.
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
  });

  test('self-registration is not offered once accounts exist', async ({ page }) => {
    // This spec used to create an account through the login page and sign in as
    // it. That path is now the first-run bootstrap only: it is open while the
    // employee table is empty and closes permanently after the first account, so
    // that an anonymous caller cannot mint itself a privileged one. The seeded
    // database has staff, so the form must not be on offer.
    await page.goto('/login');
    await expect(page.getByTestId('employee-search-input')).toBeVisible();
    await expect(page.getByText(/New employee/i)).toHaveCount(0);
  });
});

test.describe('Role-based authorization', () => {
  test('a pathologist has no access to the configuration surface', async ({ page }) => {
    // /api/config/* is Administrator-only. The seeded pathologist should not see
    // the entry, and reaching the route directly should not render the page.
    await loginAsExistingEmployee(page);
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();

    await expect(page.getByText('Configuration')).toHaveCount(0);

    await page.goto('/config/data-import');
    await expect(page.getByTestId('forbidden-notice')).toBeVisible();
  });

  test('an administrator can reach the configuration surface', async ({ page }) => {
    await loginAsExistingEmployee(page, ADMIN_USER, ADMIN_PASSWORD);
    await expect(page.getByText('Configuration')).toBeVisible();

    await page.goto('/config/data-import');
    await expect(page.getByTestId('forbidden-notice')).toHaveCount(0);
  });
});

test.describe('Order Entry', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsExistingEmployee(page);
  });

  // The full order-creation happy path is covered deterministically by the
  // backend integration test apps/backend/src/tests/integration/orderWorkflow.test.ts.
  // The Playwright E2E only verifies the page renders the key controls.
  test('order entry page renders core controls', async ({ page }) => {
    await page.goto('/order-entry');
    await expect(page.getByTestId('page-title')).toHaveText('Order Entry');
    await expect(page.getByTestId('add-specimen-btn')).toBeVisible();
    await expect(page.getByTestId('submit-order-btn')).toBeVisible();
  });
});

test.describe('Processing Queue', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsExistingEmployee(page);
  });

  test('displays processing queue table', async ({ page }) => {
    await page.goto('/processing');
    await expect(page.getByTestId('processing-queue-table')).toBeVisible();
  });

  test('toggle show all works', async ({ page }) => {
    await page.goto('/processing');
    const toggle = page.getByTestId('show-all-toggle');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByTestId('processing-queue-table')).toBeVisible();
  });

  test('click row opens case processing page', async ({ page }) => {
    await page.goto('/processing');
    const firstRow = page.locator('[data-testid^="queue-row-"]').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await expect(page.getByTestId('order-id-heading')).toBeVisible();
  });
});

test.describe('Result Queue', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsExistingEmployee(page);
  });

  test('displays result queue table', async ({ page }) => {
    await page.goto('/result');
    await expect(page.getByTestId('result-queue-table')).toBeVisible();
  });

  test('click result row opens result case page', async ({ page }) => {
    await page.goto('/result');
    const firstRow = page.locator('[data-testid^="result-row-"]').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await expect(page.getByTestId('result-order-id')).toBeVisible();
  });
});

test.describe('Query', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsExistingEmployee(page);
  });

  test('search by order ID returns results', async ({ page }) => {
    await page.goto('/query');
    // 'SU' is the case-type prefix; it matches every surgical order regardless of year.
    await page.getByTestId('query-order-id').fill('SU');
    await page.getByTestId('query-search-btn').click();
    await expect(page.getByTestId('query-results-table')).toBeVisible();
  });

  test('search by patient ID returns results', async ({ page }) => {
    await page.goto('/query');
    await page.getByTestId('query-patient-id').fill('P');
    await page.getByTestId('query-search-btn').click();
    await expect(page.getByTestId('query-results-table')).toBeVisible();
  });

  test('clicking a query result navigates to result page', async ({ page }) => {
    await page.goto('/query');
    // 'SU' prefix is year-agnostic; 'SU25' would miss seed orders generated in any other year.
    await page.getByTestId('query-order-id').fill('SU');
    await page.getByTestId('query-search-btn').click();
    const firstRow = page.locator('[data-testid^="query-result-row-"]').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await expect(page.getByTestId('result-order-id')).toBeVisible();
  });
});

test.describe('Result / Sign-out workflow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsExistingEmployee(page);
  });

  test('result case page shows sign-out button on draft', async ({ page }) => {
    await page.goto('/result');
    const firstRow = page.locator('[data-testid^="result-row-"]').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();

    const diagInput = page.getByTestId('diagnosis-input');
    await expect(diagInput).toBeVisible();
    await diagInput.fill('Test diagnosis for E2E');
    await expect(page.getByTestId('sign-out-btn')).not.toBeDisabled();
  });
});

/**
 * Language switching in a real browser.
 *
 * demo-lifecycle.spec.ts and i18n-audit.spec.ts also cover language behaviour,
 * but both are gated behind RUN_DEMO / RUN_I18N_AUDIT and do not run in CI.
 * These cases keep all six languages — and the right-to-left flip — on the
 * default CI path.
 *
 * The switcher is a ToggleButtonGroup of <ToggleButton value="xx">, so
 * selecting by the `value` attribute is locale-independent.
 */
test.describe('Interface languages', () => {
  const LANGUAGES = [
    { code: 'en', direction: 'ltr' },
    { code: 'sw', direction: 'ltr' },
    { code: 'fr', direction: 'ltr' },
    { code: 'pt', direction: 'ltr' },
    { code: 'ar', direction: 'rtl' },
    { code: 'ur', direction: 'rtl' },
  ] as const;

  test.beforeEach(async ({ page }) => {
    await loginAsExistingEmployee(page);
  });

  for (const { code, direction } of LANGUAGES) {
    test(`switches the interface to ${code} and applies ${direction} direction`, async ({ page }) => {
      const button = page.locator(`button[value="${code}"]`).first();
      await expect(button).toBeVisible();
      await button.click();

      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await expect(page.locator('html')).toHaveAttribute('dir', direction);
    });
  }

  test('returns to left-to-right after leaving a right-to-left language', async ({ page }) => {
    await page.locator('button[value="ar"]').first().click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await page.locator('button[value="en"]').first().click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });
});
