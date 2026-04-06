import { Router, Request, Response, NextFunction } from 'express';
import { SlideService } from '../services/slide.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { createSlidesSchema } from '@lis/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';

const router = Router();
const service = new SlideService();

// POST /api/blocks/:blockId/slides
router.post('/:blockId/slides', requireAuth, validateBody(createSlidesSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.createSlides(req.params.blockId, req.body.count, req.body.slideType);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/blocks/:blockId
router.delete('/:blockId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const block = await prisma.block.findUnique({ where: { blockId: req.params.blockId } });
    if (!block) throw new AppError(404, 'NOT_FOUND', 'Block not found');
    await prisma.slide.deleteMany({ where: { blockId: req.params.blockId } });
    await prisma.block.delete({ where: { blockId: req.params.blockId } });
    res.json({ data: { deleted: req.params.blockId } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/blocks/:blockId/slides/:slideId
router.delete('/:blockId/slides/:slideId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slide = await prisma.slide.findUnique({ where: { slideId: req.params.slideId } });
    if (!slide) throw new AppError(404, 'NOT_FOUND', 'Slide not found');
    await prisma.slide.delete({ where: { slideId: req.params.slideId } });
    res.json({ data: { deleted: req.params.slideId } });
  } catch (err) {
    next(err);
  }
});

export default router;
