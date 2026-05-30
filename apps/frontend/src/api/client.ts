import axios, { AxiosError } from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true, // send session cookies
  headers: { 'Content-Type': 'application/json' },
});

export interface ConflictEventDetail {
  code: string;
  message: string;
  url?: string;
}

// Redirect to login on 401; broadcast 409s for the global ConflictToast.
apiClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ error?: { code?: string; message?: string } }>) => {
    const status = error.response?.status;

    if (status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login';
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
