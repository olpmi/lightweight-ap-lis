import { Router, Request, Response, NextFunction } from 'express';
import { SlideService } from '../services/slide.service';
import { requireAuth } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { createSlidesSchema } from '@lis/shared';

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

export default router;
