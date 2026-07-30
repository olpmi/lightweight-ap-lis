/**
 * Supplementary Figures S2 and S3 — configuration interfaces.
 *
 *   GENERATE_MANUSCRIPT_FIGURES=1 pnpm figures:manuscript
 *
 * All three panels show configuration actually in use rather than navigation: a
 * structured template selected and open in its editor (S2), then the ancillary
 * catalogue with individual immunohistochemistry tests expanded and a diagnostic
 * panel's composition (S3). The template manager takes a figure of its own because
 * three panels cannot share one page and still print at 9 pt.
 *
 * On the two H&E entries: the catalogue deliberately holds both an "H&E" category
 * containing "H&E Staining" — the routine slide created automatically for every
 * block — and an "H&E Levels" category for additional levels ordered as an
 * ancillary test. They are different tests, not duplicates. Because "H&E" is
 * system-managed rather than user-orderable, the catalogue screen expands the IHC
 * category, where the configurable content lives.
 */
import { test, expect } from '@playwright/test';
import {
  FIGURE_CONTEXT,
  GENERATE_FIGURES,
  SKIP_REASON,
  browserLogin,
  capturePanel,
} from './helpers/figure-capture';

/** A recognisable cytology reporting template with structured sections. */
const TEMPLATE_TITLE_PATTERN = /fluid cytology reporting template/i;

/** A diagnostic panel whose composition is worth showing. */
const PANEL_NAME = 'Breast Panel';

/**
 * The template manager is dense enough to hold a figure by itself, so its panel may
 * take almost the whole page; the two ancillary tabs share one, at 385 each. See
 * workflow.spec.ts for the arithmetic behind both numbers.
 */
const FULL_PANEL_HEIGHT = 820;
const PAIRED_PANEL_HEIGHT = 385;

test.describe('Figures S2-S3 — configuration interfaces', () => {
  test.skip(!GENERATE_FIGURES, SKIP_REASON);
  test.use(FIGURE_CONTEXT);
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  test.beforeEach(async ({ page }) => {
    await browserLogin(page);
  });

  test('template manager with a template selected', async ({ page }) => {
    await page.goto('/config/templates');
    await expect(page.getByRole('main')).toBeVisible();

    // The tree groups templates by family; folder rows carry a trailing slash.
    // Scoped to list buttons so the navigation drawer's own buttons are excluded.
    const treeItems = page.locator('.MuiListItemButton-root');
    await treeItems.filter({ hasText: 'fluid_cytology/' }).first().click();

    const templateItem = treeItems.filter({ hasText: TEMPLATE_TITLE_PATTERN }).first();
    await templateItem.waitFor();
    await templateItem.click();

    // Wait for the editor, not just the click: the panel is worthless if it shows
    // the unselected placeholder.
    await expect(page.getByRole('main')).not.toContainText('Select a template to edit');
    await page.waitForLoadState('networkidle');

    await capturePanel(page, {
      figure: 'figure-s2',
      label: 'A',
      name: 'template-manager',
      description:
        'Template manager with a structured fluid-cytology reporting template selected, showing the template library, the declarative definition and the per-language resource tabs',
      route: '/config/templates',
      target: page.getByRole('main'),
      maxHeight: FULL_PANEL_HEIGHT,
    });
  });

  test('ancillary catalogue with the IHC category expanded', async ({ page }) => {
    await page.goto('/config/ancillary');
    await expect(page.getByRole('main')).toBeVisible();

    // Categories start collapsed; the header row toggles them.
    const ihcHeader = page.getByText('IHC', { exact: false }).first();
    await ihcHeader.click();
    // Expanded means the individual orderables are now listed.
    await expect(page.getByRole('main')).toContainText('HER2');

    await capturePanel(page, {
      figure: 'figure-s3',
      label: 'A',
      name: 'ancillary-tests',
      description:
        'Ancillary test catalogue with the immunohistochemistry category expanded to show individual orderables',
      route: '/config/ancillary',
      target: page.getByRole('main'),
      maxHeight: PAIRED_PANEL_HEIGHT,
    });
  });

  test('diagnostic panel composition', async ({ page }) => {
    await page.goto('/config/ancillary');
    await expect(page.getByRole('main')).toBeVisible();

    await page.getByRole('tab').filter({ hasText: /panels/i }).click();
    // Panel rows list their constituent tests as chips, so no expansion is needed.
    await expect(page.getByRole('main')).toContainText(PANEL_NAME);
    await expect(page.getByRole('main')).toContainText('HER2');

    await capturePanel(page, {
      figure: 'figure-s3',
      label: 'B',
      name: 'ancillary-panels',
      description: `Diagnostic panel configuration, including ${PANEL_NAME} and its constituent immunohistochemistry tests`,
      route: '/config/ancillary',
      target: page.getByRole('main'),
      maxHeight: PAIRED_PANEL_HEIGHT,
    });
  });
});
