import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger.js';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // body-parser rejections. Without this an over-limit upload — the most likely
  // way a user meets a size cap — reports "an unexpected error occurred" with a
  // 500, telling them nothing about what to do. Applies to every route, not
  // just the CSV import that surfaced it.
  if (typeof err === 'object' && err !== null && 'type' in err) {
    const { type } = err as { type?: string };
    if (type === 'entity.too.large') {
      res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'The uploaded content is too large. Split it into smaller files and retry.',
        },
      });
      return;
    }
    if (type === 'entity.parse.failed') {
      res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'The request body could not be parsed' },
      });
      return;
    }
  }

  // Normalize Prisma concurrency-related errors to 409 so the frontend can
  // surface a single "another user updated this" toast.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'Resource already exists or was modified by another user',
          details: { target: err.meta?.target },
        },
      });
      return;
    }
    if (err.code === 'P2025') {
      // P2025 is "record not found for required update". When raised from a
      // guarded update (where: { id, status: expected }), the row exists but
      // the guard failed -> treat as concurrent update conflict.
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'Resource was modified by another user; please reload',
        },
      });
      return;
    }
  }

  // Postgres serialization failure surfaced through Prisma raw errors.
  if (
    err instanceof Prisma.PrismaClientUnknownRequestError &&
    typeof err.message === 'string' &&
    err.message.includes('40001')
  ) {
    res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'Concurrent update detected; please retry',
      },
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
