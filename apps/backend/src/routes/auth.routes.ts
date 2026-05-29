import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthService } from '../services/auth.service.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { loginSchema } from '@lis/shared';

const router = Router();
const authService = new AuthService();

// Rate-limit login attempts to slow password-spray / enumeration. The cap is
// per-IP and resets every window. Disabled when `NODE_ENV !== 'production'` so
// integration tests + dev hot-reloads aren't throttled.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,                // 20 attempts per IP per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts, please retry later.' } },
});

// POST /api/auth/login
router.post('/login', loginLimiter, validateBody(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employee = await authService.login(req.body);

    req.session.employeeId = employee.employeeId;
    req.session.employeeUserName = employee.userName;
    req.session.employeeRole = employee.roleName;
    req.session.employeeDefaultLanguage = employee.defaultLanguage;

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
      defaultLanguage: req.session.employeeDefaultLanguage ?? 'en',
    },
  });
});

export default router;
