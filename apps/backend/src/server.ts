import path from 'path';
import dotenv from 'dotenv';

// Load .env from repo root when running locally, then fallback to local .env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();
import { createApp } from './app';
import { logger } from './lib/logger';
import { ensureStorageDirs } from './utils/storageDirs';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function start() {
  ensureStorageDirs();

  const app = createApp();

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Backend server started');
  });
}

start().catch((err) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});
