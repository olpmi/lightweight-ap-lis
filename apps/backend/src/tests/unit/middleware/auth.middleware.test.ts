import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../../middleware/auth.middleware.js';

function makeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res as Response);
  res.json = vi.fn().mockReturnValue(res as Response);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe('requireAuth', () => {
  it('returns 401 when session is missing', () => {
    const req = {} as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: expect.stringMatching(/log in/i) },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when session has no employeeId', () => {
    const req = { session: {} } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when an employeeId is present on the session', () => {
    const req = { session: { employeeId: 42 } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
