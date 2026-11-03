import axios, { AxiosError } from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true, // send session cookies
  headers: { 'Content-Type': 'application/json' },
});

// Cross-site request forgery token. The server mints one per session at login
// and returns it from /auth/me as well; every state-changing request must
// echo it in X-CSRF-Token (see csrf.middleware.ts in the backend). It lives in
// module state, not storage: a reload calls /auth/me and gets it again.
let csrfToken: string | null = null;

const METHODS_NEEDING_TOKEN = new Set(['post', 'put', 'patch', 'delete']);

/** Remember (or forget, with null) the session's CSRF token. */
export function setCsrfToken(token: string | null | undefined): void {
  csrfToken = token ?? null;
}

apiClient.interceptors.request.use((config) => {
  if (csrfToken && METHODS_NEEDING_TOKEN.has((config.method ?? 'get').toLowerCase())) {
    config.headers.set('X-CSRF-Token', csrfToken);
  }
  return config;
});

export interface ConflictEventDetail {
  code: string;
  message: string;
  url?: string;
}

export interface ForbiddenEventDetail {
  message: string;
  url?: string;
}

// Redirect to login on 401; broadcast 403s and 409s for their global toasts.
apiClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ error?: { code?: string; message?: string } }>) => {
    const status = error.response?.status;

    if (status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }

    // A 403 means the user's role does not permit the action. Broadcast it the
    // way 409 is handled rather than redirecting like 401: the session is valid,
    // the user is simply not allowed, and a full page reload would discard
    // whatever they were working on for no reason.
    if (status === 403 && typeof window !== 'undefined') {
      const detail: ForbiddenEventDetail = {
        message: error.response?.data?.error?.message ?? '',
        url: error.config?.url,
      };
      window.dispatchEvent(new CustomEvent('lis:forbidden', { detail }));
    }

    if (status === 409) {
      // Per-call opt-out: e.g. silent retries on slide creation set this header
      // so the global toast doesn't fire for an idempotent retry-after-collision.
      const silent = (error.config?.headers?.['x-silent-conflict'] ?? '') === '1';
      if (!silent && typeof window !== 'undefined') {
        const detail: ConflictEventDetail = {
          code: error.response?.data?.error?.code ?? 'CONFLICT',
          message: error.response?.data?.error?.message ?? 'Resource was modified by another user',
          url: error.config?.url,
        };
        window.dispatchEvent(new CustomEvent('lis:conflict', { detail }));
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
