/**
 * Builds the composite manuscript figures from the captured source panels.
 *
 *   GENERATE_MANUSCRIPT_FIGURES=1 pnpm figures:manuscript   # capture panels
 *   pnpm figures:compose                                    # this script
 *
 * Each figure is written twice from one shared layout:
 *
 *   - PNG, for journal upload. Rendered through the same Chromium that Playwright
 *     pins for capture, so label typography matches the panels.
 *   - PDF, vector, for editing in Illustrator or similar. Assembled with pdf-lib
 *     from the vector panel pages, so text stays text and boxes stay paths.
 *
 * Panel order, membership and labels come from the metadata JSON written beside
 * each source panel, so the capture specs are the single source of truth for what
 * a figure contains.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const figuresDir = path.join(repoRoot, 'docs', 'manuscript', 'figures');
const sourceDir = path.join(figuresDir, 'source');
const compositesDir = path.join(figuresDir, 'composites');
const captionsDir = path.join(figuresDir, 'captions');
/**
 * Web-sized copies of a few figures, outside docs/manuscript/ because that whole
 * tree is gitignored. The root README embeds these, so they have to live where
 * git — and therefore GitHub — can see them.
 */
const webDir = path.join(repoRoot, 'docs', 'images');

/**
 * Minimum reproduction resolution for combination art, in dpi at the print width.
 *
 * Checked instead of an absolute pixel count: pixel width alone says nothing
 * without the physical size it is reproduced at.
 */
const MIN_DPI = 300;

/**
 * Panels are captured at deviceScaleFactor 4, so the raster figure renders at 4x.
 *
 * Pixel density is independent of printed text size — it only sets reproduction
 * resolution. One screen per figure makes the figure narrow in CSS terms, so the
 * density has to rise to keep dpi above the floor.
 */
const RASTER_SCALE = 4;

/**
 * Width of the web copies, in device pixels.
 *
 * A fixed width rather than a fixed scale factor: the figures differ in CSS width,
 * so a shared scale would render them at different pixel widths and GitHub would
 * show them at inconsistent sizes down the README. 1200 px is about 1.4x GitHub's
 * content column, so it stays sharp on a high-density display without carrying
 * print resolution into a tracked directory.
 */
const WEB_WIDTH_PX = 1200;

/**
 * Ceiling for a tracked web copy, in bytes.
 *
 * Not a style preference: these enter git history permanently, so a figure that
 * grows past this is one to render narrower rather than commit.
 */
const MAX_WEB_BYTES = 250 * 1024;

/** CSS pixels are 1/96 in; PDF points are 1/72 in. */
const PT_PER_CSS_PX = 0.75;

/**
 * Layout constants, in CSS pixels.
 *
 * The label row is kept tight because every pixel of it is a pixel of page height
 * the panels cannot use. The margin is not: the height a figure may occupy is a
 * multiple of its width, so widening the frame raises the ceiling by slightly more
 * than the margin itself costs. Shrinking the margin to gain room is self-defeating.
 */
const GUTTER = 16;
const MARGIN = 16;
const LABEL_HEIGHT = 26;
const LABEL_FONT_SIZE = 22;

interface PanelMetadata {
  figure: string;
  panel: string;
  name: string;
  description: string;
  route: string;
  caseId: string | null;
  language: string;
  commit: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  browser: string;
  /** Captured region, viewport-relative — what the raster panel shows. */
  clip: { x: number; y: number; width: number; height: number };
  /**
   * The same region measured from the top of the document.
   *
   * Optional only because this is parsed from JSON on disk: panels captured before
   * the field existed have none, and the vector pass says so rather than cropping
   * from the wrong offset.
   */
  documentClip?: { x: number; y: number; width: number; height: number };
  generatedAt: string;
}

interface FigureSpec {
  id: string;
  output: string;
  title: string;
  caption: string;
  /** Column counts to try; the one with the least wasted space wins. */
  columnOptions: number[];
  /**
   * Also written to docs/images/ at web resolution, for the root README.
   *
   * A curated subset: the README shows the workflow, not the whole figure set. The
   * flag lives on the spec rather than in a separate list of ids so renumbering a
   * figure cannot silently desync the two.
   */
  web?: boolean;
}

/** Journal figure geometry, used to report how large the interface text will print. */
const PRINT_WIDTH_MM = 190; // double-column width
const PAGE_HEIGHT_MM = 247; // usable height of a journal page
/** Left for the legend beneath the figure, so the artwork is not sized to the whole page. */
const LEGEND_HEIGHT_MM = 45;
const MM_PER_PT = 0.3528;

/**
 * Tallest a figure may be, as height ÷ width.
 *
 * Set by the page, not by taste: a figure taller than this cannot be reproduced
 * at full column width, so the journal scales it down to fit the height — which
 * shrinks the text further. Exceeding it is self-defeating.
 */
