import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { createReportTemplateSchema, updateReportTemplateSchema } from '@lis/shared';
import { ConfigReportTemplateService } from '../services/config.reportTemplate.service.js';

const router = Router();
const service = new ConfigReportTemplateService();

// GET /api/config/report-templates[?type=final|preliminary|addendum|revision]
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const data = await service.listReportTemplates(type);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/config/report-templates
router.post('/', requireAuth, validateBody(createReportTemplateSchema), async (req, res, next) => {
  try {
    const data = await service.createReportTemplate(req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/config/report-templates/:id
router.put('/:id', requireAuth, validateBody(updateReportTemplateSchema), async (req, res, next) => {
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
router.delete('/:id', requireAuth, async (req, res, next) => {
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
