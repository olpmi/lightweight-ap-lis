import { test, expect, Page } from '@playwright/test';

// ─── Helpers ──────────────────────────────────────────────────────────────

const DEFAULT_USER = process.env.E2E_USER ?? 'asmith';

async function loginAsExistingEmployee(page: Page, userName = DEFAULT_USER) {
  await page.goto('/login');
  await page.getByTestId('employee-search-input').fill(userName);
  await page.waitForSelector(`[data-testid="employee-option-${userName}"]`);
  await page.getByTestId(`employee-option-${userName}`).click();
  await page.waitForURL('/order-entry');
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Authentication', () => {
  test('login as existing employee', async ({ page }) => {
    await loginAsExistingEmployee(page);
    await expect(page.getByTestId('page-title')).toHaveText('Order Entry');
  });

  test('create new employee and login', async ({ page }) => {
    await page.goto('/login');
    await page.getByText(/New employee/i).click();
    await page.getByTestId('new-employee-firstname').fill('Test');
    await page.getByTestId('new-employee-lastname').fill('E2EUser');
    await page.getByTestId('new-employee-username').fill(`e2euser_${Date.now()}`);
    await page.getByTestId('new-employee-role').click();
    // MUI Select renders options as role="option"; using getByText would
    // also match the label, which can be ambiguous.
    await page.getByRole('option', { name: 'Technologist' }).click();
    await page.getByTestId('new-employee-submit').click();
    await page.waitForURL('/order-entry');
    await expect(page.getByTestId('page-title')).toBeVisible();
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
    await page.getByTestId('query-order-id').fill('SU25');
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
    await page.getByTestId('query-order-id').fill('SU25');
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
