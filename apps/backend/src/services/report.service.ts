import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import {
  type AppLanguageCode,
  type CreateDraftReportInput,
  type PatientSummaryValues,
  type ReactivateOrderInput,
  type ResolvedPatientSummary,
  type SignOutReportInput,
  resolvePatientSummary,
} from '@lis/shared';
import { getPatientSummaryDefinition } from '@lis/shared/patient-summaries/server';
import { PdfService } from './pdf.service.js';

const pdfService = new PdfService();

type RawRecord = Record<string, unknown>;

interface ParsedStructuredTemplatePayload {
  templateId: string;
  values: PatientSummaryValues;
}

function asRecord(value: unknown): RawRecord | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RawRecord)
    : null;
}

function parsePatientSummaryValues(value: unknown): PatientSummaryValues {
  const rawValues = asRecord(value) ?? {};
  const parsedValues: PatientSummaryValues = {};

  for (const [fieldId, entry] of Object.entries(rawValues)) {
    if (typeof entry === 'string') {
      parsedValues[fieldId] = entry;
      continue;
    }

    if (Array.isArray(entry)) {
      parsedValues[fieldId] = entry.filter((item): item is string => typeof item === 'string');
    }
  }

  return parsedValues;
}

function parseStructuredTemplatePayload(rawPayload: string | null | undefined): ParsedStructuredTemplatePayload | null {
  if (!rawPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawPayload) as Partial<{ templateId: unknown; values: unknown }>;
    if (typeof parsed.templateId !== 'string' || parsed.templateId.length === 0) {
      return null;
    }

    return {
      templateId: parsed.templateId,
      values: parsePatientSummaryValues(parsed.values),
    } satisfies ParsedStructuredTemplatePayload;
  } catch {
    return null;
  }
}

const REPORT_INCLUDE = {
  pathologist: { include: { employeeRole: true } },
  reportTemplate: true,
  reportFiles: true,
} as const;

const REPORT_PATIENT_SUMMARY_INCLUDE = {
  ...REPORT_INCLUDE,
  order: {
    include: {
      patient: true,
      doctor: true,
    },
  },
} as const;

export class ReportService {
  async getOrderReports(orderId: string): Promise<object[]> {
    return prisma.report.findMany({
      where: { orderId },
      orderBy: { versionNumber: 'asc' },
      include: REPORT_INCLUDE,
    });
  }

  async createDraft(orderId: string, data: CreateDraftReportInput): Promise<object> {
    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', `Order ${orderId} not found`);

    // Check if there's already an unsigned, non-prelim draft
    const existingDraft = await prisma.report.findFirst({
      where: { orderId, isFinal: false, isPrelim: false },
      orderBy: { versionNumber: 'desc' },
    });

    if (existingDraft) {
      // Update the existing draft
      return prisma.report.update({
        where: { reportId: existingDraft.reportId },
        data: {
          diagnosis: data.diagnosis,
          comment: data.comment,
          reportTemplateId: data.reportTemplateId,
          gross: data.gross,
          grossPayload: data.grossPayload,
          synopticData: data.synopticData,
          synopticPayload: data.synopticPayload,
          pathologistEmployeeId: data.pathologistEmployeeId != null
            ? BigInt(data.pathologistEmployeeId)
            : undefined,
        },
        include: REPORT_INCLUDE,
      });
    }

    // Get next version number
    const latestReport = await prisma.report.findFirst({
      where: { orderId },
      orderBy: { versionNumber: 'desc' },
    });
    const versionNumber = (latestReport?.versionNumber ?? 0) + 1;

    return prisma.report.create({
      data: {
        orderId,
        versionNumber,
        diagnosis: data.diagnosis,
        comment: data.comment,
        reportTemplateId: data.reportTemplateId,
        gross: data.gross,
        grossPayload: data.grossPayload,
        synopticData: data.synopticData,
        synopticPayload: data.synopticPayload,
        pathologistEmployeeId: data.pathologistEmployeeId != null
          ? BigInt(data.pathologistEmployeeId)
          : undefined,
      },
      include: REPORT_INCLUDE,
    });
  }

