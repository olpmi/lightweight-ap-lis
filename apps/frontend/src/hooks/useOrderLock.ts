import { useEffect, useRef, useState } from 'react';
import { orderApi, type OrderLockState } from '../api';

export interface UseOrderLockResult {
  // Owned: this user holds the lock and is editing.
  // Locked: another user is editing; UI should be read-only with a banner.
  // Loading: initial acquire in flight.
  // Error: network/server error other than 409.
  status: 'loading' | 'owned' | 'locked' | 'error';
  // Holder details when status === 'locked'.
  holder: { employeeId: number | null; employeeName: string | null; expiresAt: string | null } | null;
  // True while the initial acquire is in flight.
  isLoading: boolean;
  // Manual retry: re-attempts to acquire the lock (e.g., when the holder leaves).
  retry: () => void;
}

const HEARTBEAT_INTERVAL_MS = 60_000;
// While read-only, poll periodically so the page reactivates if the holder leaves.
const POLL_WHEN_LOCKED_MS = 15_000;

interface AxiosErrorShape {
  response?: { status?: number; data?: { error?: { code?: string; details?: Record<string, unknown> } } };
}

function parseLockedError(err: unknown): UseOrderLockResult['holder'] | null {
  const e = err as AxiosErrorShape;
  if (e.response?.status !== 409) return null;
  const details = e.response.data?.error?.details ?? {};
  return {
    employeeId: typeof details.editingEmployeeId === 'number' ? details.editingEmployeeId : null,
    employeeName: typeof details.editingEmployeeName === 'string' ? details.editingEmployeeName : null,
    expiresAt: typeof details.editingExpiresAt === 'string' ? details.editingExpiresAt : null,
  };
}

/**
 * Acquire and maintain a pessimistic edit lock on the given order. Other users
 * who open the same case while this hook is mounted will see status='locked'
 * with the holder's name. The lock is released on unmount (best effort).
 */
export function useOrderLock(orderId: string | undefined): UseOrderLockResult {
  const [status, setStatus] = useState<UseOrderLockResult['status']>('loading');
  const [holder, setHolder] = useState<UseOrderLockResult['holder']>(null);
  // Re-trigger acquisition on demand without re-mounting.
  const [retryCount, setRetryCount] = useState(0);
  const ownedRef = useRef(false);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const applyState = (state: OrderLockState) => {
      if (state.ownedByRequester) {
        ownedRef.current = true;
        setStatus('owned');
        setHolder(null);
      } else if (state.editingEmployeeId != null) {
        ownedRef.current = false;
        setStatus('locked');
        setHolder({
          employeeId: state.editingEmployeeId,
          employeeName: state.editingEmployeeName,
          expiresAt: state.editingExpiresAt,
        });
      } else {
        // Neither owned nor held — try to acquire.
        ownedRef.current = false;
      }
    };

    const tryAcquire = async () => {
      try {
        const state = await orderApi.acquireLock(orderId);
        if (cancelled) return;
        applyState(state);
      } catch (err) {
        if (cancelled) return;
        const lockHolder = parseLockedError(err);
        if (lockHolder) {
          ownedRef.current = false;
          setStatus('locked');
          setHolder(lockHolder);
        } else {
          setStatus('error');
        }
      }
    };

    void tryAcquire();

    heartbeatTimer = setInterval(() => {
      if (!ownedRef.current) return;
      // Refresh by re-acquiring; if another user has stolen the lock after
      // expiry we transition to read-only seamlessly.
      void tryAcquire();
    }, HEARTBEAT_INTERVAL_MS);

    pollTimer = setInterval(() => {
      if (ownedRef.current) return;
      void tryAcquire();
    }, POLL_WHEN_LOCKED_MS);

    return () => {
      cancelled = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (pollTimer) clearInterval(pollTimer);
      // Best-effort release. Browser may abort in-flight requests on unload;
      // that's fine because the lease will expire on its own.
      if (ownedRef.current) {
        void orderApi.releaseLock(orderId).catch(() => undefined);
      }
    };
  }, [orderId, retryCount]);

  // Also release if the user closes the tab / navigates externally before
  // React has a chance to run cleanup. The lease will expire on its own if
  // this best-effort call doesn't make it.
  useEffect(() => {
    if (!orderId) return;
    const handler = () => {
      if (ownedRef.current) {
        void orderApi.releaseLock(orderId).catch(() => undefined);
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [orderId]);

  return {
    status,
    holder,
    isLoading: status === 'loading',
    retry: () => setRetryCount((n) => n + 1),
  };
}
