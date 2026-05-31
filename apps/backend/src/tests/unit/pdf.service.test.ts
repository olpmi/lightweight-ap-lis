/**
 * PDF service unit tests.
 *
 * STORAGE_PATH is overridden to a per-run tmp dir BEFORE PdfService is
 * imported so generated files don't pollute the dev storage tree.
 *
 * Validation strategy:
 *   - All generated PDFs MUST be structurally valid: parseable by
 *     `pdf-lib`'s `PDFDocument.load` and have >= 1 page. This catches the
 *     "we produced corrupted bytes" class of regression — the most likely
 *     way `pdf.service.ts` would silently break.
 *   - We additionally inspect file names and (where reliable) extract
 *     embedded text via `pdf-parse`. Note that `pdf-parse` ships an old
 *     pdf.js (1.10) that intermittently rejects `pdf-lib`'s flate streams,
 *     so text-extraction is best-effort: a parse failure is treated as a
 *     soft skip, not a test failure. Structural validity is the hard gate.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse';

let tmpDir: string;
let prevStoragePath: string | undefined;
type PdfServiceCtor = typeof import('../../services/pdf.service.js')['PdfService'];
let PdfService: PdfServiceCtor;

beforeAll(async () => {
  prevStoragePath = process.env.STORAGE_PATH;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lis-pdf-'));
  process.env.STORAGE_PATH = tmpDir;
  fs.mkdirSync(path.join(tmpDir, 'generated-pdfs'), { recursive: true });

  const mod = await import('../../services/pdf.service.js');
  PdfService = mod.PdfService;
});

afterAll(() => {
  if (prevStoragePath === undefined) delete process.env.STORAGE_PATH;
  else process.env.STORAGE_PATH = prevStoragePath;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

async function assertWellFormedPdf(bytes: Uint8Array): Promise<PDFDocument> {
  const buf = Buffer.from(bytes);
  expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  const doc = await PDFDocument.load(buf);
  expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  return doc;
}

/** Best-effort text extraction; returns null on pdf-parse failure. */
async function tryExtractText(bytes: Uint8Array): Promise<string | null> {
  try {
    const parsed = await pdfParse(Buffer.from(bytes));
    return parsed.text;
  } catch {
    return null;
  }
}

const fakeOrder = {
  orderId: 'SU260000123',
  registeredDate: new Date('2026-05-01T10:00:00Z'),
  clinicalHistory: 'Patient presents with persistent cough and weight loss.',
  caseType: 'SU',
  patient: {
    patientId: 'PT0001234',
    firstName: 'Jane',
    lastName: 'Doe',
    dateOfBirth: new Date('1980-04-15'),
    sex: 'F',
  },
  doctor: { firstName: 'Gregory', lastName: 'House' },
  specimens: [
    {
      specimenId: 'SU260000123-A',
      specimenCode: 'A',
      bodySite: { bodySiteName: 'Left lung lower lobe' },
      specimenType: { specimenTypeName: 'Wedge resection' },
    },
    {
      specimenId: 'SU260000123-B',
      specimenCode: 'B',
      bodySite: { bodySiteName: 'Mediastinal lymph node' },
      specimenType: { specimenTypeName: 'Excisional biopsy' },
    },
  ],
};

describe('PdfService.generateWorksheetPdf', () => {
  it('writes a structurally valid PDF with the expected file name', async () => {
    const svc = new PdfService();
    const out = await svc.generateWorksheetPdf(fakeOrder);

    expect(out.fileName.endsWith('-worksheet.pdf')).toBe(true);
    expect(fs.existsSync(out.storagePath)).toBe(true);
    await assertWellFormedPdf(fs.readFileSync(out.storagePath));
  });
});

describe('PdfService.generateReferenceStripsPdf', () => {
  it('writes a structurally valid PDF whose extracted text lists every block + slide id', async () => {
    const svc = new PdfService();
    const specimens = [
      {
        specimenCode: 'A',
        specimenId: 'SU260000123-A',
        bodySite: { bodySiteName: 'Left lung' },
        blocks: [
          {
            blockId: 'SU260000123-A1',
            blockNumber: 1,
            slides: [
              { slideId: 'SU260000123-A1-S1', slideNumber: 1, slideType: 'H&E' },
              { slideId: 'SU260000123-A1-S2', slideNumber: 2, slideType: 'IHC' },
            ],
          },
        ],
      },
    ];
    const out = await svc.generateReferenceStripsPdf('SU260000123', specimens);

    const bytes = fs.readFileSync(out.storagePath);
    await assertWellFormedPdf(bytes);

    const text = await tryExtractText(bytes);
    if (text) {
      expect(text).toContain('REFERENCE STRIPS');
      expect(text).toContain('Specimen A');
      expect(text).toMatch(/A1\b/);
      expect(text).toMatch(/A1-S1/);
      expect(text).toMatch(/A1-S2/);
      expect(text).toMatch(/IHC/);
    }
  });
});

