import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { loginSchema } from '@lis/shared';

const router = Router();
const authService = new AuthService();

// POST /api/auth/login
router.post('/login', validateBody(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employee = await authService.login(req.body);

    req.session.employeeId = employee.employeeId;
    req.session.employeeUserName = employee.userName;
    req.session.employeeRole = employee.roleName;

    res.json({ data: employee });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response, next: NextFunction) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ data: { message: 'Logged out' } });
  });
});

// GET /api/auth/me
router.get('/me', async (req: Request, res: Response) => {
  if (!req.session?.employeeId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }
  res.json({
    data: {
      employeeId: req.session.employeeId,
      userName: req.session.employeeUserName,
      role: req.session.employeeRole,
    },
  });
});

export default router;
