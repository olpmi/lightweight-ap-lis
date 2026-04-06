import { Router, Request, Response, NextFunction } from 'express';
import { EmployeeService } from '../services/employee.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { createEmployeeSchema } from '@lis/shared';

const router = Router();
const service = new EmployeeService();

// GET /api/employees/search?q=...
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q ?? '');
    const data = await service.search(q);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/employees
router.post('/', validateBody(createEmployeeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.create(req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/employees/:id
router.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.findById(parseInt(req.params.id));
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
