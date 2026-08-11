import { Router, Request, Response, NextFunction } from 'express';
import { EmployeeService } from '../services/employee.service.js';
import { requireAuth, requireCurrentRole } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import {
  EMPLOYEE_ROLES,
  createEmployeeSchema,
  updateEmployeeLanguageSchema,
  updateEmployeeRoleSchema,
} from '@lis/shared';

const router: Router = Router();
const service = new EmployeeService();

// GET /api/employees/search?q=...
//
// Unauthenticated by necessity: the login page searches for an account before a
// session exists. It therefore discloses the staff roster to anyone who can reach
// the API, which is why the service returns only the fields login needs — no
// role, no password hash.
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
//
// Two distinct paths behind one route:
//   - No accounts yet: anyone may create the first, and it is forced to
//     Administrator. This is how a fresh production database, which ships with
//     reference data and no staff, gets its first login.
//   - Any account exists: Administrator only.
//
// Without the first-run restriction every role guard in the application is
// decorative, since an anonymous caller could simply mint a privileged account.
router.post('/', validateBody(createEmployeeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (await service.isBootstrapAvailable()) {
      const data = await service.createFirstAdministrator(req.body);
      res.status(201).json({ data });
      return;
    }

    if (!req.session?.employeeId) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required. Please log in.' },
      });
      return;
    }

    if ((await service.findRoleName(req.session.employeeId)) !== EMPLOYEE_ROLES.ADMINISTRATOR) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `This action requires the ${EMPLOYEE_ROLES.ADMINISTRATOR} role.`,
        },
      });
      return;
    }

    const data = await service.create(req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/employees/:id/role
//
// Roles are unchangeable without this: the seed and reference-data migrations set
// them, and nothing else could. Administrator-only, and re-read from the database
// rather than the session so a just-revoked administrator cannot use a live
// session to restore themselves.
router.patch(
  '/:id/role',
  requireAuth,
  requireCurrentRole(EMPLOYEE_ROLES.ADMINISTRATOR),
  validateBody(updateEmployeeRoleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await service.updateRole(parseInt(req.params.id), req.body.roleName);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

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
