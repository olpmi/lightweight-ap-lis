import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import {
  createAncillaryOrderableSchema,
  updateAncillaryOrderableSchema,
  createAncillaryPanelSchema,
  updateAncillaryPanelSchema,
} from '@lis/shared';
import { ConfigAncillaryService } from '../services/config.ancillary.service.js';

const router = Router();
const service = new ConfigAncillaryService();

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
router.post('/orderables', requireAuth, validateBody(createAncillaryOrderableSchema), async (req, res, next) => {
  try {
    const data = await service.createOrderable(req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/config/ancillary/orderables/:id
router.put('/orderables/:id', requireAuth, validateBody(updateAncillaryOrderableSchema), async (req, res, next) => {
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
router.delete('/orderables/:id', requireAuth, async (req, res, next) => {
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
router.post('/panels', requireAuth, validateBody(createAncillaryPanelSchema), async (req, res, next) => {
  try {
    const data = await service.createPanel(req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/config/ancillary/panels/:id
router.put('/panels/:id', requireAuth, validateBody(updateAncillaryPanelSchema), async (req, res, next) => {
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
router.delete('/panels/:id', requireAuth, async (req, res, next) => {
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
