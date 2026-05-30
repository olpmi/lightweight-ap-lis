import { Router, Request, Response, NextFunction } from 'express';
import { DoctorService } from '../services/doctor.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.middleware.js';

const router: Router = Router();
const service = new DoctorService();

const createDoctorSchema = z.object({
  lastName: z.string().min(1).max(100),
  firstName: z.string().min(1).max(100),
});

// GET /api/doctors/search?q=...
router.get('/search', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length === 0 || q.length > 100) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'q must be 1-100 characters' } });
      return;
    }
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
