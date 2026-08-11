import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { EMPLOYEE_ROLES, createReportTemplateSchema, updateReportTemplateSchema, REPORT_TEMPLATE_TYPES, type ReportTemplateType } from '@lis/shared';
import { ConfigReportTemplateService } from '../services/config.reportTemplate.service.js';

const router: Router = Router();
const service = new ConfigReportTemplateService();

// Reads stay open to any authenticated user — the application itself loads
// templates to render reports. Writes are administrative.
const requireAdmin = requireRole(EMPLOYEE_ROLES.ADMINISTRATOR);

// GET /api/config/report-templates[?type=final|preliminary|addendum|revision]
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const rawType = typeof req.query.type === 'string' ? req.query.type : undefined;
    const type: ReportTemplateType | undefined =
      rawType && (REPORT_TEMPLATE_TYPES as readonly string[]).includes(rawType)
        ? (rawType as ReportTemplateType)
        : undefined;
    const data = await service.listReportTemplates(type);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/config/report-templates
router.post('/', requireAuth, requireAdmin, validateBody(createReportTemplateSchema), async (req, res, next) => {
  try {
    const data = await service.createReportTemplate(req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/config/report-templates/:id
router.put('/:id', requireAuth, requireAdmin, validateBody(updateReportTemplateSchema), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const data = await service.updateReportTemplate(id, req.body);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/config/report-templates/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    await service.deleteReportTemplate(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
