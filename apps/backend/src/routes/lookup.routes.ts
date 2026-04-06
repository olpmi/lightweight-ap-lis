import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { ReportService } from '../services/report.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { createDraftReportSchema, reactivateOrderSchema } from '@lis/shared';

const router = Router();
const reportService = new ReportService();

// GET /api/lookups/body-sites
router.get('/body-sites', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await prisma.bodySite.findMany({ orderBy: { bodySiteName: 'asc' } });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/lookups/specimen-types
router.get('/specimen-types', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await prisma.specimenType.findMany({ orderBy: { specimenTypeName: 'asc' } });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/lookups/report-templates
router.get('/report-templates', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await prisma.reportTemplate.findMany({
      where: { isActive: true },
      orderBy: { templateName: 'asc' },
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/lookups/employee-roles
router.get('/employee-roles', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await prisma.employeeRole.findMany({ orderBy: { roleName: 'asc' } });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
