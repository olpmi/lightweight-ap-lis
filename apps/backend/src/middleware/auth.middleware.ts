import { Request, Response, NextFunction } from 'express';
import type { EmployeeRoleName } from '@lis/shared';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

/**
 * Requires an authenticated session. Returns 401 if no employee is in the session.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.employeeId) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please log in.',
      },
    });
    return;
  }
  next();
}

function forbidden(res: Response, allowed: readonly EmployeeRoleName[]): void {
  res.status(403).json({
    error: {
      code: 'FORBIDDEN',
      message: `This action requires the ${allowed.join(' or ')} role.`,
    },
  });
}

/**
 * Requires the session's role to be one of `allowed`.
 *
 * Reads the role captured at login, so it costs no query — but a role changed
 * mid-session is not seen until the user logs in again (sessions last 8 hours).
 * Use `requireCurrentRole` where that staleness matters.
 *
 * Always place after `requireAuth`: with no session this reports 403, which
 * would tell an anonymous caller "wrong role" instead of "log in".
 */
export function requireRole(...allowed: EmployeeRoleName[]) {
  return function roleGuard(req: Request, res: Response, next: NextFunction): void {
    const role = req.session?.employeeRole;
    if (!role || !allowed.includes(role as EmployeeRoleName)) {
      forbidden(res, allowed);
      return;
    }
    next();
  };
}

/**
 * As `requireRole`, but re-reads the role from the database rather than trusting
 * the session copy.
 *
 * Reserved for privileged acts — sign-out, amendment, configuration, account
 * provisioning — where a revoked or downgraded role has to take effect at once
 * rather than whenever the user's 8-hour session happens to expire.
 *
 * Middleware runs outside the route handlers' try/catch, so this catches its own
 * errors and forwards them to `next`.
 */
export function requireCurrentRole(...allowed: EmployeeRoleName[]) {
  return async function currentRoleGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employeeId = req.session?.employeeId;
      if (employeeId == null) {
        forbidden(res, allowed);
        return;
      }

      const employee = await prisma.employee.findUnique({
        where: { employeeId: BigInt(employeeId) },
        select: { employeeRole: { select: { roleName: true } } },
      });

      const roleName = employee?.employeeRole?.roleName;
      if (!roleName || !allowed.includes(roleName as EmployeeRoleName)) {
        forbidden(res, allowed);
        return;
      }

      // Keep the session in step so UI gating driven by GET /api/auth/me does not
      // continue to show controls the server has just started rejecting.
      if (req.session.employeeRole !== roleName) {
        req.session.employeeRole = roleName;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Logs each request at debug level.
 */
export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  logger.debug({ method: req.method, url: req.url }, 'Incoming request');
  next();
}
