import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { ReportService } from '../services/report.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { APP_LANGUAGE_CODES, createDraftReportSchema, reactivateOrderSchema, type AppLanguageCode, PATIENT_SUMMARY_LANGUAGE_CODES, resolvePatientSummary, type PatientSummaryLanguageCode } from '@lis/shared';
import { getTemplateDefinition, listTemplateCatalog } from '@lis/shared/templates/server';
import { getPatientSummaryDefinition, listPatientSummaryCatalog } from '@lis/shared/patient-summaries/server';
import { AppError } from '../middleware/error.middleware.js';

const router: Router = Router();
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

// GET /api/lookups/patient-summary-definition?templateId=...&language=sw
router.get('/patient-summary-definition', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const templateId = typeof req.query.templateId === 'string' ? req.query.templateId : '';
    if (!templateId) {
      throw new AppError(400, 'BAD_REQUEST', 'templateId query parameter is required');
    }

    const language = resolveLanguage(req);

    try {
      const data = getPatientSummaryDefinition(templateId, language);
      res.json({ data });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Patient summary not found')) {
        throw new AppError(404, 'NOT_FOUND', error.message);
      }

      throw error;
    }
  } catch (err) {
    next(err);
  }
});

// GET /api/lookups/patient-summary-catalog?language=en
router.get('/patient-summary-catalog', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const language = resolveLanguage(req);
    const data = listPatientSummaryCatalog(language);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/lookups/patient-summary-resolve
router.post('/patient-summary-resolve', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { templateId, language, values } = req.body as {
      templateId?: unknown;
      language?: unknown;
      values?: unknown;
    };

    if (typeof templateId !== 'string' || !templateId) {
      throw new AppError(400, 'BAD_REQUEST', 'templateId is required');
    }

    const resolvedLanguage: PatientSummaryLanguageCode =
      PATIENT_SUMMARY_LANGUAGE_CODES.includes(language as PatientSummaryLanguageCode)
        ? (language as PatientSummaryLanguageCode)
        : 'en';

    if (typeof values !== 'object' || values === null || Array.isArray(values)) {
      throw new AppError(400, 'BAD_REQUEST', 'values must be an object');
    }

    let definition;
    try {
      definition = getPatientSummaryDefinition(templateId, resolvedLanguage);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Patient summary not found')) {
        throw new AppError(404, 'NOT_FOUND', error.message);
      }
      throw error;
    }

    const data = resolvePatientSummary(definition, values as Record<string, string | string[]>);
    res.json({ data: data ?? null });
  } catch (err) {
    next(err);
  }
});

// GET /api/lookups/employee-roles
//
// Authenticated as of role-based authorization: this list supplied the valid
// employeeRoleId values that unauthenticated account creation needed, and the
// bootstrap path no longer offers a role choice (the first account is always an
// Administrator), so nothing pre-login needs it.
router.get('/employee-roles', requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await prisma.employeeRole.findMany({ orderBy: { roleName: 'asc' } });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