const MAX_ASPECT_RATIO = (PAGE_HEIGHT_MM - LEGEND_HEIGHT_MM) / PRINT_WIDTH_MM;
/** MUI body2, the size most interface text in these pages uses. */
const APP_BODY_FONT_PX = 14;

/**
 * Printed size of the application's body text once the figure is reproduced at
 * `PRINT_WIDTH_MM`.
 *
 * Text size is a consequence of how many CSS pixels of interface the figure spans
 * horizontally, not of the raster resolution — a figure can be 900 dpi and still
 * illegible. Reported on every build so a layout change that shrinks the text is
 * visible rather than discovered at proof stage.
 */
function describeLegibility(layout: Layout): {
  bodyPt: number;
  widthMm: number;
  fitsPage: boolean;
  summary: string;
} {
  const aspect = layout.height / layout.width;
  // A figure taller than the space above its legend is reproduced narrower so it
  // fits, and the text shrinks with it. Report the width it will be printed at.
  const widthMm = Math.min(PRINT_WIDTH_MM, (PAGE_HEIGHT_MM - LEGEND_HEIGHT_MM) / aspect);

  // Panels are scaled to a common column width, so any panel gives the same ratio.
  const panel = layout.panels[0];
  const scale = panel.width / panel.metadata.clip.width;
  const bodyPt = (APP_BODY_FONT_PX * scale * (widthMm / layout.width)) / MM_PER_PT;
  const dpi = (layout.width * RASTER_SCALE) / (widthMm / 25.4);

  return {
    bodyPt,
    widthMm,
    fitsPage: widthMm >= PRINT_WIDTH_MM,
    summary:
      `${bodyPt.toFixed(1)} pt body text at ${Math.round(widthMm)} mm wide, ${Math.round(dpi)} dpi` +
      (widthMm < PRINT_WIDTH_MM ? ` — scaled down from ${PRINT_WIDTH_MM} mm to fit page height` : ''),
  };
}

/**
 * Two or three panels per figure, numbered sequentially.
 *
 * Panels stack in a single column, because printed text size is set by how many
 * CSS pixels the figure spans horizontally: two full screens side by side halve the
 * text to about 5 pt, while two stacked print at the same size as one. Their heights
 * add instead, so the capture specs crop each panel to a height budget rather than
 * the whole scrollable screen. The patient summaries are the exception — captured at
 * a narrow viewport, so two columns span the width of one wide panel.
 *
 * The workflow occupies the main sequence in operational order; the languages, the
 * patient summaries and the configuration interfaces follow as supplements.
 */
const FIGURES: FigureSpec[] = [
  {
    id: 'figure-3',
    output: 'figure-3-accessioning',
    title: '**Figure 3. Structured cytology accessioning.**',
    caption:
      '**(A)** Entry of synthetic patient and referring-clinician information. **(B)** Selection of case type, specimen site, organ, and cytology preparation details. All displayed names and data are synthetic.',
    columnOptions: [1],
    web: true,
  },
  {
    id: 'figure-4',
    output: 'figure-4-processing-materials',
    title: '**Figure 4. Processing documentation and diagnostic-material tracking.**',
    caption:
      '**(A)** Clinical history, gross-processing documentation, and generated material identifiers for the synthetic cytology case. **(B)** Deterministic block and slide identifiers maintained within the material hierarchy: the two direct smears are carried on one block as smear-typed slides and the cell block carries its own section, as the application models cytology preparations. All displayed data are synthetic.',
    columnOptions: [1],
  },
  {
    id: 'figure-5',
    output: 'figure-5-ancillary-reporting-versioning',
    title: '**Figure 5. Ancillary testing, diagnostic reporting, and report-version governance.**',
    caption:
      '**(A)** An immunohistochemical study linked to its originating tissue block and tracked through an explicit workflow state. **(B)** Structured result entry and report-authorization controls for the same synthetic case. **(C)** Report history preserving the original finalized report and PDF while representing a subsequent revision as a separate draft version. All displayed names and data are synthetic.',
    columnOptions: [1],
    web: true,
  },
  {
    id: 'figure-6',
    output: 'figure-6-multilingual-interface',
    title: '**Figure 6. Multilingual pathology-reporting interfaces.**',
    caption:
      'The same synthetic case is displayed in **(A)** Arabic and **(B)** Kiswahili, demonstrating right-to-left rendering for Arabic and consistent case identifiers, report-version state, workflow controls, and structured reporting behavior across languages. Interface and structured-template translations use curated language resources. Free-text report content remains in the language the pathologist entered it in — the application translates the interface and its structured fields, not narrative text — which is why the diagnosis and comment appear in English in both panels. All displayed names and data are synthetic.',
    columnOptions: [1],
    web: true,
  },
  {
    id: 'figure-s1',
    output: 'figure-s1-patient-summaries',
    title: '**Supplementary Figure S1. Multilingual patient-facing summaries.**',
    caption:
      'The same structured cytology diagnosis is presented using deterministic, category-based explanatory content in **(A)** English and **(B)** Kiswahili. These summaries supplement but do not replace the authorized pathology report or clinician-patient communication. All displayed data are synthetic.',
    columnOptions: [2],
  },
  {
    id: 'figure-s2',
    output: 'figure-s2-template-configuration',
    title: '**Supplementary Figure S2. Structured reporting-template configuration.**',
    caption:
      'The template manager displays a selected fluid-cytology reporting template, its JSON-backed structured definition, available language resources, and a rendered preview. Template content can be maintained independently of the core workflow implementation.',
    columnOptions: [1],
  },
  {
    id: 'figure-s3',
    output: 'figure-s3-ancillary-configuration',
    title: '**Supplementary Figure S3. Ancillary-testing catalog configuration.**',
    caption:
      '**(A)** Expanded immunohistochemistry orderables within the ancillary-testing manager. **(B)** Preconfigured diagnostic panels linking named panels to their constituent immunohistochemical or molecular tests. The catalog can be modified without changing the core workflow implementation.',
    columnOptions: [1],
  },
];

