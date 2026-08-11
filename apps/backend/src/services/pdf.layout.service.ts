import Handlebars from 'handlebars';
import { isDemoMode } from '../lib/demoMode.js';
// puppeteer-core v25+ is ESM-only; use dynamic import to load it in the CJS backend

export interface ReportLayoutData {
  reportType: string;          // 'final' | 'preliminary' | 'addendum' | 'revision'
  caseId: string;              // e.g. "SU-26-00001"
  version: number;
  institutionName: string;
  patient: {
    patientId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;       // ISO date string
    sex: string;
  };
  clinician: {
    firstName: string;
    lastName: string;
  };
  clinicalHistory?: string | null;
  gross?: string | null;
  diagnosis?: string | null;
  comment?: string | null;
  reactivationType?: string | null;
  reactivationReason?: string | null;
  signedOutBy?: string | null;
  signedOutDate?: string | null;
  /** When true, the document is rendered as an unsigned draft preview. */
  isDraftPreview?: boolean;
}

// ---------------------------------------------------------------------------
// Default HTML template (mimics the existing pdf-lib layout)
// ---------------------------------------------------------------------------
export const DEFAULT_REPORT_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Helvetica, Arial, sans-serif;
      font-size: 11pt;
      color: #111;
      padding: 50px;
      line-height: 1.4;
    }
    .header-title {
      font-size: 14pt;
      font-weight: bold;
      color: #1a1a80;
      text-transform: uppercase;
    }
    .header-type {
      font-size: 12pt;
      font-weight: bold;
      margin-top: 4px;
    }
    .header-type.final    { color: #0d7a0d; }
    .header-type.prelim   { color: #994d00; }
    .header-type.addendum { color: #cc3300; }
    .header-type.revision { color: #cc3300; }
    .case-id {
      font-size: 20pt;
      font-weight: bold;
      margin-top: 6px;
    }
    hr {
      border: none;
      border-top: 1.5px solid #111;
      margin: 10px 0;
    }
    .section-label {
      font-size: 10pt;
      font-weight: bold;
      color: #333399;
      text-transform: uppercase;
      margin-top: 14px;
      margin-bottom: 4px;
    }
    .field-row {
      display: flex;
      gap: 8px;
      margin-left: 10px;
      margin-bottom: 2px;
    }
    .field-label { font-weight: bold; white-space: nowrap; }
    .field-value { flex: 1; }
    .body-text {
      margin-left: 10px;
      white-space: pre-wrap;
    }
    .diagnosis-text {
      margin-left: 10px;
      font-weight: bold;
      white-space: pre-wrap;
    }
    .signoff {
      margin-top: 20px;
      border-top: 0.5px solid #777;
      padding-top: 10px;
    }
    .watermark {
      font-size: 10pt;
      color: #888;
      text-align: center;
      margin-top: 30px;
    }
  </style>
</head>
<body>
  <div class="header-title">Anatomic Pathology Report</div>

  {{#if isDraftPreview}}
    <div class="header-type prelim">Draft Preview</div>
  {{else if isPrelim}}
    <div class="header-type prelim">Preliminary Report</div>
  {{else if isAddendum}}
    <div class="header-type addendum">Addendum Report</div>
  {{else if isRevision}}
    <div class="header-type revision">Revised Report</div>
  {{else}}
    <div class="header-type final">Final Report</div>
  {{/if}}

  <div class="case-id">{{caseId}}</div>
  <p style="margin-top:4px;color:#444;">Version: {{version}}</p>
  <hr>

  <div class="section-label">Patient</div>
  <div class="field-row"><span class="field-label">Name:</span><span class="field-value">{{patient.lastName}}, {{patient.firstName}}</span></div>
  <div class="field-row"><span class="field-label">Patient ID:</span><span class="field-value">{{patient.patientId}}</span></div>
  <div class="field-row"><span class="field-label">Date of Birth:</span><span class="field-value">{{patient.dateOfBirth}}</span></div>
  <div class="field-row"><span class="field-label">Sex:</span><span class="field-value">{{patient.sex}}</span></div>
  <div class="field-row"><span class="field-label">Clinician:</span><span class="field-value">{{clinician.lastName}}, {{clinician.firstName}}</span></div>

  <div class="section-label">Diagnosis</div>
  <div class="diagnosis-text">{{diagnosis}}</div>

  {{#if comment}}
    <div class="section-label">Comment</div>
    <div class="body-text">{{comment}}</div>
  {{/if}}

  {{#if gross}}
    <div class="section-label">Gross Description</div>
    <div class="body-text">{{gross}}</div>
  {{/if}}

  {{#if reactivationReason}}
    <div class="section-label">Reason for Reactivation</div>
    <div class="body-text">{{reactivationReason}}</div>
  {{/if}}

  <div class="signoff">
    {{#if isDraftPreview}}
      <div class="field-row"><span class="field-label">Pathologist (preview):</span><span class="field-value">{{signedOutBy}}</span></div>
      <div class="watermark" style="color:#994d00;font-weight:bold;">*** DRAFT PREVIEW — NOT A SIGNED REPORT ***</div>
    {{else}}
      <div class="field-row"><span class="field-label">Signed out by:</span><span class="field-value">{{signedOutBy}}</span></div>
      {{#if signedOutDate}}
        <div class="field-row"><span class="field-label">Signed out on:</span><span class="field-value">{{signedOutDate}}</span></div>
      {{/if}}
    {{/if}}
  </div>

  {{#if institutionName}}
    <div class="watermark">{{institutionName}}</div>
  {{/if}}
</body>
</html>`;

// ---------------------------------------------------------------------------
// Demo watermark
// ---------------------------------------------------------------------------

/**
 * Stamp rendered report HTML as demo output.
 *
 * Applied to the compiled HTML rather than added to
 * `DEFAULT_REPORT_HTML_TEMPLATE` as a `{{#if demoMode}}` block, because report
 * layouts are editable (see config.reportLayout.service.ts): a customized
 * template must not be able to drop the marking, whether by accident or intent.
 *
 * `position: fixed` repeats the overlay on every page in Chromium's print
 * renderer. Kept to a centred diagonal with no top bar — page margins are 0 and
 * the template supplies its own padding, so a banner would land on the header.
 */
export function withDemoWatermark(html: string): string {
  const overlay = `
<style>
  .lis-demo-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none; z-index: 9999;
  }
  .lis-demo-overlay span {
    transform: rotate(-35deg);
    font: bold 56px/1.1 Helvetica, Arial, sans-serif;
    color: rgba(183, 28, 28, 0.16);
    letter-spacing: 6px; text-align: center; white-space: nowrap;
  }
</style>
<div class="lis-demo-overlay"><span>DEMO DATA<br>NOT A REAL PATIENT REPORT</span></div>
`;

  // Append rather than insert-before-</body> so HTML without a closing body tag
  // (a hand-edited layout, say) still gets stamped.
  return html.includes('</body>')
    ? html.replace('</body>', `${overlay}</body>`)
    : html + overlay;
}

// ---------------------------------------------------------------------------
// Handlebars helpers
// ---------------------------------------------------------------------------
Handlebars.registerHelper('isPrelim',    (rt: string) => rt === 'preliminary');
Handlebars.registerHelper('isAddendum',  (rt: string) => rt === 'addendum');
Handlebars.registerHelper('isRevision',  (rt: string) => rt === 'revision');

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export class PdfLayoutService {
  private async getBrowser() {
    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser';

    const { default: puppeteer } = await import('puppeteer-core');
    return puppeteer.launch({
      executablePath,
      headless: true,
      // `--no-zygote` and `--single-process` were previously included here. Modern
      // Chromium crashes on startup under that combination — the browser process
      // exits immediately and puppeteer reports
      // "Protocol error (Target.createTarget): Target closed". Because
      // ReportService.signOut catches PDF errors so they cannot block sign-out,
      // the failure was silent: cases signed out successfully but no report PDF
      // was ever produced and no ReportFile row was written. Verified in the
      // production container image: with these two flags a render fails, without
      // them the same call returns a valid PDF.
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  }

  /**
   * Render an HTML/Handlebars template string to PDF bytes.
   */
  async renderToPdf(htmlTemplate: string, data: ReportLayoutData): Promise<Buffer> {
    // Augment data with boolean helpers
    const templateData = {
      ...data,
      isPrelim:    data.reportType === 'preliminary',
      isAddendum:  data.reportType === 'addendum',
      isRevision:  data.reportType === 'revision',
      isFinal:     data.reportType === 'final',
      isDraftPreview: data.isDraftPreview === true,
    };

    const template = Handlebars.compile(htmlTemplate);
    const rendered = template(templateData);
    const html = isDemoMode() ? withDemoWatermark(rendered) : rendered;

    const browser = await this.getBrowser();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  /** Build sample data for preview rendering */
  static sampleData(reportType: string): ReportLayoutData {
    return {
      reportType,
      caseId: 'SU-26-00001',
      version: 1,
      institutionName: 'Anatomic Pathology Laboratory',
      patient: {
        patientId: 'P-0001',
        firstName: 'Jane',
        lastName: 'Doe',
        dateOfBirth: '1975-04-12',
        sex: 'Female',
      },
      clinician: { firstName: 'John', lastName: 'Smith' },
      clinicalHistory: 'Right breast mass, 1.5 cm on imaging. Rule out malignancy.',
      gross: 'Received in formalin, labeled "right breast core biopsy", are 3 tan-white core fragments measuring 1.2 cm in aggregate.',
      diagnosis: 'RIGHT BREAST, CORE BIOPSY:\n- Invasive ductal carcinoma, grade 2\n- Margins not assessable on core biopsy',
      comment: 'ER/PR/HER2 immunohistochemistry to follow.',
      reactivationType: null,
      reactivationReason: null,
      signedOutBy: 'Dr. A. Pathologist',
      signedOutDate: new Date().toISOString().slice(0, 10),
    };
  }
}
