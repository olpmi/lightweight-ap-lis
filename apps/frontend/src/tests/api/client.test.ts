/**
 * The API client echoes the session's CSRF token on state-changing requests and
 * on nothing else. The adapter is replaced so no request leaves the process.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import apiClient, { setCsrfToken } from '../../api/client';

const originalAdapter = apiClient.defaults.adapter;
const seen: InternalAxiosRequestConfig[] = [];

apiClient.defaults.adapter = async (config) => {
  seen.push(config);
  return { data: { data: null }, status: 200, statusText: 'OK', headers: {}, config };
};

function headerOf(index: number): unknown {
  return seen[index].headers.get('X-CSRF-Token');
}

describe('apiClient CSRF header', () => {
  beforeEach(() => {
    seen.length = 0;
    setCsrfToken(null);
  });

  afterAll(() => {
    apiClient.defaults.adapter = originalAdapter;
  });

  it('sends no token before one is known', async () => {
    await apiClient.post('/orders', {});
    expect(headerOf(0)).toBeUndefined();
  });

  it('adds X-CSRF-Token to state-changing requests only', async () => {
    setCsrfToken('session-token');
    await apiClient.post('/orders', {});
    await apiClient.patch('/orders/1', {});
    await apiClient.put('/orders/1', {});
    await apiClient.delete('/orders/1');
    await apiClient.get('/orders/1');

    expect([0, 1, 2, 3].map(headerOf)).toEqual(Array(4).fill('session-token'));
    expect(headerOf(4)).toBeUndefined();
  });

  it('stops sending the token once it is cleared', async () => {
    setCsrfToken('session-token');
    setCsrfToken(null);
    await apiClient.post('/orders', {});
    expect(headerOf(0)).toBeUndefined();
  });
});
