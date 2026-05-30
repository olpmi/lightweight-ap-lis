import { Router } from 'express';
import { z } from 'zod';
import { type AppLanguageCode, APP_LANGUAGE_CODES, TEMPLATE_KINDS } from '@lis/shared';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  listAllTemplates,
  getTemplateFiles,
  saveTemplate,
} from '../services/config.service.js';

const router: Router = Router();

// Validate query language
function parseLanguage(raw: unknown): AppLanguageCode {
  if (typeof raw === 'string' && APP_LANGUAGE_CODES.includes(raw as AppLanguageCode)) {
    return raw as AppLanguageCode;
  }
  return 'en';
}

// ---------------------------------------------------------------------------
// Schema for template save body (create + update share the same shape)
// ---------------------------------------------------------------------------

const saveTemplateBodySchema = z.object({
  templateKey: z.string().min(1),
  family: z.string().min(1),
  kind: z.enum(TEMPLATE_KINDS),
  schemaStyle: z.enum(['flat', 'nested']),
  title: z.string().min(1),
  coreJson: z.record(z.unknown()),
  translations: z.record(z.record(z.unknown())).optional().default({}),
});

// ---------------------------------------------------------------------------
// GET /api/config/templates  â€” list full catalog (built-in + custom)
// ---------------------------------------------------------------------------

router.get('/templates', requireAuth, async (req, res, next) => {
  try {
    const language = parseLanguage(req.query['language'] ?? req.session.employeeDefaultLanguage);
    const kind = typeof req.query['kind'] === 'string' ? req.query['kind'] : undefined;
    const data = await listAllTemplates(language, kind);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/config/templates/files?templateKey=...
// Returns raw core JSON + all translation JSONs for the editor
// ---------------------------------------------------------------------------

router.get('/templates/files', requireAuth, async (req, res, next) => {
  try {
    const templateKey = req.query['templateKey'];
    if (typeof templateKey !== 'string' || !templateKey) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'templateKey is required' } });
      return;
    }
    const data = await getTemplateFiles(templateKey);
    res.json({ data });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('not found')) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message } });
      return;
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/config/templates/files  â€” update an existing template
// ---------------------------------------------------------------------------

router.put('/templates/files', requireAuth, async (req, res, next) => {
  try {
    const parsed = saveTemplateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    const { templateKey, family, kind, schemaStyle, title, coreJson, translations } = parsed.data;
    await saveTemplate({
      templateKey,
      family,
      kind,
      schemaStyle,
      title,
      coreJson,
      translations: translations as Record<AppLanguageCode, Record<string, unknown>>,
    });
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/config/templates/files  â€” create a new template
// ---------------------------------------------------------------------------

router.post('/templates/files', requireAuth, async (req, res, next) => {
  try {
    const parsed = saveTemplateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    const { templateKey, family, kind, schemaStyle, title, coreJson, translations } = parsed.data;
    await saveTemplate({
      templateKey,
      family,
      kind,
      schemaStyle,
      title,
      coreJson,
      translations: translations as Record<AppLanguageCode, Record<string, unknown>>,
    });
    res.status(201).json({ data: { templateKey } });
  } catch (err) {
    next(err);
  }
});

export default router;