function readPngSize(filePath: string): { width: number; height: number } {
  const buffer = readFileSync(filePath);
  // IHDR width/height live at fixed offsets in the PNG header.
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function toDataUri(filePath: string): string {
  return `data:image/png;base64,${readFileSync(filePath).toString('base64')}`;
}

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** Panels for a figure, ordered by their label. */
function loadPanels(figureId: string): PanelMetadata[] {
  const dir = path.join(sourceDir, figureId);
  if (!existsSync(dir)) {
    throw new Error(
      `No source panels for ${figureId}. Capture them first: GENERATE_MANUSCRIPT_FIGURES=1 pnpm figures:manuscript`
    );
  }

  const panels = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as PanelMetadata)
    .sort((left, right) => left.panel.localeCompare(right.panel));

  if (panels.length === 0) throw new Error(`No panel metadata found in ${dir}`);
  return panels;
}

// ─── Layout ─────────────────────────────────────────────────────────────────

interface PlacedPanel {
  metadata: PanelMetadata;
  x: number;
  y: number;
  width: number;
  height: number;
  labelX: number;
  labelBaselineY: number;
  /** False for single-panel figures, where the figure number is the reference. */
  showLabel: boolean;
}

interface Layout {
  panels: PlacedPanel[];
  width: number;
  height: number;
  fill: number;
}

/**
 * Distributes panels across columns, keeping them in label order and balancing
 * column heights.
 *
 * A plain row grid wastes space: row height is set by the tallest panel in the
 * row, so a short panel beside a tall one leaves a dead band underneath. Taking
 * each panel in turn and putting it in the shortest column so far fixes that.
 *
 * With panels of similar height this produces the conventional row-major
 * arrangement (A B C across, then D E F), and where heights differ it fills the
 * gaps instead of leaving an empty corner. Deterministic: ties go to the leftmost
 * column, and the input order is always the label order.
 */
function packBalanced(cellHeights: number[], columns: number): number[][] {
  const columnCount = Math.min(columns, cellHeights.length);
  const runs: number[][] = Array.from({ length: columnCount }, () => []);
  const heights = new Array<number>(columnCount).fill(0);

  cellHeights.forEach((height, index) => {
    let target = 0;
    for (let column = 1; column < columnCount; column += 1) {
      if (heights[column] < heights[target]) target = column;
    }
    runs[target].push(index);
    heights[target] += height + (runs[target].length > 1 ? GUTTER : 0);
  });

  return runs;
}

/**
 * Splits panels into contiguous runs, one per column, choosing the split that
 * minimises the tallest column. Sometimes beats balanced packing — with a few
 * very unequal panels, keeping them in contiguous blocks can waste less — so both
 * are tried and the tighter result wins.
 */
function packContiguous(cellHeights: number[], columns: number): number[][] {
  const total = cellHeights.length;
  const columnCount = Math.min(columns, total);
  let best: { runs: number[][]; tallest: number } | null = null;

  const walk = (start: number, remaining: number, runs: number[][]): void => {
    if (remaining === 1) {
      const candidate = [...runs, Array.from({ length: total - start }, (_, i) => start + i)];
      const tallest = Math.max(
        ...candidate.map(
          (run) => run.reduce((sum, index) => sum + cellHeights[index], 0) + GUTTER * (run.length - 1)
        )
      );
      if (!best || tallest < best.tallest) best = { runs: candidate, tallest };
      return;
    }
    for (let end = start + 1; end <= total - (remaining - 1); end += 1) {
      walk(end, remaining - 1, [...runs, Array.from({ length: end - start }, (_, i) => start + i)]);
    }
  };

  walk(0, columnCount, []);
  return best?.runs ?? [cellHeights.map((_, index) => index)];
}

