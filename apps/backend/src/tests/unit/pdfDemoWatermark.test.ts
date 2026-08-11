/**
 * Demo-watermark tests for both PDF generators.
 *
 * `pdf.service.test.ts` documents why `pdf-parse` text extraction is only
 * best-effort against pdf-lib output, and a watermark assertion that silently
 * soft-skips would be worthless — it would pass just as happily if the
 * watermark were never drawn. So this reads the page content streams directly:
 * pdf-lib flate-compresses them, so inflating and looking for the `Tj` operand
 * is a hard check on what was actually written into the file.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { PDFDocument, PDFRawStream } from 'pdf-lib';
import { withDemoWatermark } from '../../services/pdf.layout.service.js';

let tmpDir: string;
let prevStoragePath: string | undefined;
let prevNodeEnv: string | undefined;
let prevDemoMode: string | undefined;
type PdfServiceCtor = (typeof import('../../services/pdf.service.js'))['PdfService'];
let PdfService: PdfServiceCtor;

const ORDER = {
  orderId: 'SU26000001',
  registeredDate: new Date('2026-01-02T00:00:00.000Z'),
  clinicalHistory: 'Synthetic history',
  caseType: 'Surgical Pathology',
  patient: {
    patientId: 'DEMO1234567',
    firstName: 'Alpha-01',
    lastName: 'ZZZTEST-PATIENT',
    dateOfBirth: new Date('1980-01-01T00:00:00.000Z'),
    sex: 'Female',
  },
  doctor: { firstName: 'Dr. Alpha', lastName: 'ZZZTEST-REFERRER' },
  specimens: [
    {
      specimenId: 'S1',
      specimenCode: 'A',
      bodySite: { bodySiteName: 'Skin' },
      specimenType: { specimenTypeName: 'Biopsy' },
    },
  ],
};

beforeAll(async () => {
  prevStoragePath = process.env.STORAGE_PATH;
  prevNodeEnv = process.env.NODE_ENV;
  prevDemoMode = process.env.DEMO_MODE;

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lis-demo-pdf-'));
  process.env.STORAGE_PATH = tmpDir;
  fs.mkdirSync(path.join(tmpDir, 'generated-pdfs'), { recursive: true });

  PdfService = (await import('../../services/pdf.service.js')).PdfService;
});

afterAll(() => {
  const restore = (key: string, value: string | undefined): void => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore('STORAGE_PATH', prevStoragePath);
  restore('NODE_ENV', prevNodeEnv);
  restore('DEMO_MODE', prevDemoMode);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

/**
 * Inflate every content stream and return its text.
 *
 * pdf-lib writes show-text operands as hex strings (`<44454D4F…> Tj`), not
 * literals, so the hex runs are decoded and appended — without that, searching
 * for a phrase finds nothing even when it is plainly in the document.
 */
function contentStreamText(doc: PDFDocument): string {
  let out = '';
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const raw = Buffer.from(obj.asUint8Array());
    let decoded: string;
    try {
      decoded = zlib.inflateSync(raw).toString('latin1');
    } catch {
      decoded = raw.toString('latin1'); // uncompressed stream
    }
    out += decoded;
    for (const [, hex] of decoded.matchAll(/<([0-9A-Fa-f]{2,})>/g)) {
      out += Buffer.from(hex, 'hex').toString('latin1');
    }
  }
  return out;
}

async function worksheetText(): Promise<string> {
  const service = new PdfService();
  const { storagePath } = await service.generateWorksheetPdf(ORDER);
  const doc = await PDFDocument.load(fs.readFileSync(storagePath));
  expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  return contentStreamText(doc);
}

describe('pdf-lib generators', () => {
  it('stamps generated PDFs when demo mode is on', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DEMO_MODE;
    expect(await worksheetText()).toContain('DEMO DATA');
  });

  it('leaves production output unmarked', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DEMO_MODE;
    expect(await worksheetText()).not.toContain('DEMO DATA');
  });

  it('stamps a production-mode instance that opts in via DEMO_MODE', async () => {
    // A training or demonstration deployment running under NODE_ENV=production.
    process.env.NODE_ENV = 'production';
    process.env.DEMO_MODE = 'true';
    expect(await worksheetText()).toContain('DEMO DATA');
  });
});

describe('withDemoWatermark (HTML report path)', () => {
  it('injects the overlay before the closing body tag', () => {
    const html = withDemoWatermark('<html><body><p>Report</p></body></html>');
    expect(html).toContain('DEMO DATA');
    expect(html.indexOf('lis-demo-overlay')).toBeLessThan(html.indexOf('</body>'));
  });

  it('still stamps markup with no closing body tag', () => {
    // Report layouts are user-editable, so the input is not guaranteed to be
    // well-formed — the watermark must not be silently dropped.
    expect(withDemoWatermark('<div>Report</div>')).toContain('DEMO DATA');
  });

  it('is applied to rendered output, so a customized layout cannot omit it', () => {
    // The marking deliberately does not live in DEFAULT_REPORT_HTML_TEMPLATE:
    // a layout edited through the report-layout admin has no way to remove it.
    const customLayout = '<html><body>{{diagnosis}}</body></html>';
    expect(withDemoWatermark(customLayout)).toContain('DEMO DATA');
  });
});
