import { Router, Request, Response, NextFunction } from 'express';
import { PatientService } from '../services/patient.service';
import { requireAuth } from '../middleware/auth.middleware';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.middleware';

const router = Router();
const service = new PatientService();

const createPatientSchema = z.object({
  patientId: z.string().min(1).max(50),
  lastName: z.string().min(1).max(100),
  firstName: z.string().min(1).max(100),
  dateOfBirth: z.string(),
  sex: z.string().max(20),
});

// GET /api/patients/search?q=...
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q ?? '');
    const data = await service.search(q);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/patients
router.post('/', requireAuth, validateBody(createPatientSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.create(req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
