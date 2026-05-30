import { Router, Request, Response, NextFunction } from 'express';
import { SlideService } from '../services/slide.service.js';
import { BlockService } from '../services/block.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { createSlidesSchema } from '@lis/shared';

const router: Router = Router();
const slideService = new SlideService();
const blockService = new BlockService();

// POST /api/blocks/:blockId/slides
router.post('/:blockId/slides', requireAuth, validateBody(createSlidesSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await slideService.createSlides(req.params.blockId, req.body.count, req.body.slideType);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/blocks/:blockId/discard
router.patch('/:blockId/discard', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await blockService.discardBlock(req.params.blockId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/blocks/:blockId/slides/:slideId/discard
router.patch('/:blockId/slides/:slideId/discard', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await slideService.discardSlide(req.params.blockId, req.params.slideId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
