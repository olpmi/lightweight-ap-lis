/**
 * Shared capture machinery for the manuscript figure specs.
 *
 * Every panel is rendered with the same viewport, scale, locale and timezone,
 * with animations and carets disabled, and is written alongside a metadata JSON
 * file recording the commit, route, case and browser that produced it. The
 * composite script reads those metadata files, so the three figure specs need no
 * shared in-process state and can run as separate workers.
 */
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// __dirname shim for ESM (the frontend package is type:module).
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../../../../../../..');

export const FIGURES_DIR = path.join(repoRoot, 'docs', 'manuscript', 'figures');
export const SOURCE_DIR = path.join(FIGURES_DIR, 'source');

/**
 * Applied via `test.use` so Playwright builds the context.
 *
 * The viewport is 1024 rather than 1920 for legibility, not aesthetics. Printed
 * text size is governed by how many CSS pixels of interface the figure spans:
 *
 *   printed pt = font_css_px × figure_width_mm ÷ (total_css_px × 0.3528)
 *
 * At 1920 with two columns, a figure spanned ~3350 CSS px across 190 mm and 14 px
 * body text printed at 2.2 pt — far under the ~7 pt journals ask for. At 1024 the
 * main region is ~804 CSS px and the composed figure ~836, which prints 14 px body
 * text at 9.0 pt — the largest viewport that still meets 9 pt, and so the one that
 * leaves the most height for stacked panels. It also stays above MUI's `md`
 * breakpoint (900), so two-up card layouts still look like the desktop application
 * rather than a phone.
 *
 * The viewport is 900 tall rather than 700 so a panel may be cropped to 500 CSS px
 * where its figure has the height to spare.
 *
 * For the same reason the navigation drawer is left open and panels capture the
 * main region: the drawer narrows `main`, which enlarges the printed text.
 */
export const FIGURE_CONTEXT = {
  viewport: { width: 1024, height: 900 },
  deviceScaleFactor: 4,
  locale: 'en-US',
  timezoneId: 'UTC',
  colorScheme: 'light',
  reducedMotion: 'reduce',
} as const;

export const GENERATE_FIGURES = process.env.GENERATE_MANUSCRIPT_FIGURES === '1';
export const SKIP_REASON = 'Run only when generating manuscript figures';

const SEEDED_USER = process.env.FIGURES_USER ?? 'asmith';
const SEEDED_PASSWORD = process.env.FIGURES_PASSWORD ?? 'Pathology1!';

/**
 * The seeded administrator.
 *
 * The configuration figures capture the /config surface, which is
 * Administrator-only, so they cannot be captured as the seeded pathologist.
 * All seeded accounts share SEED_PASSWORD.
 */
export const SEEDED_ADMIN = process.env.FIGURES_ADMIN_USER ?? 'padmin';

let cachedCommit: string | null = null;

function commit(): string {
  if (cachedCommit) return cachedCommit;
  try {
    cachedCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    cachedCommit = 'unknown (not a git checkout)';
  }
  return cachedCommit;
}

/** Signs in through the API so fixtures can run before a browser is opened. */
export async function apiLogin(request: APIRequestContext): Promise<number> {
  const search = await request.get(`/api/employees/search?q=${SEEDED_USER}`);
  expect(search.ok(), 'employee search failed').toBeTruthy();
  const employees = (await search.json()) as { data: Array<{ employeeId: number | string }> };
  const employeeId = Number(employees.data[0]?.employeeId);
  expect(employeeId, `seeded user ${SEEDED_USER} not found`).toBeTruthy();

  const login = await request.post('/api/auth/login', {
    data: { employeeId, password: SEEDED_PASSWORD },
  });
  expect(login.ok(), `login failed: ${login.status()}`).toBeTruthy();
  return employeeId;
}

/**
 * Signs in through the interface, for the capture session.
 *
 * The interface language is then set explicitly rather than inherited. The
 * application applies the signed-in employee's stored preference, and the seeded
 * demo pathologist's is not English — so every English-text locator in these
 * specs would otherwise depend on which language that user was last left in.
 * Setting it here also persists it for the user, which is why the specs that need
 * another language set it themselves and the README records the side effect.
 */
export async function browserLogin(page: Page, language = 'en', userName = SEEDED_USER): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('employee-search-input').fill(userName);
  await page.waitForSelector(`[data-testid="employee-option-${userName}"]`);
  await page.getByTestId(`employee-option-${userName}`).click();
  await page.getByTestId('login-password').fill(SEEDED_PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.locator('button[value="en"]').first().waitFor({ state: 'visible' });
  await setLanguage(page, language);
}

/** The switcher is a ToggleButtonGroup keyed by language code, so this is locale-independent. */
export async function setLanguage(page: Page, language: string): Promise<void> {
  const button = page.locator(`button[value="${language}"]`).first();
  await button.waitFor({ state: 'visible' });
  await button.click();
  await expect(page.locator('html')).toHaveAttribute('lang', language);
}