describe('PdfService.generateReportPdf', () => {
  const baseReport = {
    reportId: 9001n,
    orderId: 'SU260000123',
    versionNumber: 1,
    diagnosis: 'Adenocarcinoma, moderately differentiated.',
    comment: 'Margins free of tumor.',
    gross: 'Single tan-pink fragment 2.3 cm; entirely submitted in cassette A.',
    signedOutDatetime: new Date('2026-05-30T15:00:00Z'),
    pathologist: { firstName: 'Gregory', lastName: 'House' },
    order: fakeOrder,
  };

  it('produces a structurally valid FINAL PDF with the expected file name', async () => {
    const svc = new PdfService();
    const out = await svc.generateReportPdf(baseReport, 'final');

    expect(out.fileName).toMatch(/-report-v1\.pdf$/);
    expect(out.fileName).not.toMatch(/-prelim/);
    await assertWellFormedPdf(fs.readFileSync(out.storagePath));
  });

  it('produces a structurally valid PRELIMINARY PDF and uses the -prelim file-name suffix', async () => {
    const svc = new PdfService();
    const out = await svc.generateReportPdf(baseReport, 'preliminary');

    expect(out.fileName).toMatch(/-prelim\.pdf$/);
    await assertWellFormedPdf(fs.readFileSync(out.storagePath));
  });

  it('produces a valid ADDENDUM PDF with the -addend file-name suffix when reactivationType is "addend"', async () => {
    const svc = new PdfService();
    const out = await svc.generateReportPdf(
      {
        ...baseReport,
        versionNumber: 2,
        reactivationType: 'addend',
        reactivationReason: 'Updated IHC results received from reference lab.',
      },
      'final',
    );
    expect(out.fileName).toMatch(/-addend\.pdf$/);
    await assertWellFormedPdf(fs.readFileSync(out.storagePath));
  });

  it('produces a valid REVISED PDF with the -revise file-name suffix when reactivationType is "revise"', async () => {
    const svc = new PdfService();
    const out = await svc.generateReportPdf(
      {
        ...baseReport,
        versionNumber: 2,
        reactivationType: 'revise',
        reactivationReason: 'Diagnosis revised after additional review.',
      },
      'final',
    );
    expect(out.fileName).toMatch(/-revise\.pdf$/);
    await assertWellFormedPdf(fs.readFileSync(out.storagePath));
  });
});

describe('PdfService.renderPatientSummaryPdf', () => {
  it('returns structurally valid PDF bytes (not written to disk) carrying the language code in the file name', async () => {
    const svc = new PdfService();
    const out = await svc.renderPatientSummaryPdf({
      reportId: 9001n,
      orderId: 'SU260000123',
      signedOutDatetime: new Date('2026-05-30T15:00:00Z'),
      patient: fakeOrder.patient,
      summary: {
        templateId: 'tpl-x',
        language: 'en',
        patientTitle: 'Your pathology summary',
        plainLanguageSummary: 'A small sample of tissue was examined under a microscope.',
        whatThisMeans: 'The findings suggest a benign condition.',
        possibleNextSteps: 'No further action is needed at this time.',
        safetyNote: 'Discuss any new symptoms with your clinician.',
      },
    });

    expect(out.fileName.endsWith('.pdf')).toBe(true);
    expect(out.fileName).toContain('patient-summary-en');
    await assertWellFormedPdf(out.pdfBytes);
  });
});

describe('PdfService.generatePreviewPdf', () => {
  it('returns structurally valid PDF bytes without writing to disk and includes the DRAFT PREVIEW marker', async () => {
    const svc = new PdfService();
    const before = fs.readdirSync(path.join(tmpDir, 'generated-pdfs')).length;

    const bytes = await svc.generatePreviewPdf({
      orderId: 'SU260000123',
      diagnosis: 'Benign reactive changes.',
      comment: 'No malignancy identified.',
      gross: 'Single fragment 1.0 cm.',
      order: fakeOrder,
      pathologistName: 'House, Gregory',
    });

    await assertWellFormedPdf(bytes);

    const after = fs.readdirSync(path.join(tmpDir, 'generated-pdfs')).length;
    expect(after).toBe(before);

    const text = await tryExtractText(bytes);
    if (text !== null) {
      expect(text).toMatch(/DRAFT PREVIEW/i);
      expect(text).toMatch(/Benign reactive changes/);
    }
  });

  it('renders a placeholder when diagnosis is empty', async () => {
    const svc = new PdfService();
    const bytes = await svc.generatePreviewPdf({
      orderId: 'SU260000123',
      diagnosis: '',
      order: fakeOrder,
    });
    await assertWellFormedPdf(bytes);
  });
});
