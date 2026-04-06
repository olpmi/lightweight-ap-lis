import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { ReportService } from '../services/report.service.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { createDraftReportSchema, reactivateOrderSchema } from '@lis/shared';
import fs from 'fs';
import { AppError } from '../middleware/error.middleware.js';

const router = Router();
const reportService = new ReportService();

// GET /api/report-files/:reportFileId/download
router.get('/:reportFileId/download', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = await prisma.reportFile.findUnique({
      where: { reportFileId: BigInt(req.params.reportFileId) },
    });
    if (!file || !file.storagePath || !fs.existsSync(file.storagePath)) {
      throw new AppError(404, 'NOT_FOUND', 'File not found');
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName ?? 'download.pdf'}"`);
    fs.createReadStream(file.storagePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;
