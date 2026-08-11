/**
 * Unit tests for the role guards.
 *
 * `requireRole` is pure and needs no database. `requireCurrentRole` re-reads the
 * role, so the Prisma client is mocked — the point under test is the decision it
 * makes about the row it gets back, not the query.
 *
 * Follows the shape of auth.middleware.test.ts: a hand-built `req.session`, the
 * local `makeRes()` mock, and assertions on `res.status` / `res.json` / `next`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { EMPLOYEE_ROLES } from '@lis/shared';

const findUnique = vi.fn();
vi.mock('../../../lib/prisma.js', () => ({
  prisma: { employee: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

const { requireRole, requireCurrentRole } = await import('../../../middleware/auth.middleware.js');

function makeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res as Response);
  res.json = vi.fn().mockReturnValue(res as Response);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

function reqWith(session: Record<string, unknown> | undefined): Request {
  return { session } as unknown as Request;
}

beforeEach(() => {
  findUnique.mockReset();
});

describe('requireRole', () => {
  it('calls next() when the session role is allowed', () => {
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireRole(EMPLOYEE_ROLES.PATHOLOGIST)(
      reqWith({ employeeId: 1, employeeRole: EMPLOYEE_ROLES.PATHOLOGIST }),
      res,
      next
    );

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 FORBIDDEN when the session holds a different role', () => {
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireRole(EMPLOYEE_ROLES.PATHOLOGIST)(
      reqWith({ employeeId: 1, employeeRole: EMPLOYEE_ROLES.TECHNOLOGIST }),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'FORBIDDEN', message: expect.stringContaining(EMPLOYEE_ROLES.PATHOLOGIST) },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts any one of several allowed roles', () => {
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireRole(EMPLOYEE_ROLES.PATHOLOGIST, EMPLOYEE_ROLES.ADMINISTRATOR)(
      reqWith({ employeeId: 1, employeeRole: EMPLOYEE_ROLES.ADMINISTRATOR }),
      res,
      next
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when there is no session at all', () => {
    // Defence in depth. requireAuth is meant to run first and answer 401; this
    // asserts the guard never falls open if it is ever placed on its own.
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireRole(EMPLOYEE_ROLES.PATHOLOGIST)(reqWith(undefined), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not treat a role name differing only in case as a match', () => {
    // Role names are the authorization subject and `role_name` is unique but
    // case-sensitive, so 'pathologist' is a different row from 'Pathologist'.
    // Matching loosely would let an ad-hoc row grant clinical authority.
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireRole(EMPLOYEE_ROLES.PATHOLOGIST)(
      reqWith({ employeeId: 1, employeeRole: 'pathologist' }),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireCurrentRole', () => {
  it('calls next() when the stored role is allowed', async () => {
    findUnique.mockResolvedValue({ employeeRole: { roleName: EMPLOYEE_ROLES.PATHOLOGIST } });
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await requireCurrentRole(EMPLOYEE_ROLES.PATHOLOGIST)(
      reqWith({ employeeId: 7, employeeRole: EMPLOYEE_ROLES.PATHOLOGIST }),
      res,
      next
    );

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects on the stored role even when the session still claims an allowed one', async () => {
    // The reason this guard exists: a role revoked mid-session must take effect
    // before the 8-hour session expires.
    findUnique.mockResolvedValue({ employeeRole: { roleName: EMPLOYEE_ROLES.TECHNOLOGIST } });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    const req = reqWith({ employeeId: 7, employeeRole: EMPLOYEE_ROLES.PATHOLOGIST });

    await requireCurrentRole(EMPLOYEE_ROLES.PATHOLOGIST)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    // and the stale session copy is corrected on the way out
    expect(req.session.employeeRole).toBe(EMPLOYEE_ROLES.PATHOLOGIST);
  });

  it('refreshes the session copy when the stored role has changed but is still allowed', async () => {
    findUnique.mockResolvedValue({ employeeRole: { roleName: EMPLOYEE_ROLES.ADMINISTRATOR } });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    const req = reqWith({ employeeId: 7, employeeRole: EMPLOYEE_ROLES.TECHNOLOGIST });

    await requireCurrentRole(EMPLOYEE_ROLES.ADMINISTRATOR)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.session.employeeRole).toBe(EMPLOYEE_ROLES.ADMINISTRATOR);
  });

  it('returns 403 when the employee no longer exists', async () => {
    findUnique.mockResolvedValue(null);
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await requireCurrentRole(EMPLOYEE_ROLES.PATHOLOGIST)(
      reqWith({ employeeId: 7, employeeRole: EMPLOYEE_ROLES.PATHOLOGIST }),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 without querying when there is no session', async () => {
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await requireCurrentRole(EMPLOYEE_ROLES.PATHOLOGIST)(reqWith({}), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('forwards a database failure to next() rather than falling open', async () => {
    // Middleware runs outside the route handlers' try/catch, so an unhandled
    // rejection here would hang the request instead of erroring.
    const boom = new Error('connection lost');
    findUnique.mockRejectedValue(boom);
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await requireCurrentRole(EMPLOYEE_ROLES.PATHOLOGIST)(
      reqWith({ employeeId: 7, employeeRole: EMPLOYEE_ROLES.PATHOLOGIST }),
      res,
      next
    );

    expect(next).toHaveBeenCalledWith(boom);
    expect(res.status).not.toHaveBeenCalled();
  });
});
