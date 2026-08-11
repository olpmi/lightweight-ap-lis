import express, { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { DATA_IMPORT_ENTITIES, type DataImportEntity } from '@lis/shared';
import { requireAuth } from '../middleware/auth.middleware.js';
import { AppError } from '../middleware/error.middleware.js';
import { DataImportService } from '../services/dataImport.service.js';
import { logger } from '../lib/logger.js';

const router: Router = Router();
const service = new DataImportService();

/**
 * The CSV arrives as a raw `text/csv` body rather than multipart.
 *
 * `express.text` ships with Express, so no upload dependency enters the
 * production image — a real consideration here, where every image CVE is
 * reviewed by hand (.trivyignore). It also keeps the body as the exact file
 * text, so a reproduction is a plain `curl --data-binary @roster.csv`. The
 * global `express.json` in app.ts does not claim `text/csv`, so the two
 * parsers do not interfere.
 *
 * The limit matches the 2 MB ceiling app.ts already applies to JSON.
 */
const csvBody = express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' });

/**
 * A bulk write endpoint is worth a limiter even behind a session, mirroring the
 * login limiter's shape. Skipped outside production so tests and local work are
 * not throttled.
 */
const importLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: {
    error: { code: 'TOO_MANY_REQUESTS', message: 'Too many import requests, please retry later.' },
  },
});

function parseEntity(raw: string): DataImportEntity {
  if ((DATA_IMPORT_ENTITIES as readonly string[]).includes(raw)) {
    return raw as DataImportEntity;
  }
  throw new AppError(
    404,
    'NOT_FOUND',
    `Unknown import type '${raw}'. Expected one of: ${DATA_IMPORT_ENTITIES.join(', ')}`,
  );
}

/**
 * A JSON body reaches here as an object rather than a string, so this doubles
 * as the wrong-content-type check.
 */
function readCsv(req: Request): string {
  if (typeof req.body !== 'string' || req.body.trim() === '') {
    throw new AppError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Send the CSV as a non-empty request body with Content-Type: text/csv',
    );
  }
  return req.body;
}

// POST /api/config/data-import/:entity/preview — dry run, writes nothing
router.post(
  '/:entity/preview',
  requireAuth,
  csvBody,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entity = parseEntity(req.params.entity);
      res.json({ data: await service.preview(entity, readCsv(req)) });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/config/data-import/:entity — validate again, then write
router.post(
  '/:entity',
  requireAuth,
  importLimiter,
  csvBody,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entity = parseEntity(req.params.entity);
      const data = await service.commit(entity, readCsv(req));
      // Attributable without being sensitive: no row content, no passwords.
      logger.info(
        {
          actor: req.session.employeeId,
          entity,
          created: data.created,
          skipped: data.skipped,
        },
        'CSV import committed',
      );
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
