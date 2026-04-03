import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { GENERATED_PDFS_DIR } from '../utils/storageDirs';
import { formatOrderIdDisplay } from '@lis/shared';

interface OrderForPdf {
  orderId: string;
  registeredDate: Date;
  clinicalHistory?: string | null;
  caseType?: string | null;
  patient: {
    patientId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    sex: string;
  };
  doctor: {
    firstName: string;
    lastName: string;
  };
  specimens: Array<{
    specimenId: string;
    specimenCode: string;
    bodySite?: { bodySiteName: string } | null;
    specimenType?: { specimenTypeName: string } | null;
  }>;
}

interface ReportForPdf {
  reportId: bigint;
  orderId: string;
  versionNumber: number;
  diagnosis?: string | null;
  comment?: string | null;
  gross?: string | null;
  signedOutDatetime?: Date | null;
  reactivationType?: string | null;
  pathologist?: { firstName: string; lastName: string } | null;
  order: OrderForPdf;
}

const MARGIN = 50;
const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export class PdfService {
  /**
   * Generate a case worksheet PDF for a newly created order.
   */
  async generateWorksheetPdf(order: OrderForPdf): Promise<{ fileName: string; storagePath: string }> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let y = PAGE_HEIGHT - MARGIN;

    // Title
    page.drawText('ANATOMIC PATHOLOGY', { x: MARGIN, y, font: boldFont, size: 14, color: rgb(0.1, 0.1, 0.5) });
    y -= 22;
    page.drawText('CASE WORKSHEET', { x: MARGIN, y, font: boldFont, size: 12, color: rgb(0.1, 0.1, 0.5) });
    y -= 30;

    // Case ID - large and prominent
    page.drawText(formatOrderIdDisplay(order.orderId), { x: MARGIN, y, font: boldFont, size: 32, color: rgb(0, 0, 0) });
    y -= 40;

    // Horizontal rule
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1.5, color: rgb(0, 0, 0) });
    y -= 20;

    // Patient details
    y = this.drawSection(page, 'PATIENT INFORMATION', y, boldFont);
    y = this.drawField(page, 'Patient ID', order.patient.patientId, y, boldFont, regularFont);
    y = this.drawField(page, 'Name', `${order.patient.lastName}, ${order.patient.firstName}`, y, boldFont, regularFont);
    y = this.drawField(page, 'Date of Birth', order.patient.dateOfBirth.toISOString().split('T')[0], y, boldFont, regularFont);
    y = this.drawField(page, 'Sex', order.patient.sex, y, boldFont, regularFont);
    y -= 12;

    // Case details
    y = this.drawSection(page, 'CASE INFORMATION', y, boldFont);
    y = this.drawField(page, 'Case ID', formatOrderIdDisplay(order.orderId), y, boldFont, regularFont);
    y = this.drawField(page, 'Registered Date', order.registeredDate.toISOString().split('T')[0], y, boldFont, regularFont);
    y = this.drawField(page, 'Clinician', `${order.doctor.lastName}, ${order.doctor.firstName}`, y, boldFont, regularFont);
    if (order.caseType) {
      y = this.drawField(page, 'Case Type', order.caseType, y, boldFont, regularFont);
    }
    y -= 12;

    // Specimens
    y = this.drawSection(page, 'SPECIMENS', y, boldFont);
    for (const spec of order.specimens) {
      const site = spec.bodySite?.bodySiteName ?? 'Not specified';
      const type = spec.specimenType?.specimenTypeName ?? 'Not specified';
      page.drawText(`${spec.specimenCode}.  ${type} — ${site}`, { x: MARGIN + 10, y, font: regularFont, size: 11 });
      y -= 16;
    }
    y -= 8;

    // Clinical history
    y = this.drawSection(page, 'CLINICAL HISTORY', y, boldFont);
    if (order.clinicalHistory) {
      page.drawText(order.clinicalHistory, { x: MARGIN + 10, y, font: regularFont, size: 11, maxWidth: CONTENT_WIDTH - 10 });
      y -= 40;
    } else {
      y -= 40;
    }

    // Blank areas
    y = this.drawBlankSection(page, 'GROSS DESCRIPTION', y, boldFont, 150);
    y = this.drawBlankSection(page, 'CLINICAL NOTES', y, boldFont, 100);

    const fileName = `${order.orderId}-worksheet.pdf`;
    const storagePath = path.join(GENERATED_PDFS_DIR, fileName);

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(storagePath, pdfBytes);

    return { fileName, storagePath };
  }

  /**
   * Generate a reference strips PDF for blocks and slides of an order.
   */
  async generateReferenceStripsPdf(
    orderId: string,
    specimens: Array<{
      specimenCode: string;
      specimenId: string;
      bodySite?: { bodySiteName: string } | null;
      blocks: Array<{
        blockId: string;
        blockNumber: number;
        slides: Array<{ slideId: string; slideNumber: number; slideType?: string | null }>;
      }>;
    }>
  ): Promise<{ fileName: string; storagePath: string }> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let y = PAGE_HEIGHT - MARGIN;

    page.drawText('REFERENCE STRIPS', { x: MARGIN, y, font: boldFont, size: 14, color: rgb(0.1, 0.1, 0.5) });
    y -= 22;
    page.drawText(`Case: ${formatOrderIdDisplay(orderId)}`, { x: MARGIN, y, font: boldFont, size: 18, color: rgb(0, 0, 0) });
    y -= 30;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1.5 });
    y -= 20;

    for (const spec of specimens) {
      if (y < 100) break; // Simple pagination guard

      y = this.drawSection(page, `Specimen ${spec.specimenCode}${spec.bodySite ? ` — ${spec.bodySite.bodySiteName}` : ''}`, y, boldFont);

      for (const block of spec.blocks) {
        page.drawText(`  Block:  ${block.blockId}`, { x: MARGIN + 10, y, font: boldFont, size: 13 });
        y -= 18;
        for (const slide of block.slides) {
          page.drawText(`      Slide: ${slide.slideId}  [${slide.slideType ?? 'H&E'}]`, {
            x: MARGIN + 20,
            y,
            font: regularFont,
            size: 11,
          });
          y -= 14;
        }
        y -= 6;
      }
      y -= 10;
    }

    const fileName = `${orderId}-reference-strips.pdf`;
    const storagePath = path.join(GENERATED_PDFS_DIR, fileName);
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(storagePath, pdfBytes);

    return { fileName, storagePath };
  }

  /**
   * Generate a report PDF for a signed-out report.
   */
  async generateReportPdf(report: ReportForPdf): Promise<{ fileName: string; storagePath: string }> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let y = PAGE_HEIGHT - MARGIN;

    // Header
    page.drawText('ANATOMIC PATHOLOGY REPORT', { x: MARGIN, y, font: boldFont, size: 14, color: rgb(0.1, 0.1, 0.5) });
    y -= 24;
    if (report.reactivationType) {
      const label = report.reactivationType === 'addend' ? 'ADDENDUM REPORT' : 'REVISED REPORT';
      page.drawText(label, { x: MARGIN, y, font: boldFont, size: 12, color: rgb(0.8, 0.2, 0) });
      y -= 20;
    }
    page.drawText(`Case: ${formatOrderIdDisplay(report.orderId)}  |  Version: ${report.versionNumber}`, { x: MARGIN, y, font: boldFont, size: 18 });
    y -= 28;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1.5 });
    y -= 16;

    // Patient
    y = this.drawSection(page, 'PATIENT', y, boldFont);
    y = this.drawField(page, 'Name', `${report.order.patient.lastName}, ${report.order.patient.firstName}`, y, boldFont, regularFont);
    y = this.drawField(page, 'Patient ID', report.order.patient.patientId, y, boldFont, regularFont);
    y = this.drawField(page, 'DOB', report.order.patient.dateOfBirth.toISOString().split('T')[0], y, boldFont, regularFont);
    y = this.drawField(page, 'Clinician', `${report.order.doctor.lastName}, ${report.order.doctor.firstName}`, y, boldFont, regularFont);
    y -= 12;

    if (report.gross) {
      y = this.drawSection(page, 'GROSS DESCRIPTION', y, boldFont);
      y = this.drawWrappedText(page, report.gross, y, regularFont);
      y -= 8;
    }

    y = this.drawSection(page, 'DIAGNOSIS', y, boldFont);
    y = this.drawWrappedText(page, report.diagnosis ?? '', y, boldFont);
    y -= 12;

    if (report.comment) {
      y = this.drawSection(page, 'COMMENT', y, boldFont);
      y = this.drawWrappedText(page, report.comment, y, regularFont);
      y -= 8;
    }

    // Sign-out
    y -= 20;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5 });
    y -= 14;
    const pathologistName = report.pathologist
      ? `${report.pathologist.lastName}, ${report.pathologist.firstName}`
      : 'Unknown';
    y = this.drawField(page, 'Signed out by', pathologistName, y, boldFont, regularFont);
    if (report.signedOutDatetime) {
      y = this.drawField(page, 'Signed out on', report.signedOutDatetime.toISOString().replace('T', ' ').slice(0, 19), y, boldFont, regularFont);
    }

    const suffix = report.reactivationType ? `-${report.reactivationType}` : '';
    const fileName = `${report.orderId}-report-v${report.versionNumber}${suffix}.pdf`;
    const storagePath = path.join(GENERATED_PDFS_DIR, fileName);

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(storagePath, pdfBytes);

    return { fileName, storagePath };
  }

  // ----- Helpers -----

  private drawSection(page: ReturnType<PDFDocument['addPage']>, title: string, y: number, boldFont: Awaited<ReturnType<PDFDocument['embedFont']>>): number {
    page.drawText(title, { x: MARGIN, y, font: boldFont, size: 11, color: rgb(0.2, 0.2, 0.6) });
    return y - 16;
  }

  private drawField(page: ReturnType<PDFDocument['addPage']>, label: string, value: string, y: number, boldFont: Awaited<ReturnType<PDFDocument['embedFont']>>, regularFont: Awaited<ReturnType<PDFDocument['embedFont']>>): number {
    page.drawText(`${label}: `, { x: MARGIN + 10, y, font: boldFont, size: 11 });
    page.drawText(value, { x: MARGIN + 10 + boldFont.widthOfTextAtSize(`${label}: `, 11), y, font: regularFont, size: 11 });
    return y - 15;
  }

  private drawWrappedText(page: ReturnType<PDFDocument['addPage']>, text: string, y: number, font: Awaited<ReturnType<PDFDocument['embedFont']>>): number {
    const lines = text.split('\n');
    for (const line of lines) {
      if (y < 80) break;
      page.drawText(line.slice(0, 100), { x: MARGIN + 10, y, font, size: 11 });
      y -= 14;
    }
    return y;
  }

  private drawBlankSection(page: ReturnType<PDFDocument['addPage']>, title: string, y: number, boldFont: Awaited<ReturnType<PDFDocument['embedFont']>>, height: number): number {
    page.drawText(title, { x: MARGIN, y, font: boldFont, size: 11, color: rgb(0.2, 0.2, 0.6) });
    y -= 14;
    page.drawRectangle({ x: MARGIN, y: y - height + 14, width: CONTENT_WIDTH, height, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });
    return y - height - 10;
  }
}
