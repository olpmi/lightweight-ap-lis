import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { pdfResponse } from '../../../middleware/pdfResponse.middleware.js';

describe('pdfResponse', () => {
  it('drops the content-security policy helmet set and continues', () => {
    const res = { removeHeader: vi.fn() } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;
    pdfResponse({} as Request, res, next);
    expect(res.removeHeader).toHaveBeenCalledWith('Content-Security-Policy');
    expect(next).toHaveBeenCalledOnce();
  });
});
