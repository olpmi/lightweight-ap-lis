import type { FullConfig } from '@playwright/test';

/**
 * Pings the backend health endpoint once at the start of the run.
 * Fails fast with a clear message instead of letting every test time
 * out individually when the backend is not running.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  const backendUrl =
    process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://localhost:3001';
  const healthUrl = `${backendUrl}/health`;

  let lastError: unknown;
  // Allow ~30s for the backend to come up (matches CI cold-start headroom).
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) {
        return;
      }
      lastError = new Error(`status ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `[playwright globalSetup] backend unreachable at ${healthUrl} (${reason}). ` +
      `Start the backend (e.g. \`docker compose -f docker-compose.yml up -d\`) before running E2E tests.`,
  );
}