/** Removes every source of frame-to-frame variation before a capture. */
async function stabilise(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
    `,
  });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Fails the capture rather than shipping a panel showing an error, a spinner or a
 * placeholder string. Informational alerts are allowed: the patient-facing
 * summary renders its safety note as one, and that belongs in the figure.
 */
async function assertPanelHealthy(page: Page, target: Locator): Promise<void> {
  await expect(
    page.locator(
      '.MuiAlert-standardError, .MuiAlert-filledError, .MuiAlert-outlinedError, ' +
        '.MuiAlert-standardWarning, .MuiAlert-filledWarning, .MuiAlert-outlinedWarning'
    )
  ).toHaveCount(0);
  await expect(page.locator('[role="progressbar"]')).toHaveCount(0);
  await expect(target).toBeVisible();

  const text = (await target.innerText()) ?? '';
  // Word-boundary matched so legitimate content is not mistaken for a placeholder.
  expect(text).not.toMatch(/\b(undefined|NaN)\b/);
  expect(text).not.toMatch(/\bnull\b/);
  // A component that loads its own bundle at runtime renders this instead of a
  // spinner, so the progressbar check above does not see it. No panel legitimately
  // shows it: the application's loading text only ever stands in for content.
  expect(text, 'panel still shows a loading placeholder').not.toMatch(/Loading\.\.\./);
}

export interface PanelOptions {
  /**
   * Figure this panel belongs to: 'figure-3' … 'figure-9', 'figure-s1' …, and also
   * the source subdirectory. The number's meaning — title and caption — lives in
   * scripts/build-manuscript-figures.ts, which is the single place figures are
   * numbered.
   */
  figure: string;
  /** Panel label within the figure: 'A', 'B', … Suppressed when a figure holds one panel. */
  label: string;
  /** File stem, without extension. */
  name: string;
  description: string;
  route: string;
  caseId?: string | null;
  language?: string;
  /** Region to capture. Prefer the smallest meaningful region over the whole page. */
  target: Locator;
  /**
   * Element to start the crop at, for a panel showing a lower part of a screen.
   *
   * A screen too tall to fit one panel can be shown as two, but the second must
   * begin somewhere sensible. Anchoring on an element makes the top edge land on a
   * card boundary instead of an arbitrary offset that would cut a field in half.
   */
  anchor?: Locator;
  /**
   * Height budget for this panel, in CSS pixels, capped at the viewport.
   *
   * Printed text size depends only on how many CSS pixels the *composite* spans
   * horizontally, so panels stacked in one column all print at the panel's own
   * scale — but their heights add up, and a figure taller than the space above its
   * legend gets scaled down to fit, shrinking the text after all. Panels that share
   * a figure therefore declare a height budget: two stacked panels of ~430 keep a
   * 772-wide figure inside one page at 9 pt.
   */
  maxHeight?: number;
  /** Keep the application header, where it carries figure content. */
  keepAppChrome?: boolean;
}

/**
 * Captures one panel as PNG plus a vector PDF, and writes its metadata.
 *
 * Chromium cannot emit SVG, but its print-to-PDF keeps text as text with embedded
 * fonts and CSS boxes as paths, so the PDF opens in a vector editor as editable
 * artwork. Box shadows are the one construct it rasterises, so they are swapped
 * for a hairline border during the vector pass.
 */
export async function capturePanel(page: Page, options: PanelOptions): Promise<void> {
  const outputDir = path.join(SOURCE_DIR, options.figure);
  mkdirSync(outputDir, { recursive: true });

  await stabilise(page);
  // Drop focus. Whichever field was filled last would otherwise keep its focus
  // ring and spinner buttons, which reads as "this control is active" in a still
  // image rather than as the state the panel is meant to show.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Escape');
  await expect(page.locator('.MuiPopover-root, .MuiDialog-root')).toHaveCount(0);
  await assertPanelHealthy(page, options.target);

  if (!options.keepAppChrome) {
    // The header is position:fixed, so it paints over the main region's top
    // padding and would otherwise appear in the crop.
    await page.addStyleTag({
      content: `
        .MuiAppBar-root { display: none !important; }
        main, [role="main"] { padding-top: 24px !important; }
      `,
    });
  }

  // Back to the top of the document first. Interacting with a field lower down
  // scrolls it into view, and the clip is viewport-relative — so without this a
  // panel can silently capture the middle of a page instead of its top, losing
  // the case header and tab bar that identify what is being shown.
  await page.evaluate(() => window.scrollTo(0, 0));
  await options.target.scrollIntoViewIfNeeded();

  // An anchored panel scrolls its anchor to the top of the viewport first, so the
  // crop below starts on that element's own top edge.
  let anchorTop: number | null = null;
  if (options.anchor) {
    const anchorBox = await options.anchor.boundingBox();
    if (!anchorBox) throw new Error(`Anchor for ${options.name} has no bounding box`);
    await page.evaluate((y) => window.scrollBy(0, y), anchorBox.y - 16);
    await page.waitForTimeout(50); // let the scroll settle before measuring
    const settled = await options.anchor.boundingBox();
    anchorTop = settled ? settled.y - 16 : null;
  }

  const box = await options.target.boundingBox();
  if (!box) throw new Error(`Capture target for ${options.name} has no bounding box`);

  // Trim to the rendered content, capped at the viewport.
  //
  // The main region is min-height:100vh, so a short page would otherwise
  // contribute a large empty band — and once panels are composed, that dead space
  // shrinks the content of every other panel in the figure. Capping at the
  // viewport keeps a long page from becoming an unreadably tall panel.
  const contentBottom = await options.target.evaluate((element) => {
    let bottom = 0;
    for (const child of Array.from(element.querySelectorAll('*'))) {
      const rect = child.getBoundingClientRect();
      if (rect.height > 0 && rect.width > 0) bottom = Math.max(bottom, rect.bottom);
    }
    // An element with no children of its own still has its own extent.
    return bottom || element.getBoundingClientRect().bottom;
  });

  const viewport = page.viewportSize();
  const top = Math.max(anchorTop ?? box.y, 0);
  const left = Math.max(box.x, 0);
  const contentHeight = Math.max(contentBottom - top, 0) + 24; // 24px breathing room
  const wantedHeight = Math.min(box.height, contentHeight);
  const budget = options.maxHeight ?? Number.POSITIVE_INFINITY;

  // A screenshot clip is viewport-relative, so the viewport height is a hard
  // ceiling on a panel however much of the target is laid out below the fold.
  const viewportLimit = (viewport?.height ?? box.height) - top;

  // A panel that declares a height budget is meant to be cropped, and cropped to
  // that budget — the composer's arithmetic depends on it. Height the viewport
  // takes off on top of that is truncation nobody asked for: a line of body text
  // cut through the middle, a card missing its lower edge, a safety note ending
  // mid-sentence. It is invisible in the composite, because the crop looks like a
  // deliberate one, so it fails the capture rather than shipping the panel.
  if (viewportLimit < Math.min(wantedHeight, budget)) {
    throw new Error(
      `Panel ${options.name} is truncated by the capture viewport: it needs ` +
        `${Math.ceil(Math.min(wantedHeight, budget))} CSS px below y=${Math.round(top)}, but a ` +
        `${viewport?.height ?? 0} px viewport leaves only ${Math.floor(viewportLimit)}. ` +
        `Raise the viewport height for this figure, or declare a maxHeight if the crop is intended.`
    );
  }

  const clip = {
    x: left,
    y: top,
    width: Math.min(box.width, (viewport?.width ?? box.width) - left),
    height: Math.min(wantedHeight, budget),
  };

  // The same region in document coordinates.
  //
  // `clip` is viewport-relative, because that is what page.screenshot takes. The
  // vector pass below prints the whole document as one tall page, so a crop of it
  // has to be measured from the document's top — and the two differ by however far
  // the page has been scrolled, which an anchored panel scrolls on purpose. Left
  // unrecorded, the composer had only the viewport figure to crop the PDF with, and
  // a scrolled panel's vector artwork was taken from that many pixels too high:
  // the sign-out panel's PDF showed the case header instead of the authorization
  // controls its raster twin shows. Scroll-invariant by construction — scrolling
  // moves the element up by exactly what it adds here.
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  const documentClip = {
    x: clip.x + scroll.x,
    y: clip.y + scroll.y,
    width: clip.width,
    height: clip.height,
  };

  await page.screenshot({
    path: path.join(outputDir, `${options.name}.png`),
    animations: 'disabled',
    clip,
  });

  await page.addStyleTag({
    content: `
      * { box-shadow: none !important; }
      .MuiPaper-root { border: 1px solid #e0e0e0 !important; }
    `,
  });
  await page.emulateMedia({ media: 'screen' });

  const documentHeight = await page.evaluate(() =>
    Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))
  );
  await page.pdf({
    path: path.join(outputDir, `${options.name}.pdf`),
    printBackground: true,
    width: `${viewport?.width ?? Math.ceil(clip.width)}px`,
    height: `${documentHeight}px`,
    pageRanges: '1',
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });

  const metadata = {
    figure: options.figure,
    panel: options.label,
    name: options.name,
    description: options.description,
    route: options.route,
    caseId: options.caseId ?? null,
    language: options.language ?? 'en',
    commit: commit(),
    // The page's own viewport, not the shared default: the patient-summary panels
    // override it, and a metadata file recording the width they were not captured
    // at is the one place a reader would go to check the crop against it.
    viewport: viewport ?? FIGURE_CONTEXT.viewport,
    deviceScaleFactor: FIGURE_CONTEXT.deviceScaleFactor,
    browser: `Chromium ${page.context().browser()?.version() ?? 'unknown'}`,
    clip,
    documentClip,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(
    path.join(outputDir, `${options.name}.json`),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8'
  );
}