const PACKERS = [packBalanced, packContiguous];

/**
 * Lays the panels out at a given column count.
 *
 * Column width is the narrowest panel, so wider panels scale down proportionally
 * and none is enlarged past its captured resolution.
 */
function layoutWithColumns(
  figure: FigureSpec,
  panels: PanelMetadata[],
  columns: number,
  pack: (heights: number[], columns: number) => number[][]
): Layout {
  const rasterSizes = panels.map((panel) =>
    readPngSize(path.join(sourceDir, figure.id, `${panel.name}.png`))
  );
  const columnWidth = Math.min(...rasterSizes.map((size) => size.width)) / RASTER_SCALE;

  // A figure with a single panel needs no panel letter — the figure number is the
  // reference — so it also needs no room above the artwork for one.
  const labelHeight = panels.length > 1 ? LABEL_HEIGHT : 0;

  const displayHeights = rasterSizes.map((size) => (size.height / size.width) * columnWidth);
  const cellHeights = displayHeights.map((height) => height + labelHeight);
  const runs = pack(cellHeights, columns);

  const placed: PlacedPanel[] = [];
  runs.forEach((run, columnIndex) => {
    let cursorY = MARGIN;
    const x = MARGIN + columnIndex * (columnWidth + GUTTER);
    for (const index of run) {
      placed.push({
        metadata: panels[index],
        x,
        y: cursorY + labelHeight,
        width: columnWidth,
        height: displayHeights[index],
        labelX: x,
        labelBaselineY: cursorY + LABEL_FONT_SIZE,
        showLabel: labelHeight > 0,
      });
      cursorY += cellHeights[index] + GUTTER;
    }
  });

  const width = MARGIN * 2 + columnWidth * runs.length + GUTTER * (runs.length - 1);
  const height =
    MARGIN * 2 +
    Math.max(
      ...runs.map(
        (run) => run.reduce((sum, index) => sum + cellHeights[index], 0) + GUTTER * (run.length - 1)
      )
    );
  const panelArea = placed.reduce((sum, panel) => sum + panel.width * panel.height, 0);

  return { panels: placed, width, height, fill: panelArea / (width * height) };
}

/**
 * Picks the column count that wastes the least space, among those that stay wide
 * enough for a journal and not so tall that the journal shrinks the figure.
 *
 * Panel heights differ a lot — a report-history table is a fraction of the height
 * of an order-entry form — so the best column count is not the same for every
 * figure. Six workflow panels want two columns; three configuration panels pack
 * better in one.
 */
function computeLayout(figure: FigureSpec, panels: PanelMetadata[]): Layout {
  const candidates = figure.columnOptions
    .flatMap((columns) => PACKERS.map((pack) => layoutWithColumns(figure, panels, columns, pack)))
    .filter(
      (layout) =>
        (layout.width * RASTER_SCALE) / (PRINT_WIDTH_MM / 25.4) >= MIN_DPI &&
        layout.height / layout.width <= MAX_ASPECT_RATIO
    )
    .sort((left, right) => right.fill - left.fill);

  if (candidates.length > 0) return candidates[0];

  // Nothing satisfied both constraints; fall back to the widest option so the
  // figure is at least usable, and let the width check downstream report it.
  return layoutWithColumns(figure, panels, Math.max(...figure.columnOptions), packBalanced);
}

// ─── Raster composition ─────────────────────────────────────────────────────

