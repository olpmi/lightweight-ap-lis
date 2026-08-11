import { useQuery } from '@tanstack/react-query';
import { metaApi } from '../api';
import { qk } from '../api/queryKeys';

/**
 * Whether this deployment is serving synthetic demo data.
 *
 * Read from the backend rather than a build-time `import.meta.env` flag: the
 * same frontend image is built for both stacks, so a build-time value would
 * describe the build rather than the server the browser is actually talking to.
 *
 * Cached for the page's lifetime — the answer cannot change without a restart.
 * Defaults to `false` while loading or if the call fails, so a transient error
 * never paints a "demo" badge onto a production deployment.
 */
export function useDemoMode(): boolean {
  const { data } = useQuery({
    queryKey: qk.meta,
    queryFn: metaApi.get,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  return data?.demoMode === true;
}

/**
 * Whether this deployment still has no accounts, and so still permits anyone to
 * create the first one.
 *
 * Not cached for the page's lifetime, unlike `useDemoMode`: creating the first
 * account changes the answer, and the login page has to stop offering the form
 * once it has. Defaults to `false` while loading or on error, so a transient
 * failure never offers self-registration on a populated deployment.
 */
export function useBootstrapAvailable(): boolean {
  const { data } = useQuery({
    queryKey: qk.meta,
    queryFn: metaApi.get,
    retry: false,
  });

  return data?.bootstrapAvailable === true;
}
