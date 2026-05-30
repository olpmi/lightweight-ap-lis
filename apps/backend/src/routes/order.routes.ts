import { Router, Request, Response, NextFunction } from 'express';
import { OrderService } from '../services/order.service.js';
import { QueueService } from '../services/queue.service.js';
import { PdfService } from '../services/pdf.service.js';
import { OrderLockService } from '../services/orderLock.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { createOrderSchema, normalizeOrderId } from '@lis/shared';
import { prisma } from '../lib/prisma.js';
import fs from 'fs';
import { GENERATED_PDFS_DIR } from '../utils/storageDirs.js';
import path from 'path';

const router: Router = Router();
const orderService = new OrderService();
const queueService = new QueueService();
const pdfService = new PdfService();
const lockService = new OrderLockService();

// GET /api/orders/processing-queue
router.get('/processing-queue', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query.page ?? '1'));
    const pageSize = parseInt(String(req.query.pageSize ?? '20'));
    const showAll = req.query.showAll === 'true';
    const search = String(req.query.search ?? '');
    const data = await queueService.getProcessingQueue(page, pageSize, showAll, search);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/histology-queue
router.get('/histology-queue', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query.page ?? '1'));
    const pageSize = parseInt(String(req.query.pageSize ?? '50'));
    const search = String(req.query.search ?? '');
    const data = await queueService.getHistologyQueue(page, pageSize, search);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/result-queue
router.get('/result-queue', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query.page ?? '1'));
    const pageSize = parseInt(String(req.query.pageSize ?? '20'));
    const search = String(req.query.search ?? '');
    const data = await queueService.getResultQueue(page, pageSize, search);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/query
router.get('/query', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.query.orderId ? normalizeOrderId(String(req.query.orderId)) : undefined;
    const patientId = req.query.patientId ? String(req.query.patientId) : undefined;
    const page = parseInt(String(req.query.page ?? '1'));
    const pageSize = parseInt(String(req.query.pageSize ?? '20'));
    const data = await orderService.query({ orderId, patientId, page, pageSize });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/orders
router.post('/', requireAuth, validateBody(createOrderSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await orderService.create(req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders (list, paginated)
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query.page ?? '1'));
    const pageSize = parseInt(String(req.query.pageSize ?? '20'));
    const data = await orderService.list(page, pageSize);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orders/:orderId/clinical-history
router.patch('/:orderId/clinical-history', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clinicalHistory } = req.body;
    await prisma.order.update({
      where: { orderId: req.params.orderId },
      data: { clinicalHistory: clinicalHistory ?? null },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:orderId
router.get('/:orderId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await orderService.findById(req.params.orderId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
// --- Edit lock --------------------------------------------------------------
//
// Lease-based pessimistic lock so two users can't both edit the same case's
// result/draft simultaneously. The client acquires on mount, heartbeats while
// it stays mounted, and releases on unmount. Other clients see the holder's
// name and render the page read-only.

// POST /api/orders/:orderId/lock â€” acquire or refresh
router.post('/:orderId/lock', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.session.employeeId!;
    const employeeName = `${req.session.employeeUserName ?? ''}`.trim() || `User ${employeeId}`;
    const data = await lockService.acquire(req.params.orderId, Number(employeeId), employeeName);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:orderId/lock â€” read current state (used by polling readers)
router.get('/:orderId/lock', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.session.employeeId!;
    const data = await lockService.getState(req.params.orderId, Number(employeeId));
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/orders/:orderId/lock â€” release (only if requester is holder)
router.delete('/:orderId/lock', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.session.employeeId!;
    await lockService.release(req.params.orderId, Number(employeeId));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
// GET /api/orders/:orderId/materials
router.get('/:orderId/materials', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await queueService.getOrderMaterials(req.params.orderId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:orderId/worksheet-pdf
router.get('/:orderId/worksheet-pdf', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderId: req.params.orderId },
      include: {
        patient: true,
        doctor: true,
        specimens: { include: { bodySite: true, specimenType: true } },
      },
    });

    const { fileName, storagePath } = await pdfService.generateWorksheetPdf(order);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    fs.createReadStream(storagePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:orderId/reference-strips-pdf
router.get('/:orderId/reference-strips-pdf', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const specimens = await prisma.specimen.findMany({
      where: { orderId: req.params.orderId },
      include: {
        bodySite: true,
        blocks: {
          orderBy: { blockNumber: 'asc' },
          include: { slides: { orderBy: { slideNumber: 'asc' } } },
        },
      },
      orderBy: { specimenCode: 'asc' },
    });

    const { fileName, storagePath } = await pdfService.generateReferenceStripsPdf(req.params.orderId, specimens);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    fs.createReadStream(storagePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;