function buildHtml(figure: FigureSpec, layout: Layout): string {
  const cells = layout.panels
    .map((panel) => {
      const file = path.join(sourceDir, figure.id, `${panel.metadata.name}.png`);
      return `
    ${panel.showLabel ? `<div class="label" style="left:${panel.labelX}px;top:${panel.labelBaselineY - LABEL_FONT_SIZE}px">${panel.metadata.panel}</div>` : ''}
    <img class="panel" src="${toDataUri(file)}"
         style="left:${panel.x}px;top:${panel.y}px;width:${panel.width}px;height:${panel.height}px"
         alt="${panel.metadata.description.replace(/"/g, '&quot;')}">`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #ffffff;
      width: ${layout.width}px;
      height: ${layout.height}px;
      position: relative;
      font-family: Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif;
    }
    /* A hairline separates adjacent white panels without decorating them. */
    .panel { position: absolute; display: block; border: 0.5px solid #d0d7de; }
    .label {
      position: absolute;
      font-size: ${LABEL_FONT_SIZE}px;
      font-weight: 700;
      line-height: ${LABEL_HEIGHT}px;
      color: #111111;
    }
  </style>
</head>
<body>
${cells}
</body>
</html>`;
}

// ─── Vector composition ─────────────────────────────────────────────────────

/**
 * Assembles the vector figure by embedding each panel's PDF page, cropped to the
 * region the raster panel used. Cropping through an embed bounding box is a
 * coordinate change rather than a re-render, so vector content survives intact.
 *
 * The crop is taken from `documentClip`, not `clip`: a panel PDF is the whole
 * document printed as one tall page, so the region has to be measured from the
 * document's top, whereas `clip` is measured from the top of the viewport. They
 * agree only for an unscrolled page.
 */
async function composeVector(figure: FigureSpec, layout: Layout, outputPath: string): Promise<void> {
  const requireFromBackend = createRequire(path.join(repoRoot, 'apps', 'backend', 'package.json'));
  const { PDFDocument, StandardFonts, rgb } = requireFromBackend(
    'pdf-lib'
  ) as typeof import('pdf-lib');

  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  const page = document.addPage([layout.width * PT_PER_CSS_PX, layout.height * PT_PER_CSS_PX]);
  const pageHeightPt = page.getHeight();

  for (const panel of layout.panels) {
    const vectorPath = path.join(sourceDir, figure.id, `${panel.metadata.name}.pdf`);
    if (!existsSync(vectorPath)) throw new Error(`Missing vector panel: ${vectorPath}`);

    const source = await PDFDocument.load(readFileSync(vectorPath));
    const [sourcePage] = source.getPages();
    const sourceHeightPt = sourcePage.getHeight();
    const clip = panel.metadata.documentClip;
    if (!clip) {
      throw new Error(
        `${panel.metadata.name} carries no documentClip, so its vector crop cannot be placed. ` +
          `Re-capture the panels: GENERATE_MANUSCRIPT_FIGURES=1 pnpm figures:manuscript`
      );
    }

    const embedded = await document.embedPage(sourcePage, {
      left: clip.x * PT_PER_CSS_PX,
      right: (clip.x + clip.width) * PT_PER_CSS_PX,
      // PDF y runs up from the bottom; the recorded clip runs down from the top.
      top: sourceHeightPt - clip.y * PT_PER_CSS_PX,
      bottom: sourceHeightPt - (clip.y + clip.height) * PT_PER_CSS_PX,
    });

    page.drawPage(embedded, {
      x: panel.x * PT_PER_CSS_PX,
      y: pageHeightPt - (panel.y + panel.height) * PT_PER_CSS_PX,
      width: panel.width * PT_PER_CSS_PX,
      height: panel.height * PT_PER_CSS_PX,
    });

    if (!panel.showLabel) continue;

    page.drawText(panel.metadata.panel, {
      x: panel.labelX * PT_PER_CSS_PX,
      y: pageHeightPt - panel.labelBaselineY * PT_PER_CSS_PX,
      size: LABEL_FONT_SIZE * PT_PER_CSS_PX,
      font,
      color: rgb(0.07, 0.07, 0.07),
    });
  }

  writeFileSync(outputPath, await document.save());
}

// ─── Entry point ────────────────────────────────────────────────────────────

interface ComposedOutput {
  figure: FigureSpec;
  panels: PanelMetadata[];
  rasterFile: string;
  vectorFile: string;
  /** Set only for the figures the root README embeds. */
  webFile?: string;
  webWidth?: number;
  webHeight?: number;
  width: number;
  height: number;
  fill: number;
}

async function build(): Promise<void> {
  mkdirSync(compositesDir, { recursive: true });
  mkdirSync(captionsDir, { recursive: true });
  mkdirSync(webDir, { recursive: true });

  // Resolved from the frontend package, which owns @playwright/test, so the
  // raster composition renders in the browser used for capture without adding a
  // root-level dependency.
  const requireFromFrontend = createRequire(path.join(repoRoot, 'apps', 'frontend', 'package.json'));
  const { chromium } = requireFromFrontend('@playwright/test') as typeof import('@playwright/test');
  const browser = await chromium.launch();
  const outputs: ComposedOutput[] = [];

  try {
    for (const figure of FIGURES) {
      const panels = loadPanels(figure.id);
      const layout = computeLayout(figure, panels);

      const viewport = { width: Math.ceil(layout.width), height: Math.ceil(layout.height) };
      // Built once and reused by the web pass below: buildHtml base64-encodes every
      // source panel, and the two passes differ only in pixel density.
      const html = buildHtml(figure, layout);

      const rasterFile = path.join(compositesDir, `${figure.output}.png`);
      const page = await browser.newPage({ viewport, deviceScaleFactor: RASTER_SCALE });
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: rasterFile });
      await page.close();

      const size = readPngSize(rasterFile);
      const dpi = size.width / (PRINT_WIDTH_MM / 25.4);
      if (dpi < MIN_DPI) {
        throw new Error(
          `${figure.output}.png reproduces at ${Math.round(dpi)} dpi at ${PRINT_WIDTH_MM} mm; combination art needs at least ${MIN_DPI}.`
        );
      }

      // Web copy: same layout and same markup, lower pixel density. Rendered rather
      // than downsampled from the composite above, so Chromium resamples the 4x
      // source panels once instead of resampling an already-resampled image. The
      // MIN_DPI floor deliberately does not apply — it governs print reproduction,
      // which is not what this copy is for.
      let webFile: string | undefined;
      let webSize: { width: number; height: number } | undefined;
      if (figure.web) {
        webFile = path.join(webDir, `${figure.output}.png`);
        const webPage = await browser.newPage({
          viewport,
          // Fixed at page creation, so the web copy needs a page of its own.
          deviceScaleFactor: WEB_WIDTH_PX / viewport.width,
        });
        await webPage.setContent(html, { waitUntil: 'load' });
        await webPage.evaluate(() => document.fonts.ready);
        await webPage.screenshot({ path: webFile });
        await webPage.close();

        webSize = readPngSize(webFile);
        const bytes = statSync(webFile).size;
        if (bytes > MAX_WEB_BYTES) {
          throw new Error(
            `docs/images/${figure.output}.png is ${Math.round(bytes / 1024)} KB, over the ` +
              `${MAX_WEB_BYTES / 1024} KB ceiling for a tracked file. Lower WEB_WIDTH_PX.`
          );
        }
      }

      const vectorFile = path.join(compositesDir, `${figure.output}.pdf`);
      await composeVector(figure, layout, vectorFile);

      outputs.push({
        figure,
        panels,
        rasterFile,
        vectorFile,
        webFile,
        webWidth: webSize?.width,
        webHeight: webSize?.height,
        width: size.width,
        height: size.height,
        fill: layout.fill,
      });

      const legibility = describeLegibility(layout);
      console.log(
        `${figure.output}: ${panels.length} panels, ${size.width} x ${size.height} png + vector pdf` +
          `${webSize ? ` + ${webSize.width} x ${webSize.height} web png` : ''} ` +
          `(panel fill ${(layout.fill * 100).toFixed(1)}%, ${legibility.summary})`
      );

      // A figure that cannot be reproduced at full column width would be scaled
      // down by the journal, so it must fit the page as laid out.
      if (!legibility.fitsPage) {
        throw new Error(
          `${figure.output} is ${(layout.height / layout.width).toFixed(2)}:1, taller than a ` +
            `${PRINT_WIDTH_MM} x ${PAGE_HEIGHT_MM} mm page allows (max ${MAX_ASPECT_RATIO.toFixed(2)}:1). ` +
            `Use more columns, or move panels to a second figure.`
        );
      }
    }
  } finally {
    await browser.close();
  }

  writeCaptions(outputs);
  writeReadme(outputs);
  if (outputs.some((output) => output.webFile)) writeWebReadme(outputs);
}

function writeCaptions(outputs: ComposedOutput[]): void {
  const lines = [
    '# Figure captions',
    '',
    'Generated by `pnpm figures:compose` — do not edit by hand.',
    '',
    'Captions distinguish implemented from unvalidated features and make no claim',
    'about diagnostic accuracy or clinical effectiveness. Panel labels run in reading',
    'order: down a single column, or left to right where a figure has two.',
    '',
  ];

  for (const { figure } of outputs) {
    lines.push(`## ${figure.output}`, '', `> ${figure.title} ${figure.caption}`, '');
  }

  writeFileSync(path.join(captionsDir, 'captions.md'), lines.join('\n'), 'utf8');
}

function readCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown (not a git checkout)';
  }
}

