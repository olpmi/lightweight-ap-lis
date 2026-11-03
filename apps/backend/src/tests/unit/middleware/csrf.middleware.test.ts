import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  csrfProtection,
  crossSiteReason,
  createCsrfToken,
  tokensEqual,
} from '../../../middleware/csrf.middleware.js';

vi.mock('../../../lib/logger.js', () => ({ logger: { warn: vi.fn() } }));

interface ReqInit {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  session?: Record<string, unknown>;
  protocol?: string;
  trustProxy?: boolean;
}

function makeReq(init: ReqInit = {}): Request {
  const headers = Object.fromEntries(
    Object.entries(init.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value])
  );
  return {
    method: init.method ?? 'POST',
    path: init.path ?? '/api/orders',
    protocol: init.protocol ?? 'https',
    session: init.session ?? {},
    app: { get: (key: string) => (key === 'trust proxy' ? (init.trustProxy ?? false) : undefined) },
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function run(req: Request) {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  const next = vi.fn();
  csrfProtection(req, res as unknown as Response, next as unknown as NextFunction);
  const rejected = res.json.mock.calls[0]?.[0]?.error?.code as string | undefined;
  return { next, status: res.status.mock.calls[0]?.[0] as number | undefined, rejected };
}

const FRONTEND = 'https://lis.example.org';

describe('csrfProtection', () => {
  const originalCorsOrigin = process.env.CORS_ORIGIN;

  beforeEach(() => {
    process.env.CORS_ORIGIN = FRONTEND;
  });

  afterEach(() => {
    if (originalCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = originalCorsOrigin;
  });

  describe('origin check', () => {
    it('ignores safe methods entirely', () => {
      for (const method of ['GET', 'HEAD', 'OPTIONS']) {
        const { next } = run(makeReq({ method, headers: { origin: 'https://evil.example' } }));
        expect(next).toHaveBeenCalledOnce();
      }
    });

    it('passes a request with no browser headers at all (non-browser client)', () => {
      const { next } = run(makeReq());
      expect(next).toHaveBeenCalledOnce();
    });

    it('passes a same-origin request on Sec-Fetch-Site alone', () => {
      const { next } = run(
        makeReq({ headers: { 'sec-fetch-site': 'same-origin', origin: 'https://whatever.example' } })
      );
      expect(next).toHaveBeenCalledOnce();
    });

    it('passes a user-initiated request (Sec-Fetch-Site: none)', () => {
      const { next } = run(makeReq({ headers: { 'sec-fetch-site': 'none' } }));
      expect(next).toHaveBeenCalledOnce();
    });

    it('refuses a cross-site request by its Origin', () => {
      const { next, status, rejected } = run(
        makeReq({ headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' } })
      );
      expect(next).not.toHaveBeenCalled();
      expect(status).toBe(403);
      expect(rejected).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('refuses a sibling host under the same site', () => {
      const { rejected } = run(
        makeReq({
          headers: { 'sec-fetch-site': 'same-site', origin: 'https://evil.example.org', host: 'lis.example.org' },
        })
      );
      expect(rejected).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('refuses an opaque Origin (null)', () => {
      const { rejected } = run(makeReq({ headers: { origin: 'null' } }));
      expect(rejected).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('trusts the configured front-end origin, ignoring a default port', () => {
      const { next } = run(makeReq({ headers: { 'sec-fetch-site': 'same-site', origin: `${FRONTEND}:443` } }));
      expect(next).toHaveBeenCalledOnce();
    });

    it("trusts the server's own origin from the Host header", () => {
      process.env.CORS_ORIGIN = 'https://elsewhere.example';
      const { next } = run(
        makeReq({ headers: { origin: 'https://api.example.org', host: 'api.example.org' }, protocol: 'https' })
      );
      expect(next).toHaveBeenCalledOnce();
    });

    it('reads X-Forwarded-Host for its own origin only when the proxy is trusted', () => {
      process.env.CORS_ORIGIN = 'https://elsewhere.example';
      const headers = { origin: 'https://public.example.org', host: 'backend:3001', 'x-forwarded-host': 'public.example.org' };
      expect(run(makeReq({ headers, trustProxy: true })).next).toHaveBeenCalledOnce();
      expect(run(makeReq({ headers, trustProxy: false })).rejected).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('falls back to the Referer when there is no Origin', () => {
      expect(run(makeReq({ headers: { referer: `${FRONTEND}/orders/42` } })).next).toHaveBeenCalledOnce();
      expect(run(makeReq({ headers: { referer: 'https://evil.example/' } })).rejected).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('refuses a cross-site label that comes with no Origin or Referer', () => {
      const { rejected } = run(makeReq({ headers: { 'sec-fetch-site': 'cross-site' } }));
      expect(rejected).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('applies to login too, so a cross-site login attempt is refused', () => {
      const { rejected } = run(makeReq({ path: '/api/auth/login', headers: { origin: 'https://evil.example' } }));
      expect(rejected).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('explains the refusal', () => {
      expect(crossSiteReason(makeReq({ headers: { origin: 'https://evil.example' } }))).toBe(
        'origin https://evil.example'
      );
      expect(crossSiteReason(makeReq({ headers: { 'sec-fetch-site': 'same-origin' } }))).toBeNull();
    });
  });

  describe('session token', () => {
    const token = createCsrfToken();
    const session = { employeeId: 7, csrfToken: token };

    it('is not asked of an anonymous request', () => {
      const { next } = run(makeReq({ session: {} }));
      expect(next).toHaveBeenCalledOnce();
    });

    it('refuses a signed-in request that carries no token', () => {
      const { next, status, rejected } = run(makeReq({ session }));
      expect(next).not.toHaveBeenCalled();
      expect(status).toBe(403);
      expect(rejected).toBe('CSRF_TOKEN_INVALID');
    });

    it('refuses a wrong token', () => {
      const { rejected } = run(makeReq({ session, headers: { 'x-csrf-token': createCsrfToken() } }));
      expect(rejected).toBe('CSRF_TOKEN_INVALID');
    });

    it('refuses a session that has no token yet, whatever the header says', () => {
      const { rejected } = run(makeReq({ session: { employeeId: 7 }, headers: { 'x-csrf-token': token } }));
      expect(rejected).toBe('CSRF_TOKEN_INVALID');
    });

    it('passes the matching token', () => {
      const { next } = run(makeReq({ session, headers: { 'x-csrf-token': token } }));
      expect(next).toHaveBeenCalledOnce();
    });

    it('does not ask login for a token, since login is what issues it', () => {
      const { next } = run(makeReq({ path: '/api/auth/login', session }));
      expect(next).toHaveBeenCalledOnce();
    });

    it('still runs the origin check before the token check', () => {
      const { rejected } = run(
        makeReq({ session, headers: { 'x-csrf-token': token, origin: 'https://evil.example' } })
      );
      expect(rejected).toBe('CSRF_ORIGIN_REJECTED');
    });
  });

  describe('tokensEqual', () => {
    it('is false when either side is missing or the lengths differ', () => {
      expect(tokensEqual(undefined, 'a')).toBe(false);
      expect(tokensEqual('a', undefined)).toBe(false);
      expect(tokensEqual('', '')).toBe(false);
      expect(tokensEqual('abc', 'abcd')).toBe(false);
    });

    it('is true only for identical strings', () => {
      expect(tokensEqual('abc', 'abc')).toBe(true);
      expect(tokensEqual('abc', 'abd')).toBe(false);
    });
  });

  it('mints distinct URL-safe tokens', () => {
    const a = createCsrfToken();
    const b = createCsrfToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
