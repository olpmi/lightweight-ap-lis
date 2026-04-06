import fs from 'fs';
import path from 'path';
import { logger } from '../lib/logger.js';

const STORAGE_BASE = process.env.STORAGE_PATH
  ? path.resolve(process.env.STORAGE_PATH)
  : path.resolve(__dirname, '../../storage');

export const REPORT_FILES_DIR = path.join(STORAGE_BASE, 'report-files');
export const GENERATED_PDFS_DIR = path.join(STORAGE_BASE, 'generated-pdfs');

export function ensureStorageDirs(): void {
  for (const dir of [REPORT_FILES_DIR, GENERATED_PDFS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info({ dir }, 'Created storage directory');
    }
  }
}