/** "Figure 5" or "Supplementary Figure S2", taken from the caption title. */
function shortLabel(figure: FigureSpec): string {
  return /\*\*((?:Supplementary )?Figure S?\d+)\./.exec(figure.title)?.[1] ?? figure.output;
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function writeReadme(outputs: ComposedOutput[]): void {
  const first = outputs[0]?.panels[0];
  const caseId = outputs
    .flatMap((output) => output.panels)
    .map((panel) => panel.caseId)
    .find((value): value is string => Boolean(value));
  const viewports = [
    ...new Set(
      outputs
        .flatMap((output) => output.panels)
        .map((panel) => `${panel.viewport.width} x ${panel.viewport.height}`)
    ),
  ];

  // Derived rather than written out, so renumbering the figures cannot leave the
  // prose pointing at the wrong ones.
  const caselessFigures = formatList(
    outputs
      .filter((output) => !output.panels.some((panel) => panel.caseId))
      .map((output) => shortLabel(output.figure))
  );
  const catalogueFigure = outputs.find((output) =>
    output.figure.output.includes('ancillary-catalogue')
  );
  const multiPanel = outputs.some((output) => output.panels.length > 1);

  const lines = [
    '# Manuscript figures',
    '',
    'Generated by `pnpm figures:compose` — do not edit by hand.',
    '',
    '## Reproduce',
    '',
    'Bring up a clean stack, then capture and compose. Bash:',
    '',
    '```bash',
    'docker compose down -v && docker compose up -d postgres',
    'pnpm db:migrate:deploy && pnpm db:seed',
    'pnpm --filter @lis/backend build && node apps/backend/dist/server.js &',
    'VITE_PASSWORD_AUTH=true pnpm --filter @lis/frontend build',
    'pnpm --filter @lis/frontend exec vite preview --host 127.0.0.1 --port 5173 --strictPort &',
    '',
    'GENERATE_MANUSCRIPT_FIGURES=1 pnpm figures:manuscript',
    'pnpm figures:compose',
    '```',
    '',
    'PowerShell:',
    '',
    '```powershell',
    'docker compose down -v; docker compose up -d postgres',
    'pnpm db:migrate:deploy; pnpm db:seed',
    'pnpm --filter @lis/backend build',
    'Start-Process node -ArgumentList "apps/backend/dist/server.js"',
    '$env:VITE_PASSWORD_AUTH = "true"; pnpm --filter @lis/frontend build',
    'Start-Process pnpm -ArgumentList "--filter","@lis/frontend","exec","vite","preview","--host","127.0.0.1","--port","5173","--strictPort"',
    '',
    '$env:GENERATE_MANUSCRIPT_FIGURES = "1"; pnpm figures:manuscript',
    'pnpm figures:compose',
    '```',
    '',
    '## Layout',
    '',
    '```text',
    'docs/manuscript/figures/',
    '├── source/        per-panel PNG, vector PDF and metadata JSON',
    '├── composites/    composed figures, PNG and vector PDF',
    '├── captions/      final captions',
    '└── README.md      this file',
    '',
    'docs/images/       web-sized copies of the figures the root README embeds —',
    '                   tracked, because this directory is not',
    '```',
    '',
    '## Synthetic case',
    '',
    `Every figure follows one synthetic case: **${caseId ?? 'see source metadata'}**. It is`,
    'created through the API by',
    '`apps/frontend/src/tests/e2e/manuscript/helpers/figure-case.ts`, which is',
    'idempotent — re-running the capture reuses the case rather than creating another.',
    '',
    `The exceptions are ${caselessFigures}, which show configuration screens that hold`,
    'no case at all. The accessioning panel is a partial exception: it re-enters the',
    'same synthetic patient on the empty order form, before the case exists.',
    '',
    'The seeded corpus cannot supply it. No seeded case carries an immunohistochemistry',
    'order (the seed only creates the routine per-block H&E), and none combines multiple',
    'specimens, an ancillary order, a signed-out report, an amendment and a resolvable',
    'patient summary at once. The case is a cytology case because patient-facing',
    'summaries resolve from the structured cytology templates.',
    '',
    'Two side effects of generating figures against a database, both harmless but worth',
    'knowing: the figure case is an extra case on top of the seeded corpus, so',
    '`pnpm db:characterize` run afterwards reports one more than the published count;',
    'and the capture sets the demo pathologist\'s stored interface language, because the',
    'application persists that preference per user. Re-seed to restore both.',
    '',
    '## Translation method',
    '',
    'Every language shown is a curated, deterministic resource. Interface strings come',
    'from static translation dictionaries; patient-summary text comes from rule-based',
    'summary definitions keyed to the structured diagnostic category. No output shown in',
    'these figures is model-generated, so no experimental-translation notice applies.',
    '',
    '## The two H&E entries',
    '',
    `The ancillary catalogue — shown in ${catalogueFigure ? shortLabel(catalogueFigure.figure) : 'the configuration figure'} — holds both an "H&E" and an`,
    '"H&E Levels" category. These are distinct, not duplicates:',
    '',
    '- **H&E** holds `H&E Staining`, the routine diagnostic slide created automatically',
    '  for every block. It is system-managed and is not user-orderable, so it is',
    '  omitted from the category selector when a test is added.',
    '- **H&E Levels** holds `H&E Levels`, additional deeper levels ordered as an',
    '  ancillary test.',
    '',
    'The figure panel expands the immunohistochemistry category, which is where the',
    'configurable content is; the remaining categories, "H&E" among them, continue',
    'below the panel.',
    '',
    '## Formats',
    '',
    'Each figure is written as PNG for journal upload and as vector PDF for editing.',
    "Chromium's print-to-PDF keeps text as text with embedded fonts and CSS boxes as",
    'paths. CSS box shadows are the one construct it rasterises, so they are replaced',
    'with a hairline border during the vector pass; the panel PDFs contain no raster',
    'images. Right-to-left text renders correctly but is stored as shaped glyphs, so',
    're-typing Arabic in a vector editor may break that shaping.',
    '',
    '## Provenance',
    '',
    `- Commit: \`${readCommit()}\``,
    `- Generated: ${new Date().toISOString()}`,
    // Every viewport used, not just the first panel's: the patient summaries are
    // captured narrow on purpose, and a provenance line naming one size would say
    // the figures were produced at a width two of them were not.
    `- Viewport: ${formatList(viewports)}`,
    `- Device scale factor: ${first?.deviceScaleFactor ?? 2}`,
    `- Browser: ${first?.browser ?? 'unknown'}`,
    '- Synthetic data seed: 42',
    '',
    '## Panels',
    '',
    // The panel column is dead weight while every figure holds a single screen,
    // but the composer still supports grouping, so it comes back if one does.
    multiPanel
      ? '| Figure | Panel | Route | Case | Language | Description |'
      : '| Figure | Route | Case | Language | Description |',
    multiPanel ? '| --- | --- | --- | --- | --- | --- |' : '| --- | --- | --- | --- | --- |',
  ];

  for (const output of outputs) {
    for (const panel of output.panels) {
      lines.push(
        `| ${output.figure.output} | ${multiPanel ? `${panel.panel} | ` : ''}\`${panel.route}\` | ` +
          `${panel.caseId ?? '—'} | ${panel.language} | ${panel.description} |`
      );
    }
  }

  lines.push(
    '',
    '## Checksums',
    '',
    '| File | SHA-256 |',
    '| --- | --- |'
  );
  for (const output of outputs) {
    lines.push(`| composites/${output.figure.output}.png | \`${sha256(output.rasterFile)}\` |`);
    lines.push(`| composites/${output.figure.output}.pdf | \`${sha256(output.vectorFile)}\` |`);
  }
  // Path-labelled from the repository root, so they read as what they are: files
  // outside this directory, written by the same run.
  for (const output of outputs) {
    if (output.webFile) {
      lines.push(`| docs/images/${output.figure.output}.png | \`${sha256(output.webFile)}\` |`);
    }
  }

  lines.push(
    '',
    '## Data statement',
    '',
    'Every value visible in these figures is synthetic, originating either from',
    '`prisma/seed.ts` or from the API-created figure case. No clinical or',
    'patient-identifiable data, institutional credentials, hostnames, tokens or file',
    'paths appear in any panel.',
    '',
    'That includes the names. The patient, the referring clinician and the reporting',
    'pathologist are deterministic synthetic records created by the seed and the',
    'figure fixture; the accession, patient identifier, dates of birth and',
    'registration dates are generated by the application from that synthetic input.',
    'They are plausible-looking on purpose — placeholder strings would read as an',
    'unfinished figure — but no one of that name is being depicted, and none of the',
    'values traces to a real record.',
    ''
  );

  writeFileSync(path.join(figuresDir, 'README.md'), lines.join('\n'), 'utf8');
}

/**
 * Manifest for the tracked web copies.
 *
 * The checksum table in the figures README covers these too, but that file sits
 * inside the ignored tree and so is invisible to anyone reading the repository on
 * GitHub. This manifest is what shows a reader that the PNGs beside it were
 * generated from the manuscript figures rather than dropped in by hand.
 */
function writeWebReadme(outputs: ComposedOutput[]): void {
  const web = outputs.filter(
    (output): output is ComposedOutput & { webFile: string } => Boolean(output.webFile)
  );
  const first = web[0]?.panels[0];

  const lines = [
    '# Figures for the README',
    '',
    'Generated by `pnpm figures:compose` — do not edit by hand.',
    '',
    `- Commit: \`${readCommit()}\``,
    `- Generated: ${new Date().toISOString()}`,
    `- Browser: ${first?.browser ?? 'unknown'}`,
    '',
    'Web-sized copies of the manuscript figures, rendered from the same layout in the',
    'same run as the journal-resolution originals. The journal PNG and the vector PDF',
    'are written to `docs/manuscript/figures/`, which is not tracked; these are, because',
    'the root README embeds them. Captions, panel provenance and the full figure set',
    'live with the originals — rebuild them with the commands in that README.',
    '',
    '| File | Figure | Pixels | Size | SHA-256 |',
    '| --- | --- | ---: | ---: | --- |',
  ];

  for (const output of web) {
    const bytes = statSync(output.webFile).size;
    lines.push(
      `| ${output.figure.output}.png | ${shortLabel(output.figure)} | ` +
        `${output.webWidth} x ${output.webHeight} | ${Math.round(bytes / 1024)} KB | ` +
        `\`${sha256(output.webFile)}\` |`
    );
  }

  lines.push(
    '',
    'Every value visible in these figures is synthetic, originating either from',
    '`prisma/seed.ts` or from the API-created figure case. No clinical or',
    'patient-identifiable data appears in any panel.',
    ''
  );

  writeFileSync(path.join(webDir, 'README.md'), lines.join('\n'), 'utf8');
}

build().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
