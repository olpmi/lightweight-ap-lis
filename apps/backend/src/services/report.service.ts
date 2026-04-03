import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';
import { CreateDraftReportInput, SignOutReportInput, ReactivateOrderInput } from '@lis/shared';
import { PdfService } from './pdf.service';

const pdfService = new PdfService();

const REPORT_INCLUDE = {
  pathologist: { include: { employeeRole: true } },
  reportTemplate: true,
  reportFiles: true,
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

    // Check if there's already an unsigned draft
    const existingDraft = await prisma.report.findFirst({
      where: { orderId, isFinal: false },
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
          synopticData: data.synopticData,
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
        synopticData: data.synopticData,
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
        synopticData: data.synopticData,
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

    // Generate report PDF
    try {
      const reportFileRecord = await pdfService.generateReportPdf(signed as Parameters<typeof pdfService.generateReportPdf>[0]);
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
        synopticData: latestFinal.synopticData ?? undefined,
        reportTemplateId: latestFinal.reportTemplateId ?? undefined,
        reactivationType: data.reactivationType,
        supersedesReportId: latestFinal.reportId,
      },
      include: REPORT_INCLUDE,
    });

    return newDraft;
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
