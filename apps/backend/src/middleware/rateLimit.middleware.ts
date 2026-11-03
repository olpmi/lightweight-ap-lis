import rateLimit from 'express-rate-limit';

/**
 * Per-IP ceiling for the routes that read or generate files: report downloads,
 * worksheet and reference-strip PDFs, draft and layout previews. The ceiling
 * sits well above anything a person does by hand (opening every PDF on a case
 * stays far below it) but stops one client from pinning the disk or the
 * headless browser behind the previews. Like the login limiter it is off
 * outside production, so integration tests and dev hot-reloads are never
 * throttled. Keys on req.ip, which `trust proxy` resolves to the real client.
 */
export const fileRouteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many file requests, please retry shortly.' } },
});
