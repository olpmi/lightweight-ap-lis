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
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
    // Playwright specs live alongside Vitest tests under src/tests/ but use a
    // different runner; keep them out of the Vitest run.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/tests/e2e/**'],
  },
});
