/**
 * Figure 6 and Supplementary Figure S1 — multilingual reporting and patient-facing
 * summaries.
 *
 *   GENERATE_MANUSCRIPT_FIGURES=1 pnpm figures:manuscript
 *
 * Four panels on one synthetic case. Figure 6 stacks the result-entry interface in
 * Arabic over the same screen in Kiswahili; Supplementary Figure S1 places the
 * patient-facing summary in English beside the same summary in Kiswahili.
 *
 * The summaries are the one pair captured side by side. A pair sharing a row halves
 * the CSS width available to each, which would halve the printed text — so the
 * summary panels are captured at a narrower viewport, where the card is naturally
 * narrow and tall. Two narrow columns then span the same total width as one wide
 * panel, and the text prints at the same size.
 *
 * All four come from curated, deterministic language resources — static
 * translation dictionaries for the interface, and rule-based summary definitions
 * keyed to the structured diagnostic category. Nothing here is model-generated,
 * so no experimental-translation notice applies.
 */
import { test, expect } from '@playwright/test';
import {
  FIGURE_CONTEXT,
  GENERATE_FIGURES,
  SKIP_REASON,
  apiLogin,
  browserLogin,
  capturePanel,
  setLanguage,
} from './helpers/figure-capture';
import { FIGURE_PATIENT, ensureFigureCase, type FigureCase } from './helpers/figure-case';

/** Height budget per stacked panel; see workflow.spec.ts for the arithmetic. */
const PAIRED_PANEL_HEIGHT = 393;

/** Interface panels: same tab, same scroll position, two languages. */
const INTERFACE_PANELS = [
  // English is omitted: Figure 5 already shows this screen in English, and a
  // duplicate would cost a whole panel for no added information.
  { label: 'A', language: 'ar', name: 'result-entry-ar', display: 'Arabic' },
  { label: 'B', language: 'sw', name: 'result-entry-sw', display: 'Kiswahili' },
] as const;

/** Patient-summary panels: the same resolved summary, two languages. */
const SUMMARY_PANELS = [
  { label: 'A', language: 'en', toggle: 'EN', name: 'patient-summary-en', display: 'English' },
  { label: 'B', language: 'sw', toggle: 'SW', name: 'patient-summary-sw', display: 'Kiswahili' },
] as const;

/**
 * Viewport for the summary panels only.
 *
 * Narrow enough that the summary card is about half the width of a full screen, so
 * the two translations sit side by side in a figure that still spans the same total
 * CSS width — and therefore prints at the same text size — as a single wide panel.
 *
 * The card measures the viewport less 268 px of drawer and page padding, so 658
 * yields a 390 px card: two of them plus the gutter and margins compose to 828 CSS
 * px, which prints at 9.1 pt. The card is 612 px tall at that width, well inside the
 * height such a figure may occupy, so both summaries are shown whole.
 */
const SUMMARY_VIEWPORT = { width: 658, height: 900 } as const;

test.describe('Figure 6 — multilingual interface', () => {
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

  for (const panel of INTERFACE_PANELS) {
    test(`result entry in ${panel.display}`, async ({ page }) => {
      await page.goto(`/result/${figureCase.orderId}`);
      await expect(page.getByRole('main')).toContainText(FIGURE_PATIENT.lastName);
      await setLanguage(page, panel.language);

      const expectedDirection = panel.language === 'ar' ? 'rtl' : 'ltr';
      await expect(page.locator('html')).toHaveAttribute('dir', expectedDirection);

      // The narrative fields keep their content.
      //
      // These panels once blanked them, on the reasoning that showing English prose
      // inside an Arabic screen might imply the prose had been translated. Blank
      // fields turned out to say less and hide more: the panel then showed only
      // navigation, and a reader could not see a report being read at all. What the
      // application actually does is translate its interface, its field labels and
      // its structured reporting fields, while free text stays in the language the
      // pathologist typed — so the panel shows exactly that, and the caption says
      // so. Nothing is hidden and nothing is implied.

      // Drop the keyboard-layout notice from the frame.
      //
      // It is a real and useful part of the Arabic and Urdu interfaces — it tells
      // the user that switching the application language does not switch their
      // keyboard — but the manuscript does not discuss keyboard entry, and the
      // banner is 60 px of the height this panel needs in order to reach the
      // translated reporting fields below it.
      await page.addStyleTag({
        content: '.MuiAlert-standardInfo { display: none !important; }',
      });

      // The main region rather than the whole window: a narrower capture prints
      // larger. Right-to-left is still evident from the mirrored tab order and
      // right-aligned labels within it, and is asserted above.
      //
      // The crop reaches past the navigation and the authorization controls to the
      // translated field headings, so the panel shows the reporting interface in
      // the language rather than only its chrome.
      await capturePanel(page, {
        figure: 'figure-6',
        label: panel.label,
        name: panel.name,
        description: `Structured result entry in ${panel.display}${
          panel.language === 'ar' ? ', with right-to-left page direction and mirrored navigation' : ''
        }`,
        route: `/result/${figureCase.orderId}`,
        caseId: figureCase.orderId,
        language: panel.language,
        target: page.getByRole('main'),
        maxHeight: PAIRED_PANEL_HEIGHT,
      });
    });
  }
});

test.describe('Figure S1 — patient-facing summaries', () => {
  test.skip(!GENERATE_FIGURES, SKIP_REASON);
  test.use({ ...FIGURE_CONTEXT, viewport: SUMMARY_VIEWPORT });
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let figureCase: FigureCase;

  test.beforeAll(async ({ request }) => {
    const employeeId = await apiLogin(request);
    figureCase = await ensureFigureCase({ request, employeeId });
  });

  test.beforeEach(async ({ page }) => {
    await browserLogin(page);
  });

  for (const panel of SUMMARY_PANELS) {
    test(`patient summary in ${panel.display}`, async ({ page }) => {
      await page.goto(`/result/${figureCase.orderId}`);
      await expect(page.getByRole('main')).toContainText(FIGURE_PATIENT.lastName);

      const summaryTab = page.getByRole('tab').filter({ hasText: /summary/i });
      await expect(summaryTab, 'the case must resolve a patient summary').toHaveCount(1);
      await summaryTab.click();

      const summaryCard = page
        .locator('.MuiPaper-root')
        .filter({ has: page.getByRole('button', { name: panel.toggle, exact: true }) })
        .first();

      // The summary has its own language toggle, independent of the interface
      // language, so the translated summary is shown through the application
      // rather than by editing the screenshot.
      await summaryCard.getByRole('button', { name: panel.toggle, exact: true }).click();
      await page.waitForLoadState('networkidle');

      await capturePanel(page, {
        figure: 'figure-s1',
        label: panel.label,
        name: panel.name,
        description: `Rule-based patient-facing summary in ${panel.display}, derived from the structured diagnostic category`,
        route: `/result/${figureCase.orderId}`,
        caseId: figureCase.orderId,
        language: panel.language,
        target: summaryCard,
      });
    });
  }
});
