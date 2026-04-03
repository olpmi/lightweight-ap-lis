import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

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

/**
 * Logs each request at debug level.
 */
export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  logger.debug({ method: req.method, url: req.url }, 'Incoming request');
  next();
}
