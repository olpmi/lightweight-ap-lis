import { Router, Request, Response, NextFunction } from 'express';
import { BlockService } from '../services/block.service';
import { requireAuth } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { createBlocksSchema } from '@lis/shared';

const router = Router();
const service = new BlockService();

// POST /api/specimens/:specimenId/blocks
router.post('/:specimenId/blocks', requireAuth, validateBody(createBlocksSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.createBlocks(req.params.specimenId, req.body.count);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
