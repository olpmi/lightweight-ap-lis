import { Router, Request, Response, NextFunction } from 'express';
import { DoctorService } from '../services/doctor.service';
import { requireAuth } from '../middleware/auth.middleware';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.middleware';

const router = Router();
const service = new DoctorService();

const createDoctorSchema = z.object({
  lastName: z.string().min(1).max(100),
  firstName: z.string().min(1).max(100),
});

// GET /api/doctors/search?q=...
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q ?? '');
    const data = await service.search(q);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/doctors
router.post('/', requireAuth, validateBody(createDoctorSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.create(req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
