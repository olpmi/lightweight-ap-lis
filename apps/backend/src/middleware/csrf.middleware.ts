import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

/**
 * Cross-site request forgery defence, in two layers on top of the SameSite
 * session cookie.
 *
 * 1. Origin check, on every state-changing request. A browser labels what it
 *    sends: `Sec-Fetch-Site` on everything (every engine since 2023) and
 *    `Origin` on cross-origin POSTs (since long before). Same-origin requests
 *    pass. Anything else passes only when its origin is the configured front
 *    end (`CORS_ORIGIN`) or this server's own address, so the request came from
 *    a page we serve. A request with none of those headers and no Referer was
 *    not made by a browser (curl, supertest, the benchmark script), and a
 *    non-browser client has no victim's cookie to abuse. Login is covered by
 *    this layer alone, since no token can exist before the session does.
 *
 * 2. Session-bound token, on state-changing requests of a signed-in session.
 *    Login mints a random token into the session and returns it; GET
 *    /api/auth/me returns it again so a reloaded tab recovers it. The client
 *    sends it back in `X-CSRF-Token` and a mismatch is refused. A page on
 *    another origin can neither read the token (CORS) nor add the header to a
 *    request the browser would send without a preflight.
 *
 * Together these close the case SameSite leaves open: a sibling host under the
 * same registrable domain, which is ordinary on a hospital intranet.
 *
 * CodeQL (js/missing-token-validation) credits a hand-written middleware only
 * when it compares a csrf-named session property, either with `===` or through
 * a call named like "equal" or "verify". That is why `csrfProtection` reads
 * `req.session.csrfToken` itself and hands it to `tokensEqual`.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Header the client sends the session token in. */
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Paths that establish the session and therefore cannot be asked for its token.
 * The origin check still applies to them.
 */
const TOKEN_EXEMPT_PATHS = new Set(['/api/auth/login']);

const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:5173';

/**
 * The origin the front end is served from. CORS allows it and the CSRF origin
 * check trusts it; both read the same setting so they cannot disagree.
 */
export function configuredFrontendOrigin(): string {
  return process.env.CORS_ORIGIN?.trim() || DEFAULT_FRONTEND_ORIGIN;
}

/** A fresh token: 32 random bytes, URL-safe so it survives any transport. */
export function createCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Constant-time comparison; false when either side is missing. */
export function tokensEqual(expected: string | undefined, presented: string | undefined): boolean {
  if (!expected || !presented) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(presented, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `scheme://host[:port]` of a URL or origin string, or undefined when it is not one (e.g. `null`). */
function originOf(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/** This server's own origin as the browser saw it, honouring the proxy headers `trust proxy` enables. */
function ownOrigin(req: Request): string | undefined {
  const forwardedHost = req.app.get('trust proxy')
    ? req.get('x-forwarded-host')?.split(',')[0]?.trim()
    : undefined;
  const host = forwardedHost || req.get('host');
  return host ? originOf(`${req.protocol}://${host}`) : undefined;
}

function isTrustedOrigin(req: Request, value: string): boolean {
  const origin = originOf(value);
  if (!origin) return false;
  return origin === originOf(configuredFrontendOrigin()) || origin === ownOrigin(req);
}

/** Why a request is cross-site, or null when its provenance is acceptable. */
export function crossSiteReason(req: Request): string | null {
  const site = req.get('sec-fetch-site');
  if (site === 'same-origin' || site === 'none') return null;

  const origin = req.get('origin');
  if (origin !== undefined) return isTrustedOrigin(req, origin) ? null : `origin ${origin}`;

  const referer = req.get('referer');
  if (referer !== undefined) return isTrustedOrigin(req, referer) ? null : 'untrusted referer';

  // A browser that sends Sec-Fetch-Site also sends Origin or Referer with a
  // cross-site POST, so a bare cross-site label is a signal in itself. With no
  // headers at all this is not a browser.
  return site === undefined ? null : `sec-fetch-site ${site}`;
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const reason = crossSiteReason(req);
  if (reason !== null) {
    logger.warn({ method: req.method, path: req.path, reason }, 'Refused cross-site request');
    res.status(403).json({
      error: { code: 'CSRF_ORIGIN_REJECTED', message: 'Cross-site requests are not accepted.' },
    });
    return;
  }

  if (req.session.employeeId != null && !TOKEN_EXEMPT_PATHS.has(req.path)) {
    if (!tokensEqual(req.session.csrfToken, req.get(CSRF_HEADER))) {
      res.status(403).json({
        error: {
          code: 'CSRF_TOKEN_INVALID',
          message: 'Missing or stale CSRF token. Reload the page and retry.',
        },
      });
      return;
    }
  }

  next();
}