  async signOut(reportId: number, data: SignOutReportInput): Promise<object> {
    const report = await prisma.report.findUnique({
      where: { reportId: BigInt(reportId) },
      include: REPORT_INCLUDE,
    });
    if (!report) throw new AppError(404, 'NOT_FOUND', `Report ${reportId} not found`);
    if (report.isFinal) throw new AppError(409, 'CONFLICT', 'Report is already signed out and cannot be modified');

    const now = new Date();

    const signed = await prisma.report.update({
      where: { reportId: BigInt(reportId) },
      data: {
        diagnosis: data.diagnosis,
        comment: data.comment,
        reportTemplateId: data.reportTemplateId,
        gross: data.gross,
        grossPayload: data.grossPayload,
        synopticData: data.synopticData,
        synopticPayload: data.synopticPayload,
        pathologistEmployeeId: BigInt(data.pathologistEmployeeId),
        signedOutDatetime: now,
        isFinal: true,
      },
      include: {
        ...REPORT_INCLUDE,
        order: {
          include: {
            patient: true,
            doctor: true,
            specimens: { include: { bodySite: true, specimenType: true } },
          },
        },
      },
    });

    // Mark order as completed
    await prisma.order.update({
      where: { orderId: report.orderId },
      data: { completedDate: now },
    });

    // Generate report PDF
    try {
      const reportFileRecord = await pdfService.generateReportPdf(signed as Parameters<typeof pdfService.generateReportPdf>[0], 'final');
      await prisma.reportFile.create({
        data: {
          reportId: BigInt(reportId),
          fileType: 'report_pdf',
          fileName: reportFileRecord.fileName,
          originalFileName: reportFileRecord.fileName,
          mimeType: 'application/pdf',
          storagePath: reportFileRecord.storagePath,
        },
      });
    } catch (err) {
      // PDF generation failure should not block sign-out
    }

    return signed;
  }

  async signPrelim(reportId: number, data: SignOutReportInput): Promise<object> {
    const report = await prisma.report.findUnique({
      where: { reportId: BigInt(reportId) },
      include: REPORT_INCLUDE,
    });
    if (!report) throw new AppError(404, 'NOT_FOUND', `Report ${reportId} not found`);
    if (report.isFinal) throw new AppError(409, 'CONFLICT', 'Report is already signed out and cannot be modified');

    const now = new Date();

    // Freeze this version as the preliminary report
    const prelim = await prisma.report.update({
      where: { reportId: BigInt(reportId) },
      data: {
        diagnosis: data.diagnosis,
        comment: data.comment,
        reportTemplateId: data.reportTemplateId,
        gross: data.gross,
        grossPayload: data.grossPayload,
        synopticData: data.synopticData,
        synopticPayload: data.synopticPayload,
        pathologistEmployeeId: BigInt(data.pathologistEmployeeId),
        isPrelim: true,
        signedOutDatetime: now,
      },
      include: {
        ...REPORT_INCLUDE,
        order: {
          include: {
            patient: true,
            doctor: true,
            specimens: { include: { bodySite: true, specimenType: true } },
          },
        },
      },
    });

    // Generate preliminary PDF
    try {
      const reportFileRecord = await pdfService.generateReportPdf(
        prelim as Parameters<typeof pdfService.generateReportPdf>[0],
        'preliminary'
      );
      await prisma.reportFile.create({
        data: {
          reportId: BigInt(reportId),
          fileType: 'prelim_pdf',
          fileName: reportFileRecord.fileName,
          originalFileName: reportFileRecord.fileName,
          mimeType: 'application/pdf',
          storagePath: reportFileRecord.storagePath,
        },
      });
    } catch (err) {
      // PDF generation failure should not block prelim sign-out
    }

    // Create a new editable draft (copy of prelim content) for continued editing
    await prisma.report.create({
      data: {
        orderId: prelim.orderId,
        versionNumber: prelim.versionNumber + 1,
        diagnosis: prelim.diagnosis ?? undefined,
        comment: prelim.comment ?? undefined,
        gross: prelim.gross ?? undefined,
        grossPayload: prelim.grossPayload ?? undefined,
        synopticData: prelim.synopticData ?? undefined,
        synopticPayload: prelim.synopticPayload ?? undefined,
        reportTemplateId: prelim.reportTemplateId ?? undefined,
        pathologistEmployeeId: prelim.pathologistEmployeeId ?? undefined,
      },
    });

    return prelim;
  }

