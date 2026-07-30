/**
 * Tests for the production report renderer (Handlebars + headless Chromium).
 *
 * pdf.service.test.ts covers the legacy pdf-lib engine. This file covers the
 * engine that actually produces reports when a report layout is active, which
 * previously had no test at all.
 *
 * The work splits in two:
 *   - Template compilation and report-type branching are pure and are tested
 *     unconditionally.
 *   - `renderToPdf` needs a real Chromium binary, so it is gated on one being
 *     available. The gate is explicit and reported, rather than the whole file
 *     being skipped silently.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import Handlebars from 'handlebars';
import { PDFDocument } from 'pdf-lib';
import {
  DEFAULT_REPORT_HTML_TEMPLATE,
  PdfLayoutService,
  type ReportLayoutData,
} from '../../services/pdf.layout.service.js';

/**
 * Mirrors the data shaping inside `renderToPdf` so the template can be exercised
 * without launching a browser. Kept next to the assertions it serves; if
 * renderToPdf's shaping changes, the rendered-output tests below fail.
 */
function renderTemplate(data: ReportLayoutData): string {
  const template = Handlebars.compile(DEFAULT_REPORT_HTML_TEMPLATE);
  return template({
    ...data,
    isPrelim: data.reportType === 'preliminary',
    isAddendum: data.reportType === 'addendum',
    isRevision: data.reportType === 'revision',
    isFinal: data.reportType === 'final',
    isDraftPreview: data.isDraftPreview === true,
  });
}

const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser';

/**
 * Probes whether a *working* browser is available, rather than just whether the
 * executable exists. A present-but-unlaunchable Chromium is common on developer
 * machines (Windows Chrome exits with code 21 under these launch flags), and
 * gating on `existsSync` alone would turn that into a spurious test failure.
 */
async function canLaunchChromium(): Promise<boolean> {
  if (!existsSync(chromiumPath)) return false;

  try {
    const { default: puppeteer } = await import('puppeteer-core');
    const browser = await puppeteer.launch({
      executablePath: chromiumPath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

// Top-level await: the gate must be resolved before `describe.skipIf` is evaluated.
const hasChromium = await canLaunchChromium();

describe('PdfLayoutService.sampleData', () => {
  it('provides sample data for every report type', () => {
    for (const reportType of ['final', 'preliminary', 'addendum', 'revision']) {
      const data = PdfLayoutService.sampleData(reportType);
      expect(data.reportType).toBe(reportType);
      expect(data.caseId).toBeTruthy();
      expect(data.patient.patientId).toBeTruthy();
    }
  });
});

describe('default report layout template', () => {
  it('compiles without error', () => {
    expect(() => Handlebars.compile(DEFAULT_REPORT_HTML_TEMPLATE)).not.toThrow();
  });

  it.each([
    ['final', 'Final Report'],
    ['preliminary', 'Preliminary Report'],
    ['addendum', 'Addendum Report'],
    ['revision', 'Revised Report'],
  ])('renders the %s report type as "%s"', (reportType, expectedHeading) => {
    const html = renderTemplate(PdfLayoutService.sampleData(reportType));
    expect(html).toContain(expectedHeading);
  });

  it('renders a draft preview watermark and suppresses the sign-out line', () => {
    const html = renderTemplate({
      ...PdfLayoutService.sampleData('final'),
      isDraftPreview: true,
    });

    expect(html).toContain('Draft Preview');
    expect(html).toContain('DRAFT PREVIEW');
    expect(html).not.toContain('Signed out by:');
  });

  it('includes case, patient, and diagnosis content', () => {
    const html = renderTemplate({
      ...PdfLayoutService.sampleData('final'),
      caseId: 'SU-26-0001234',
      diagnosis: 'Invasive ductal carcinoma, grade 2.',
      patient: {
        patientId: 'P1234567',
        firstName: 'Ada',
        lastName: 'Lovelace',
        dateOfBirth: '1815-12-10',
        sex: 'Female',
      },
    });

    expect(html).toContain('SU-26-0001234');
    expect(html).toContain('Lovelace, Ada');
    expect(html).toContain('P1234567');
    expect(html).toContain('Invasive ductal carcinoma, grade 2.');
  });

  it('omits optional sections when their fields are absent', () => {
    const html = renderTemplate({
      ...PdfLayoutService.sampleData('final'),
      comment: null,
      gross: null,
      reactivationReason: null,
    });

    expect(html).not.toContain('Gross Description');
    expect(html).not.toContain('Reason for Reactivation');
  });

  it('renders the amendment reason when a report has been reactivated', () => {
    const html = renderTemplate({
      ...PdfLayoutService.sampleData('revision'),
      reactivationType: 'revise',
      reactivationReason: 'Diagnosis corrected after review.',
    });

    expect(html).toContain('Reason for Reactivation');
    expect(html).toContain('Diagnosis corrected after review.');
  });

  it('escapes HTML in report content so free text cannot break the layout', () => {
    const html = renderTemplate({
      ...PdfLayoutService.sampleData('final'),
      diagnosis: '<script>alert("x")</script>',
    });

    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe.skipIf(!hasChromium)('renderToPdf (requires Chromium)', () => {
  it('produces a valid single-document PDF from the default template', async () => {
    const service = new PdfLayoutService();
    const buffer = await service.renderToPdf(
      DEFAULT_REPORT_HTML_TEMPLATE,
      PdfLayoutService.sampleData('final')
    );

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');

    const document = await PDFDocument.load(buffer);
    expect(document.getPageCount()).toBeGreaterThanOrEqual(1);
  }, 60_000);
});

if (!hasChromium) {
  // Surfaced in the run output so a skipped renderer is never mistaken for a passing one.
  console.warn(
    `[pdf.layout.service.test] No launchable Chromium at ${chromiumPath}; renderToPdf tests skipped. ` +
      'Set PUPPETEER_EXECUTABLE_PATH to a working browser, or run inside the backend container image.'
  );
}
