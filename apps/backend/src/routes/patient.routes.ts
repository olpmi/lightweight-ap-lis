import { Router, Request, Response, NextFunction } from 'express';
import { PatientService } from '../services/patient.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.middleware.js';

const router: Router = Router();
const service = new PatientService();

const createPatientSchema = z.object({
  patientId: z.string().min(1).max(50),
  lastName: z.string().min(1).max(100),
  firstName: z.string().min(1).max(100),
  dateOfBirth: z.string(),
  sex: z.string().max(20),
});

// GET /api/patients/search?q=...
router.get('/search', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q ?? '').trim();
    // An empty q lists the first page instead of erroring — the typeahead fires
    // this the moment the field is focused, and a 400 there left the dropdown
    // showing "No options" on a deployment whose patients had just been
    // imported. See PatientService.search.
    if (q.length > 100) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'q must be 100 characters or fewer' } });
      return;
    }
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
