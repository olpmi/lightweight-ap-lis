import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery } from '../../../middleware/validate.middleware.js';

function makeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res as Response);
  res.json = vi.fn().mockReturnValue(res as Response);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe('validateBody', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().nonnegative(),
  });

  it('calls next() and replaces req.body with parsed data on valid input', () => {
    const middleware = validateBody(schema);
    const req = { body: { name: 'Alice', age: 30 } } as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ name: 'Alice', age: 30 });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 400 with VALIDATION_ERROR + grouped details on invalid input', () => {
    const middleware = validateBody(schema);
    const req = { body: { name: '', age: -1 } } as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error.code).toBe('VALIDATION_ERROR');
    expect(payload.error.details).toBeTypeOf('object');
    expect(payload.error.details.name).toBeInstanceOf(Array);
    expect(payload.error.details.age).toBeInstanceOf(Array);
  });

  it('groups multiple issues at the same path into one array', () => {
    const middleware = validateBody(z.object({ x: z.string().min(2).regex(/^[A-Z]/) }));
    const req = { body: { x: 'a' } } as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    const payload = res.json.mock.calls[0][0];
    expect(payload.error.details.x.length).toBeGreaterThanOrEqual(2);
  });
});

describe('validateQuery', () => {
  const schema = z.object({ page: z.coerce.number().int().min(1) });

  it('attaches validatedQuery on success', () => {
    const middleware = validateQuery(schema);
    const req = { query: { page: '3' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect((req as Request & { validatedQuery: { page: number } }).validatedQuery).toEqual({ page: 3 });
  });

  it('returns 400 on invalid query', () => {
    const middleware = validateQuery(schema);
    const req = { query: { page: '0' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('VALIDATION_ERROR');
  });
});
