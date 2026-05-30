import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { logger } from '../lib/logger.js';
import {
  type AppLanguageCode,
  type CreateDraftReportInput,
  type PatientSummaryValues,
  type ReactivateOrderInput,
  type ResolvedPatientSummary,
  type SignOutReportInput,
  resolvePatientSummary,
  formatOrderIdDisplay,
} from '@lis/shared';
import { getPatientSummaryDefinition } from '@lis/shared/patient-summaries/server';
import { PdfService } from './pdf.service.js';
import { PdfLayoutService, type ReportLayoutData } from './pdf.layout.service.js';
import { ConfigReportLayoutService } from './config.reportLayout.service.js';
import fs from 'fs';
import path from 'path';
import { GENERATED_PDFS_DIR } from '../utils/storageDirs.js';

const pdfService = new PdfService();
const pdfLayoutService = new PdfLayoutService();
const layoutConfigService = new ConfigReportLayoutService();

type RawRecord = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helper: convert a Prisma report row (with order/patient/doctor) to
// the ReportLayoutData expected by PdfLayoutService
// ---------------------------------------------------------------------------
function buildLayoutData(report: {
  orderId: string;
  versionNumber: number;
  diagnosis?: string | null;
  comment?: string | null;
  gross?: string | null;
  signedOutDatetime?: Date | null;
  reactivationType?: string | null;
  reactivationReason?: string | null;
  pathologist?: { firstName: string; lastName: string } | null;
  order: {
    orderId: string;
    patient: { patientId: string; firstName: string; lastName: string; dateOfBirth: Date; sex: string };
    doctor: { firstName: string; lastName: string };
    clinicalHistory?: string | null;
  };
}, reportType: string): ReportLayoutData {
  return {
    reportType,
    caseId: formatOrderIdDisplay(report.order.orderId),
    version: report.versionNumber,
    institutionName: process.env.INSTITUTION_NAME ?? 'Anatomic Pathology Laboratory',
    patient: {
      patientId: report.order.patient.patientId,
      firstName: report.order.patient.firstName,
      lastName: report.order.patient.lastName,
      dateOfBirth: report.order.patient.dateOfBirth.toISOString().slice(0, 10),
      sex: report.order.patient.sex,
    },
    clinician: {
      firstName: report.order.doctor.firstName,
      lastName: report.order.doctor.lastName,
    },
    clinicalHistory: report.order.clinicalHistory,
    gross: report.gross,
    diagnosis: report.diagnosis,
    comment: report.comment,
    reactivationType: report.reactivationType,
    reactivationReason: report.reactivationReason,
    signedOutBy: report.pathologist
      ? `${report.pathologist.lastName}, ${report.pathologist.firstName}`
      : null,
    signedOutDate: report.signedOutDatetime
      ? report.signedOutDatetime.toISOString().slice(0, 10)
      : null,
  };
}


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

    // Wrap "find existing draft -> update OR find latest version -> create v+1" in a
    // Serializable transaction. Concurrent callers will either both update the same
    // existing draft (last-write-wins on text fields, acceptable) or collide on
    // @@unique([orderId, versionNumber]) -> P2002 -> 409 via error middleware.
    //
    // Optimistic locking: if the client provides expectedUpdatedAt (the draft's
    // mtime when they loaded it), we add it to the WHERE clause so two pathologists
    // editing the same draft concurrently can't silently overwrite each other.
    // The loser gets P2025 -> 409 DRAFT_STALE.
    const expected = data.expectedUpdatedAt ? new Date(data.expectedUpdatedAt) : null;
    try {
      return await prisma.$transaction(
        async (tx) => {
          const existingDraft = await tx.report.findFirst({
            where: { orderId, isFinal: false, isPrelim: false },
            orderBy: { versionNumber: 'desc' },
          });

          if (existingDraft) {
            return tx.report.update({
              where: expected
                ? { reportId: existingDraft.reportId, updatedAt: expected }
                : { reportId: existingDraft.reportId },
              data: {
                diagnosis: data.diagnosis,
                comment: data.comment,
                reportTemplateId: data.reportTemplateId,
                gross: data.gross,
                grossPayload: data.grossPayload,
                synopticPayload: data.synopticPayload,
                pathologistEmployeeId: data.pathologistEmployeeId != null
                  ? BigInt(data.pathologistEmployeeId)
                  : undefined,
              },
              include: REPORT_INCLUDE,
            });
          }

          const latestReport = await tx.report.findFirst({
            where: { orderId },
            orderBy: { versionNumber: 'desc' },
          });
          const versionNumber = (latestReport?.versionNumber ?? 0) + 1;

          return tx.report.create({
            data: {
              orderId,
              versionNumber,
              diagnosis: data.diagnosis,
              comment: data.comment,
              reportTemplateId: data.reportTemplateId,
              gross: data.gross,
              grossPayload: data.grossPayload,
              synopticPayload: data.synopticPayload,
              pathologistEmployeeId: data.pathologistEmployeeId != null
                ? BigInt(data.pathologistEmployeeId)
                : undefined,
            },
            include: REPORT_INCLUDE,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025' && expected) {
          throw new AppError(
            409,
            'DRAFT_STALE',
            'Another user updated this draft while you were editing; please reload',
          );
        }
        if (err.code === 'P2002') {
          throw new AppError(
            409,
            'DRAFT_VERSION_CONFLICT',
            'Another user created a draft for this order; please reload',
          );
        }
      }
      throw err;
    }
  }

  async signOut(reportId: number, data: SignOutReportInput): Promise<object> {
    const report = await prisma.report.findUnique({
      where: { reportId: BigInt(reportId) },
      include: REPORT_INCLUDE,
    });
    if (!report) throw new AppError(404, 'NOT_FOUND', `Report ${reportId} not found`);
    if (report.isFinal) throw new AppError(409, 'CONFLICT', 'Report is already signed out and cannot be modified');

    // Workflow guard: every block must have at least one slide AND every H&E ancillary
    // order on this case must be DISTRIBUTED. Prelim reports bypass this (see signPrelim).
    const blocks = await prisma.block.findMany({
      where: { specimen: { orderId: report.orderId }, discarded: false },
      select: {
        blockId: true,
        _count: { select: { slides: { where: { discarded: false } } } },
        ancillaryOrders: {
          where: { orderable: { category: 'HE' } },
          select: { status: true },
        },
      },
    });
    if (blocks.length === 0) {
      throw new AppError(400, 'WORKFLOW', 'Cannot sign out: case has no blocks');
    }
    for (const b of blocks) {
      if (b._count.slides === 0) {
        throw new AppError(400, 'WORKFLOW', `Cannot sign out: block ${b.blockId} has no slides`);
      }
      const heOrders = b.ancillaryOrders;
      if (heOrders.length === 0 || heOrders.some((o) => o.status !== 'DISTRIBUTED')) {
        throw new AppError(
          400,
          'WORKFLOW',
          `Cannot sign out: H&E for block ${b.blockId} is not distributed`,
        );
      }
    }

    const now = new Date();

    // Atomic: flip isFinal and complete the order in a single Serializable txn,
    // guarded by where: { isFinal: false }. Two concurrent sign-outs: only one
    // succeeds; the other gets P2025 -> 409 via error middleware.
    // Optimistic locking: if expectedUpdatedAt is provided, the draft must not
    // have been modified since the client loaded it.
    const expected = data.expectedUpdatedAt ? new Date(data.expectedUpdatedAt) : null;
    const signed = await prisma.$transaction(
      async (tx) => {
        try {
          const updated = await tx.report.update({
            where: expected
              ? { reportId: BigInt(reportId), isFinal: false, updatedAt: expected }
              : { reportId: BigInt(reportId), isFinal: false },
            data: {
              diagnosis: data.diagnosis,
              comment: data.comment,
              reportTemplateId: data.reportTemplateId,
              gross: data.gross,
              grossPayload: data.grossPayload,
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

          await tx.order.update({
            where: { orderId: updated.orderId },
            data: { completedDate: now },
          });

          return updated;
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
            if (expected) {
              throw new AppError(
                409,
                'DRAFT_STALE',
                'Another user updated this draft while you were editing; please reload',
              );
            }
            throw new AppError(
              409,
              'REPORT_ALREADY_FINAL',
              'Report was signed out by another user; please reload',
            );
          }
          throw err;
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    // Generate report PDF — use layout template if one is active for 'final', else fall back to pdf-lib
    try {
      const layout = await layoutConfigService.getLayout('final');
      let pdfBuffer: Buffer | null = null;
      let fileName: string;
      let storagePath: string;

      if (layout?.isActive) {
        const layoutData = buildLayoutData(
          signed as Parameters<typeof buildLayoutData>[0],
          'final'
        );
        pdfBuffer = await pdfLayoutService.renderToPdf(layout.htmlTemplate, layoutData);
        fileName = `report_${reportId}_final.pdf`;
        storagePath = path.join(GENERATED_PDFS_DIR, fileName);
        fs.writeFileSync(storagePath, pdfBuffer);
      } else {
        const fileRecord = await pdfService.generateReportPdf(signed as Parameters<typeof pdfService.generateReportPdf>[0], 'final');
        fileName = fileRecord.fileName;
        storagePath = fileRecord.storagePath;
      }

      await prisma.reportFile.create({
        data: {
          reportId: BigInt(reportId),
          fileType: 'report_pdf',
          fileName,
          originalFileName: fileName,
          mimeType: 'application/pdf',
          storagePath,
        },
      });
    } catch (err) {
      // PDF generation failure should not block sign-out, but must be logged for audit/recovery.
      logger.warn({ err, reportId }, 'Final report PDF generation failed after sign-out');
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

    // Atomic: flip isPrelim, freeze content, and create the next draft (v+1) in
    // one Serializable txn. The guard where: { isPrelim: false, isFinal: false }
    // ensures concurrent prelim/sign-out attempts collide -> P2025 -> 409.
    // The new draft create is inside the txn so it shares the @@unique
    // [orderId, versionNumber] guarantee.
    // Optimistic locking: if expectedUpdatedAt is provided, the draft must not
    // have been modified since the client loaded it.
    const expectedPrelim = data.expectedUpdatedAt ? new Date(data.expectedUpdatedAt) : null;
    const prelim = await prisma.$transaction(
      async (tx) => {
        try {
          const updated = await tx.report.update({
            where: expectedPrelim
              ? { reportId: BigInt(reportId), isPrelim: false, isFinal: false, updatedAt: expectedPrelim }
              : { reportId: BigInt(reportId), isPrelim: false, isFinal: false },
            data: {
              diagnosis: data.diagnosis,
              comment: data.comment,
              reportTemplateId: data.reportTemplateId,
              gross: data.gross,
              grossPayload: data.grossPayload,
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

          // Create the next editable draft inside the same txn.
          await tx.report.create({
            data: {
              orderId: updated.orderId,
              versionNumber: updated.versionNumber + 1,
              diagnosis: updated.diagnosis ?? undefined,
              comment: updated.comment ?? undefined,
              gross: updated.gross ?? undefined,
              grossPayload: updated.grossPayload ?? undefined,
              synopticPayload: updated.synopticPayload ?? undefined,
              reportTemplateId: updated.reportTemplateId ?? undefined,
              pathologistEmployeeId: updated.pathologistEmployeeId ?? undefined,
            },
          });

          return updated;
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError) {
            if (err.code === 'P2025') {
              if (expectedPrelim) {
                throw new AppError(
                  409,
                  'DRAFT_STALE',
                  'Another user updated this draft while you were editing; please reload',
                );
              }
              throw new AppError(
                409,
                'REPORT_ALREADY_SIGNED',
                'Report was signed out by another user; please reload',
              );
            }
            if (err.code === 'P2002') {
              throw new AppError(
                409,
                'DRAFT_VERSION_CONFLICT',
                'Another user created a draft for this order; please reload',
              );
            }
          }
          throw err;
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    // Generate preliminary PDF — use layout template if one is active for 'preliminary', else fall back to pdf-lib
    try {
      const layout = await layoutConfigService.getLayout('preliminary');
      let fileName: string;
      let storagePath: string;

      if (layout?.isActive) {
        const layoutData = buildLayoutData(
          prelim as Parameters<typeof buildLayoutData>[0],
          'preliminary'
        );
        const pdfBuffer = await pdfLayoutService.renderToPdf(layout.htmlTemplate, layoutData);
        fileName = `report_${reportId}_prelim.pdf`;
        storagePath = path.join(GENERATED_PDFS_DIR, fileName);
        fs.writeFileSync(storagePath, pdfBuffer);
      } else {
        const fileRecord = await pdfService.generateReportPdf(
          prelim as Parameters<typeof pdfService.generateReportPdf>[0],
          'preliminary'
        );
        fileName = fileRecord.fileName;
        storagePath = fileRecord.storagePath;
      }

      await prisma.reportFile.create({
        data: {
          reportId: BigInt(reportId),
          fileType: 'prelim_pdf',
          fileName,
          originalFileName: fileName,
          mimeType: 'application/pdf',
          storagePath,
        },
      });
    } catch (err) {
      // PDF generation failure should not block prelim sign-out, but must be logged.
      logger.warn({ err, reportId }, 'Preliminary report PDF generation failed after sign-out');
    }

    return prelim;
  }

  async reactivate(orderId: string, data: ReactivateOrderInput): Promise<object> {
    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', `Order ${orderId} not found`);

    // Atomic: latestFinal lookup + order flip (guarded against double-reactivate)
    // + new draft create, all in one Serializable txn. Two concurrent reactivate
    // calls: only one wins. The other gets P2025 (order guard) or P2002 (version
    // collision) -> 409 via the catch block below.
    try {
      return await prisma.$transaction(
        async (tx) => {
          const latestFinal = await tx.report.findFirst({
            where: { orderId, isFinal: true },
            orderBy: { versionNumber: 'desc' },
          });
          if (!latestFinal) throw new AppError(400, 'BAD_REQUEST', 'Order has no signed-out report to reactivate from');

          await tx.order.update({
            where: { orderId, isReactivated: false },
            data: {
              isReactivated: true,
              reactivatedFromReportId: latestFinal.reportId,
              completedDate: null,
            },
          });

          return tx.report.create({
            data: {
              orderId,
              versionNumber: latestFinal.versionNumber + 1,
              diagnosis: latestFinal.diagnosis ?? undefined,
              comment: latestFinal.comment ?? undefined,
              gross: latestFinal.gross ?? undefined,
              grossPayload: latestFinal.grossPayload ?? undefined,
              synopticPayload: latestFinal.synopticPayload ?? undefined,
              reportTemplateId: latestFinal.reportTemplateId ?? undefined,
              reactivationType: data.reactivationType,
              reactivationReason: data.reactivationReason ?? undefined,
              supersedesReportId: latestFinal.reportId,
            },
            include: REPORT_INCLUDE,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') {
          throw new AppError(
            409,
            'ORDER_ALREADY_REACTIVATED',
            'Order was reactivated by another user; please reload',
          );
        }
        if (err.code === 'P2002') {
          throw new AppError(
            409,
            'DRAFT_VERSION_CONFLICT',
            'Another user created a draft for this order; please reload',
          );
        }
      }
      throw err;
    }
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
