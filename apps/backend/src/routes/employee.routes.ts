import { Router, Request, Response, NextFunction } from 'express';
import { EmployeeService } from '../services/employee.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { createEmployeeSchema, updateEmployeeLanguageSchema } from '@lis/shared';

const router: Router = Router();
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

// PATCH /api/employees/:id/language
router.patch('/:id/language', requireAuth, validateBody(updateEmployeeLanguageSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employeeId = parseInt(req.params.id);
    // Only allow employees to update their own language preference
    if (req.session.employeeId !== employeeId) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You can only update your own language preference' } });
      return;
    }
    await service.updateLanguage(employeeId, req.body.language);
    req.session.employeeDefaultLanguage = req.body.language;
    res.json({ data: { language: req.body.language } });
  } catch (err) {
    next(err);
  }
});

export default router;
