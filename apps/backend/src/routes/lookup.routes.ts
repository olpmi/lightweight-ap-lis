import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { ReportService } from '../services/report.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { APP_LANGUAGE_CODES, createDraftReportSchema, reactivateOrderSchema, type AppLanguageCode } from '@lis/shared';
import { getTemplateDefinition, listTemplateCatalog } from '@lis/shared/templates/server';
import { AppError } from '../middleware/error.middleware.js';

const router = Router();
const reportService = new ReportService();

function resolveLanguage(req: Request): AppLanguageCode {
  const requested = typeof req.query.language === 'string'
    ? req.query.language
    : req.session.employeeDefaultLanguage;

  return APP_LANGUAGE_CODES.includes(requested as AppLanguageCode)
    ? (requested as AppLanguageCode)
    : 'en';
}

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

// GET /api/lookups/template-catalog?language=fr&kind=reporting
router.get('/template-catalog', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const language = resolveLanguage(req);
    const requestedKind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
    const data = listTemplateCatalog(language).filter((entry) => (
      requestedKind === 'gross' || requestedKind === 'reporting'
        ? entry.kind === requestedKind
        : true
    ));

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/lookups/template-definition?templateKey=...&language=fr
router.get('/template-definition', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const templateKey = typeof req.query.templateKey === 'string' ? req.query.templateKey : '';
    if (!templateKey) {
      throw new AppError(400, 'BAD_REQUEST', 'templateKey query parameter is required');
    }

    const language = resolveLanguage(req);
    const data = getTemplateDefinition(templateKey, language);
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
