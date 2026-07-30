/**
 * Figures 3–5 — the end-to-end pathology workflow, in operational order.
 *
 *   GENERATE_MANUSCRIPT_FIGURES=1 pnpm figures:manuscript
 *
 * Panels follow the workflow rather than the interface's navigation order:
 * order entry, processing and grossing, histology material tracking, the
 * ancillary-testing branch, result entry and sign-out, then report versioning.
 * Ancillary testing sits between histology and sign-out because that is where it
 * happens — it is a branch off the diagnostic workup, not a step after the report.
 *
 * Two panels per figure, stacked. Panels are stacked rather than placed side by
 * side because printed text size depends only on how many CSS pixels the figure
 * spans horizontally: two screens side by side halve the text to about 5 pt, while
 * two stacked keep it at the single-panel size. Their heights add up instead, so
 * each panel takes a height budget and is captured as the top region of its screen,
 * or as a single card, rather than as the whole scrollable page.
 *
 * The figure numbers live in scripts/build-manuscript-figures.ts, which owns titles
 * and captions; each capture here names only the figure id it belongs to.
 *
 * Every panel follows the same synthetic case, built by ensureFigureCase.
 */
import { test, expect } from '@playwright/test';
import {
  FIGURE_CONTEXT,
  GENERATE_FIGURES,
  SKIP_REASON,
  apiLogin,
  browserLogin,
  capturePanel,
} from './helpers/figure-capture';
import {
  FIGURE_CLINICIAN,
  FIGURE_PATIENT,
  FIGURE_PREPARATION,
  FIGURE_REPORT,
  ensureFigureCase,
  type FigureCase,
} from './helpers/figure-case';

/**
 * Height budgets per panel, in CSS pixels.
 *
 * A figure 836 CSS px wide prints its 14 px body text at 9 pt, and the 202 mm of
 * page height left above a 45 mm legend allows it to be 886 px tall. Label rows,
 * margins and gutters take 108 of that, leaving ~778 to divide between the panels
 * of one figure. Two equal panels therefore get 385 each; where one panel of a pair
 * is a short card, the other can take 500.
 */
const PAIRED_PANEL_HEIGHT = 385;
const TALL_PANEL_HEIGHT = 500;

/**
 * Figure 5 carries three panels, so its share is smaller again: 886 px of page
 * height less three label rows, the margins and two gutters leaves 744 to divide.
 * The two tables take what they need and result entry takes the rest.
 */
const TRIPLE_TABLE_HEIGHT = 228;
const TRIPLE_FORM_HEIGHT = 288;

/**
 * The accessioning form is ~800 px tall once filled — more than a shared figure
 * allows — so it is shown as two panels of one screen: identities, then the case
 * type and specimens. Together they use the whole budget.
 */
const ORDER_ENTRY_TOP_HEIGHT = 390;
const ORDER_ENTRY_BOTTOM_HEIGHT = 398;