  async reactivate(orderId: string, data: ReactivateOrderInput): Promise<object> {
    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', `Order ${orderId} not found`);

    // Get the latest signed-out report
    const latestFinal = await prisma.report.findFirst({
      where: { orderId, isFinal: true },
      orderBy: { versionNumber: 'desc' },
    });
    if (!latestFinal) throw new AppError(400, 'BAD_REQUEST', 'Order has no signed-out report to reactivate from');

    // Mark order reactivated
    await prisma.order.update({
      where: { orderId },
      data: {
        isReactivated: true,
        reactivatedFromReportId: latestFinal.reportId,
        completedDate: null,
      },
    });

    // Create new draft version
    const newDraft = await prisma.report.create({
      data: {
        orderId,
        versionNumber: latestFinal.versionNumber + 1,
        diagnosis: latestFinal.diagnosis ?? undefined,
        comment: latestFinal.comment ?? undefined,
        gross: latestFinal.gross ?? undefined,
        grossPayload: latestFinal.grossPayload ?? undefined,
        synopticData: latestFinal.synopticData ?? undefined,
        synopticPayload: latestFinal.synopticPayload ?? undefined,
        reportTemplateId: latestFinal.reportTemplateId ?? undefined,
        reactivationType: data.reactivationType,
        reactivationReason: data.reactivationReason ?? undefined,
        supersedesReportId: latestFinal.reportId,
      },
      include: REPORT_INCLUDE,
    });

    return newDraft;
  }

  async getResolvedPatientSummary(reportId: number, language: AppLanguageCode) {
    const report = await prisma.report.findUnique({
      where: { reportId: BigInt(reportId) },
      include: REPORT_PATIENT_SUMMARY_INCLUDE,
    });

    if (!report) {
      throw new AppError(404, 'NOT_FOUND', `Report ${reportId} not found`);
    }

    const structuredPayload = parseStructuredTemplatePayload(report.synopticPayload);
    if (!structuredPayload) {
      throw new AppError(422, 'UNPROCESSABLE_ENTITY', 'Report does not have a structured reporting payload for patient summary generation');
    }

    let definition;
    try {
      definition = getPatientSummaryDefinition(structuredPayload.templateId, language);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Patient summary not found')) {
        throw new AppError(404, 'NOT_FOUND', error.message);
      }

      throw error;
    }

    const summary = resolvePatientSummary(definition, structuredPayload.values);
    if (!summary) {
      throw new AppError(422, 'UNPROCESSABLE_ENTITY', 'No patient summary rule matched the structured report values');
    }

    return {
      report,
      summary,
    };
  }

  async renderPatientSummaryPdf(reportId: number, language: AppLanguageCode): Promise<{ fileName: string; pdfBytes: Uint8Array }> {
    const { report, summary } = await this.getResolvedPatientSummary(reportId, language);

    return pdfService.renderPatientSummaryPdf({
      reportId: report.reportId,
      orderId: report.orderId,
      signedOutDatetime: report.signedOutDatetime,
      patient: report.order.patient,
      summary,
    });
  }

  async findById(reportId: number): Promise<object> {
    const report = await prisma.report.findUnique({
      where: { reportId: BigInt(reportId) },
      include: REPORT_INCLUDE,
    });
    if (!report) throw new AppError(404, 'NOT_FOUND', `Report ${reportId} not found`);
    return report;
  }
}
