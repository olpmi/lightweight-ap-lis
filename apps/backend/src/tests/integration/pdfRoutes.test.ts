/**
 * The PDF download routes build a file name from the order ID in the URL.
 * formatOrderIdDisplay passes a non-canonical ID through unchanged, and the
 * reference-strips route used to query specimens without checking that the
 * order existed, so `..%2F..%2Fevil` once became a write outside the storage
 * directory. Both routes must answer 404 for an ID that names no order,
 * before anything touches the filesystem.
 *
 * Skipped unless DATABASE_URL + SESSION_SECRET are set, matching the other
 * integration suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { EMPLOYEE_ROLES } from '@lis/shared';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { GENERATED_PDFS_DIR } from '../../utils/storageDirs.js';
import { createEmployeeAndLogin } from '../helpers/auth.js';

const hasDb = Boolean(process.env.DATABASE_URL && process.env.SESSION_SECRET);

describe.skipIf(!hasDb)('PDF routes refuse IDs that name no order', () => {
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const app = createApp();
  const agent = request.agent(app);
  let employeeId = 0;
  // Where `..%2F..%2Fevil` would have landed before the fix.
  const traversalTarget = path.resolve(GENERATED_PDFS_DIR, '../../evil-reference-strips.pdf');

  beforeAll(async () => {
    ({ employeeId } = await createEmployeeAndLogin(agent, EMPLOYEE_ROLES.PATHOLOGIST, `zzpdf_${nonce}`));
  });

  afterAll(async () => {
    await prisma.employee.deleteMany({ where: { employeeId } });
    fs.rmSync(traversalTarget, { force: true });
  });

  it.each(['worksheet-pdf', 'reference-strips-pdf'])(
    'GET /api/orders/:orderId/%s answers 404 for an unknown canonical ID',
    async (suffix) => {
      const res = await agent.get(`/api/orders/ZZ999999999/${suffix}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  );

  it('does not let a traversal ID write outside the generated-PDFs directory', async () => {
    const res = await agent.get('/api/orders/..%2F..%2Fevil/reference-strips-pdf');
    expect(res.status).toBe(404);
    expect(fs.existsSync(traversalTarget)).toBe(false);
  });
});
