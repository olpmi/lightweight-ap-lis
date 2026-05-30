import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { errorHandler, notFound, AppError } from '../../../middleware/error.middleware.js';

function makeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res as Response);
  res.json = vi.fn().mockReturnValue(res as Response);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

const next: NextFunction = vi.fn();

describe('notFound', () => {
  it('returns 404 with method+path in message', () => {
    const req = { method: 'GET', path: '/foo' } as Request;
    const res = makeRes();
    notFound(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('GET');
    expect(body.error.message).toContain('/foo');
  });
});

describe('errorHandler', () => {
  const req = {} as Request;

  it('passes AppError statusCode + code + details through verbatim', () => {
    const res = makeRes();
    const err = new AppError(400, 'BAD_REQUEST', 'nope', { field: 'x' });
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toEqual({
      error: { code: 'BAD_REQUEST', message: 'nope', details: { field: 'x' } },
    });
  });

  it('omits the details key when not provided', () => {
    const res = makeRes();
    errorHandler(new AppError(403, 'FORBIDDEN', 'no'), req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(body.error).not.toHaveProperty('details');
  });

  it('maps Prisma P2002 to 409 CONFLICT with target detail', () => {
    const res = makeRes();
    const err = new Prisma.PrismaClientKnownRequestError('uniq violation', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['orderId', 'versionNumber'] },
    });
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.details).toEqual({ target: ['orderId', 'versionNumber'] });
  });

  it('maps Prisma P2025 to 409 CONFLICT', () => {
    const res = makeRes();
    const err = new Prisma.PrismaClientKnownRequestError('record not found', {
      code: 'P2025',
      clientVersion: 'test',
    });
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error.code).toBe('CONFLICT');
  });

  it('maps Postgres serialization failure (40001) on unknown Prisma error to 409', () => {
    const res = makeRes();
    const err = new Prisma.PrismaClientUnknownRequestError(
      'transaction failed: ERROR 40001 could not serialize access',
      { clientVersion: 'test' },
    );
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error.code).toBe('CONFLICT');
  });

  it('falls through to 500 INTERNAL_ERROR for an unrecognized error', () => {
    const res = makeRes();
    errorHandler(new Error('boom'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error.code).toBe('INTERNAL_ERROR');
  });

  it('treats other Prisma error codes as 500 (not normalized)', () => {
    const res = makeRes();
    const err = new Prisma.PrismaClientKnownRequestError('connection lost', {
      code: 'P1001',
      clientVersion: 'test',
    });
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
