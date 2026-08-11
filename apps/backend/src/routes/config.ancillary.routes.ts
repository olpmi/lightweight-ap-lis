import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import {
  EMPLOYEE_ROLES,
  createAncillaryOrderableSchema,
  updateAncillaryOrderableSchema,
  createAncillaryPanelSchema,
  updateAncillaryPanelSchema,
} from '@lis/shared';
import { ConfigAncillaryService } from '../services/config.ancillary.service.js';

const router: Router = Router();
const service = new ConfigAncillaryService();

// Reads stay open to any authenticated user — ordering screens need the
// catalog. Editing the catalog is administrative.
const requireAdmin = requireRole(EMPLOYEE_ROLES.ADMINISTRATOR);

// ---------------------------------------------------------------------------
// Orderables
// ---------------------------------------------------------------------------

// GET /api/config/ancillary/orderables
router.get('/orderables', requireAuth, async (_req, res, next) => {
  try {
    const data = await service.listOrderables();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/config/ancillary/orderables
router.post('/orderables', requireAuth, requireAdmin, validateBody(createAncillaryOrderableSchema), async (req, res, next) => {
  try {
    const data = await service.createOrderable(req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/config/ancillary/orderables/:id
router.put('/orderables/:id', requireAuth, requireAdmin, validateBody(updateAncillaryOrderableSchema), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
    const data = await service.updateOrderable(id, req.body);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/config/ancillary/orderables/:id
router.delete('/orderables/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
    await service.deleteOrderable(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

// GET /api/config/ancillary/panels
router.get('/panels', requireAuth, async (_req, res, next) => {
  try {
    const data = await service.listPanels();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/config/ancillary/panels
router.post('/panels', requireAuth, requireAdmin, validateBody(createAncillaryPanelSchema), async (req, res, next) => {
  try {
    const data = await service.createPanel(req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/config/ancillary/panels/:id
router.put('/panels/:id', requireAuth, requireAdmin, validateBody(updateAncillaryPanelSchema), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
    const data = await service.updatePanel(id, req.body);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/config/ancillary/panels/:id
router.delete('/panels/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
    await service.deletePanel(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
