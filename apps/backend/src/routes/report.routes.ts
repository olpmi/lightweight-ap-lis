import { Router, Request, Response, NextFunction } from 'express';
import { ReportService } from '../services/report.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { APP_LANGUAGE_CODES, createDraftReportSchema, signOutReportSchema, reactivateOrderSchema, type AppLanguageCode } from '@lis/shared';
import { prisma } from '../lib/prisma.js';
import fs from 'fs';
import { AppError } from '../middleware/error.middleware.js';

const router = Router();
const service = new ReportService();

function parseReportId(raw: string): number {
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'BAD_REQUEST', `Invalid reportId: ${raw}`);
  }
  return id;
}

function resolveLanguage(req: Request): AppLanguageCode {
  const requested = typeof req.query.language === 'string'
    ? req.query.language
    : req.session.employeeDefaultLanguage;

  return APP_LANGUAGE_CODES.includes(requested as AppLanguageCode)
    ? (requested as AppLanguageCode)
    : 'en';
}

// GET /api/orders/:orderId/reports  (mounted on /api/orders in app.ts via re-use)
// We mount this on /api/reports instead and handle all variants here

// GET /api/reports/:reportId/pdf
router.get('/:reportId/pdf', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = parseReportId(req.params.reportId);
    const report = await prisma.report.findUnique({
      where: { reportId: BigInt(reportId) },
      include: {
        reportFiles: {
          where: { fileType: { in: ['report_pdf', 'prelim_pdf', 'amended_pdf'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!report) throw new AppError(404, 'NOT_FOUND', `Report ${req.params.reportId} not found`);

    const file = report.reportFiles[0];
    if (!file?.storagePath || !fs.existsSync(file.storagePath)) {
      throw new AppError(404, 'NOT_FOUND', 'Report PDF not found. It may not have been generated yet.');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName ?? 'report.pdf'}"`);
    fs.createReadStream(file.storagePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/:reportId/patient-summary.pdf?language=sw
router.get('/:reportId/patient-summary.pdf', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = parseReportId(req.params.reportId);
    const language = resolveLanguage(req);
    const { fileName, pdfBytes } = await service.renderPatientSummaryPdf(reportId, language);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    next(err);
  }
});

// POST /api/reports/:reportId/signout
router.post('/:reportId/signout', requireAuth, validateBody(signOutReportSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = parseReportId(req.params.reportId);
    const data = await service.signOut(reportId, req.body);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/reports/:reportId/signprelim
router.post('/:reportId/signprelim', requireAuth, validateBody(signOutReportSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = parseReportId(req.params.reportId);
    const data = await service.signPrelim(reportId, req.body);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
