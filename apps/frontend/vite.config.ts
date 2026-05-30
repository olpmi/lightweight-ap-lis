import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@lis/shared': path.resolve(__dirname, '../../packages/shared/src/index'),
    },
  },
  server: {
    port: 5173,
    host: true,
    watch: {
      // Polling is required for HMR to work on Windows Docker bind mounts
      // (inotify events don't propagate through WSL2/bind-mount layer)
      usePolling: true,
      interval: 300,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  // `vite preview` does not inherit `server.proxy`; e2e/CI runs the built
  // bundle via preview, so re-declare the /api proxy here too.
  preview: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
    // Playwright specs live alongside Vitest tests under src/tests/ but use a
    // different runner; keep them out of the Vitest run.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      // Conservative starting floor — ratchet up as more component tests land.
      thresholds: {
        lines: 30,
        functions: 25,
        statements: 30,
        branches: 45,
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/tests/**', 'src/**/*.test.{ts,tsx}', 'src/main.tsx'],
    },
  },
});
