import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { createAncillaryOrdersBatchSchema, updateAncillaryOrderStatusSchema } from '@lis/shared';
import { AncillaryService } from '../services/ancillary.service.js';

const router = Router();
const service = new AncillaryService();

// GET /api/ancillary/queue[?statuses=PENDING,IN_PROGRESS&category=IHC]
router.get('/queue', requireAuth, async (req, res, next) => {
  try {
    const statuses =
      typeof req.query.statuses === 'string' && req.query.statuses
        ? req.query.statuses.split(',').map((s) => s.trim())
        : ['PENDING', 'IN_PROGRESS'];
    const category =
      typeof req.query.category === 'string' && req.query.category
        ? req.query.category
        : undefined;
    const data = await service.getQueue({ statuses, category });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/ancillary/orders?orderId=SU2600001
router.get('/orders', requireAuth, async (req, res, next) => {
  try {
    const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : undefined;
    if (!orderId) {
      res.status(400).json({ error: 'orderId query parameter is required' });
      return;
    }
    const data = await service.getOrdersByCase(orderId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/ancillary/orders/block-counts?orderId=SU2600001
router.get('/orders/block-counts', requireAuth, async (req, res, next) => {
  try {
    const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : undefined;
    if (!orderId) {
      res.status(400).json({ error: 'orderId query parameter is required' });
      return;
    }
    const data = await service.getBlockOrderCounts(orderId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/ancillary/orders  — batch creation
router.post(
  '/orders',
  requireAuth,
  validateBody(createAncillaryOrdersBatchSchema),
  async (req, res, next) => {
    try {
      const session = req.session as { employeeId?: number };
      const data = await service.createBatchOrders(
        req.body.orders,
        session.employeeId,
      );
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/ancillary/orders/:id/status
router.patch(
  '/orders/:id/status',
  requireAuth,
  validateBody(updateAncillaryOrderStatusSchema),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid id' });
        return;
      }
      const data = await service.updateStatus(id, req.body);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
