import { Router, Request, Response, NextFunction } from 'express';
import { ReportService } from '../services/report.service.js';
import { requireAuth, requireCurrentRole } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { APP_LANGUAGE_CODES, EMPLOYEE_ROLES, createDraftReportSchema, signOutReportSchema, reactivateOrderSchema, type AppLanguageCode } from '@lis/shared';
import { prisma } from '../lib/prisma.js';
import fs from 'fs';
import { AppError } from '../middleware/error.middleware.js';

const router: Router = Router();
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

// GET /api/reports/:reportId/patient-summary.pdf?language=sw&download=1
router.get('/:reportId/patient-summary.pdf', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = parseReportId(req.params.reportId);
    const language = resolveLanguage(req);
    const { fileName, pdfBytes } = await service.renderPatientSummaryPdf(reportId, language);
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    next(err);
  }
});

/**
 * Sign-out attributes the diagnosis to `pathologistEmployeeId` from the request
 * body, not the session — the session is passed separately, and only for the edit
 * lock. A role gate alone would therefore still let one pathologist sign a report
 * out under a colleague's name. Requiring the two to agree makes the recorded
 * signatory the person who actually authenticated.
 */
function assertSelfAttributed(req: Request, res: Response): boolean {
  const claimed = Number(req.body?.pathologistEmployeeId);
  if (claimed !== req.session.employeeId) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'A report may only be signed out under the signing pathologist’s own account.',
      },
    });
    return false;
  }
  return true;
}

// POST /api/reports/:reportId/signout
router.post(
  '/:reportId/signout',
  requireAuth,
  requireCurrentRole(EMPLOYEE_ROLES.PATHOLOGIST),
  validateBody(signOutReportSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!assertSelfAttributed(req, res)) return;
      const reportId = parseReportId(req.params.reportId);
      const data = await service.signOut(reportId, req.body, req.session.employeeId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/reports/:reportId/signprelim
router.post(
  '/:reportId/signprelim',
  requireAuth,
  requireCurrentRole(EMPLOYEE_ROLES.PATHOLOGIST),
  validateBody(signOutReportSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!assertSelfAttributed(req, res)) return;
      const reportId = parseReportId(req.params.reportId);
      const data = await service.signPrelim(reportId, req.body, req.session.employeeId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
