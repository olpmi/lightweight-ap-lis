import { Router, Request, Response, NextFunction } from 'express';
import { ReportService } from '../services/report.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { createDraftReportSchema, signOutReportSchema, reactivateOrderSchema } from '@lis/shared';
import { prisma } from '../lib/prisma.js';
import fs from 'fs';
import { AppError } from '../middleware/error.middleware.js';

const router = Router();
const service = new ReportService();

// GET /api/orders/:orderId/reports  (mounted on /api/orders in app.ts via re-use)
// We mount this on /api/reports instead and handle all variants here

// GET /api/reports/:reportId/pdf
router.get('/:reportId/pdf', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await prisma.report.findUnique({
      where: { reportId: BigInt(req.params.reportId) },
      include: { reportFiles: { orderBy: { createdAt: 'desc' }, take: 1 } },
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

// POST /api/reports/:reportId/signout
router.post('/:reportId/signout', requireAuth, validateBody(signOutReportSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.signOut(parseInt(req.params.reportId), req.body);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/reports/:reportId/signprelim
router.post('/:reportId/signprelim', requireAuth, validateBody(signOutReportSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.signPrelim(parseInt(req.params.reportId), req.body);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