test.describe('Figures 3-5 — pathology workflow', () => {
  test.skip(!GENERATE_FIGURES, SKIP_REASON);
  test.use(FIGURE_CONTEXT);
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let figureCase: FigureCase;

  test.beforeAll(async ({ request }) => {
    const employeeId = await apiLogin(request);
    figureCase = await ensureFigureCase({ request, employeeId });
  });

  test.beforeEach(async ({ page }) => {
    await browserLogin(page);
  });

  test('order entry and specimen registration', async ({ page }) => {
    await page.goto('/order-entry');
    await expect(page.getByTestId('page-title')).toBeVisible();

    // Patient and clinician are separate Paper sections, each with its own
    // Existing/New chips and name fields, so scope by section.
    const section = (heading: string) =>
      page
        .locator('.MuiPaper-root')
        .filter({ has: page.getByText(heading, { exact: true }) })
        .first();

    const patient = section('Patient');
    await patient.getByText('New', { exact: true }).click();
    await patient.getByLabel('Last Name').fill(FIGURE_PATIENT.lastName);
    await patient.getByLabel('First Name').fill(FIGURE_PATIENT.firstName);
    await patient.getByLabel('Date of Birth').fill(FIGURE_PATIENT.dateOfBirth);
    await patient.getByRole('combobox').first().click();
    await page.getByRole('option', { name: FIGURE_PATIENT.sex }).click();
    await expect(page.getByRole('option')).toHaveCount(0);

    const clinician = section('Clinician');
    await clinician.getByText('New', { exact: true }).click();
    await clinician.getByLabel('Last Name').fill(FIGURE_CLINICIAN.lastName);
    await clinician.getByLabel('First Name').fill(FIGURE_CLINICIAN.firstName);

    const caseDetails = section('Case Details');
    await caseDetails.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Cytology' }).click();
    await expect(page.getByRole('option')).toHaveCount(0);

    // One specimen, matching the figure case, so the reader sees the same case
    // registered here that the later panels follow.
    //
    // Cytology sites are two-level: choosing a group reveals an Organ select, so a
    // row grows from one combobox to two as it is filled. A cytology row carries
    // no specimen-type select — the preparation is recorded as smear, ThinPrep and
    // cell-block counts instead. Rows are completed one at a time so the indices
    // stay predictable without depending on the row markup.
    const specimens = section('Specimens');

    const choose = async (index: number, option: string | RegExp) => {
      await specimens.getByRole('combobox').nth(index).click();
      const options = page.getByRole('option');
      await options.first().waitFor();
      await options.filter({ hasText: option }).first().click();
      await expect(page.getByRole('option')).toHaveCount(0);
    };

    // The whole preparation on one specimen: two direct smears and one cell block
    // from the same pleural fluid. The counts come from the same constant the
    // fixture uses, so this panel cannot disagree with the material panels.
    await choose(0, 'Fluid Cytology (Effusions)');
    await choose(1, 'Pleural fluid');
    await specimens.getByLabel('Smears').first().fill(String(FIGURE_PREPARATION.smearCount));
    await specimens
      .getByLabel('Cell Blocks')
      .first()
      .fill(String(FIGURE_PREPARATION.cellBlockCount));

    await capturePanel(page, {
      figure: 'figure-3',
      label: 'A',
      name: 'order-entry-identities',
      description:
        'Structured order entry: registration of a new synthetic patient and a new referring clinician',
      route: '/order-entry',
      target: page.getByRole('main'),
      maxHeight: ORDER_ENTRY_TOP_HEIGHT,
    });

    // The same form, continued. Anchored on the Case Details card so the second
    // panel starts on a card boundary rather than mid-field.
    await capturePanel(page, {
      figure: 'figure-3',
      label: 'B',
      name: 'order-entry-case-specimens',
      description:
        'The lower half of the same form: the cytology case type, and the first registered specimen with its two-level anatomical site and cytology preparation counts',
      route: '/order-entry',
      target: page.getByRole('main'),
      anchor: caseDetails,
      maxHeight: ORDER_ENTRY_BOTTOM_HEIGHT,
    });
  });

  test('processing and gross examination', async ({ page }) => {
    await page.goto(`/processing/${figureCase.orderId}`);
    await expect(page.getByRole('main')).toContainText(FIGURE_PATIENT.lastName);
    // The gross description is the structured processing evidence this panel needs.
    await expect(page.getByRole('main')).toContainText(FIGURE_REPORT.gross.slice(0, 40));

    // Anchored on the Clinical History card, so the crop starts at the row holding
    // the two recorded fields. The case header above it repeats what the other
    // panels of the figure already establish, and spending this panel's height on it
    // would push the gross description out of frame. Anchoring rather than targeting
    // a wrapper because the two cards are siblings with no element of their own.
    const clinicalHistoryCard = page
      .locator('.MuiPaper-root')
      .filter({ has: page.getByText('Clinical History', { exact: true }) })
      .last();

    await capturePanel(page, {
      figure: 'figure-4',
      label: 'A',
      name: 'processing-grossing',
      description:
        'Processing and gross examination for the same case: the referring clinical history beside the structured gross description recorded at the bench',
      route: `/processing/${figureCase.orderId}`,
      caseId: figureCase.orderId,
      target: page.getByRole('main'),
      anchor: clinicalHistoryCard,
      maxHeight: PAIRED_PANEL_HEIGHT,
    });
  });

  test('histology material tracking', async ({ page }) => {
    await page.goto(`/histology/${figureCase.orderId}`);
    await expect(page.getByRole('main')).toContainText(FIGURE_PATIENT.lastName);
    await expect(page.getByRole('main')).toContainText('Specimen A');

    // The preparation must read the same here as on the accessioning panel and in
    // the gross description: two direct smears carried on one block, and a cell
    // block with the section cut from it. Asserted by slide type rather than by
    // counting rows, because the type is what distinguishes the two.
    const main = page.getByRole('main');
    await expect(main.getByText('[Smear]', { exact: false })).toHaveCount(
      FIGURE_PREPARATION.smearCount
    );
    await expect(main.getByText('[H&E]', { exact: false })).toHaveCount(
      FIGURE_PREPARATION.cellBlockCount
    );

    // Cropped to the first specimen's card. A top-anchored crop of the screen spends
    // its height on the case header and then cuts the block table mid-row; the card
    // holds the whole specimen → block → slide hierarchy the panel exists to show.
    const specimenCard = page
      .locator('.MuiPaper-root')
      .filter({ has: page.getByText('Specimen A', { exact: true }) })
      .first();

    await capturePanel(page, {
      figure: 'figure-4',
      label: 'B',
      name: 'material-tracking',
      description:
        'Specimen, block and slide tracking with deterministic identifiers and H&E stain labels',
      route: `/histology/${figureCase.orderId}`,
      caseId: figureCase.orderId,
      target: specimenCard,
      maxHeight: TALL_PANEL_HEIGHT,
    });
  });

  test('ancillary testing linked to a block', async ({ page }) => {
    await page.goto(`/result/${figureCase.orderId}`);
    await expect(page.getByRole('main')).toContainText(FIGURE_PATIENT.lastName);
    await page.getByRole('tab').filter({ hasText: /ancillary/i }).click();

    // The test name, its originating block and its workflow state must all be
    // legible — that linkage is the point of the panel.
    const main = page.getByRole('main');
    await expect(main).toContainText(figureCase.ancillaryTestName);
    // Distributed is the terminal state: the stain has reached the pathologist. The
    // report comments on its result, so anything earlier would contradict the report
    // shown in the next panel. The status renders as a localised chip label, not the
    // raw enum value.
    await expect(main).toContainText('Distributed');
    // The stain must be on the cell block, not on a direct smear. Matched on the
    // block suffix because the interface renders the accession in its display form
    // (CN-26-111-A2) rather than the stored identifier.
    const cellBlockSuffix = /[A-Z]\d+$/.exec(figureCase.ancillaryBlockId)?.[0] ?? '';
    expect(cellBlockSuffix, `no block suffix in ${figureCase.ancillaryBlockId}`).toMatch(/^[A-Z]\d+$/);
    // No word boundary after the suffix: innerText runs the chip into the next
    // control ("…-A2Order Ancillary"), so \b never matches there.
    await expect(main).toContainText(new RegExp(`-${cellBlockSuffix}(?!\\d)`));

    // Cropped to the ancillary card rather than the screen. The card is where the
    // test-to-block linkage lives, and a top-anchored crop of the whole screen
    // would spend its height on the case header and cut the table off.
    const ancillaryCard = page
      .locator('.MuiPaper-root')
      .filter({ has: page.getByRole('button', { name: /order new test/i }) })
      .first();

    await capturePanel(page, {
      figure: 'figure-5',
      label: 'A',
      name: 'ancillary-testing',
      description: `Immunohistochemistry (${figureCase.ancillaryTestName}) ordered against block ${figureCase.ancillaryBlockId}, shown at its terminal distributed state`,
      route: `/result/${figureCase.orderId}`,
      caseId: figureCase.orderId,
      target: ancillaryCard,
      maxHeight: TRIPLE_TABLE_HEIGHT,
    });
  });

  test('result entry and sign-out', async ({ page }) => {
    await page.goto(`/result/${figureCase.orderId}`);
    await expect(page.getByRole('main')).toContainText(FIGURE_PATIENT.lastName);
    await expect(page.getByTestId('diagnosis-input')).toBeVisible();
    await expect(page.getByTestId('sign-out-btn')).toBeVisible();

    // Anchored on the authorization toolbar, so the panel opens on the controls and
    // spends the rest of its height on the diagnosis and comment rather than on a
    // case header the other panels of this figure already carry.
    await capturePanel(page, {
      figure: 'figure-5',
      label: 'B',
      name: 'result-signout',
      description:
        'Structured result entry with the draft, preliminary and final sign-out controls above the diagnosis and comment fields',
      route: `/result/${figureCase.orderId}`,
      caseId: figureCase.orderId,
      target: page.getByRole('main'),
      anchor: page.getByTestId('sign-out-btn'),
      maxHeight: TRIPLE_FORM_HEIGHT,
    });
  });

  test('report history and amendment', async ({ page }) => {
    await page.goto(`/result/${figureCase.orderId}`);
    await expect(page.getByRole('main')).toContainText(FIGURE_PATIENT.lastName);
    await page.getByRole('tab').filter({ hasText: /history/i }).click();

    const historyCard = page
      .locator('.MuiPaper-root')
      .filter({ has: page.getByText('Report History', { exact: true }) })
      .first();
    await expect(historyCard).toContainText('Final');
    await expect(historyCard).toContainText('Draft');

    // Cropped to the history card: the surrounding page adds nothing here, and a
    // tighter crop keeps the version table legible at journal width.
    await capturePanel(page, {
      figure: 'figure-5',
      label: 'C',
      name: 'report-history',
      description:
        'Report version history: the preserved signed-out final report alongside its open revision',
      route: `/result/${figureCase.orderId}`,
      caseId: figureCase.orderId,
      target: historyCard,
      maxHeight: TRIPLE_TABLE_HEIGHT,
    });
  });
});
