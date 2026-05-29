/**
 * End-to-end workflow integration test:
 * order create → block create → slide create → draft report → sign-out → query.
 *
 * Requires a live test database (DATABASE_URL + SESSION_SECRET). Skipped otherwise.
 *
 * The test creates its own employee role, employee, body site, doctor, patient
 * and order — all suffixed with a per-run nonce so re-runs don't collide — and
 * cleans them up at the end.
 *
 * Running locally:
 *   - In CI (Linux): vitest picks it up automatically when DATABASE_URL is set.
 *   - On Windows dev: Prisma 5.22 + Node 22 + native Windows has trouble
 *     completing SCRAM-SHA-256 against the dockerised postgres on localhost.
 *     Easiest workaround is to run vitest inside the backend container with
 *     the src tree mounted, e.g.
 *       docker run --rm --network lightweight-ap-lis_default \
 *         -v "${PWD}:/app" -w /app/apps/backend \
 *         -e DATABASE_URL=postgresql://lis_user:lis_password@postgres:5432/lis_db \
 *         -e SESSION_SECRET=<secret> -e NODE_ENV=test \
 *         lightweight-ap-lis-backend ./node_modules/.bin/vitest run \
 *         src/tests/integration/orderWorkflow.test.ts
 *     (The Linux Prisma engine inside the container negotiates SCRAM cleanly.)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const hasDb = Boolean(process.env.DATABASE_URL && process.env.SESSION_SECRET);

describe.skipIf(!hasDb)('Order → sign-out workflow', () => {
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const userName = `wf_${nonce}`;
  const patientId = `WFP${nonce.slice(-7).toUpperCase()}`;
  let roleId = 0;
  let employeeId = 0;
  let bodySiteId = 0;
  let orderId = '';
  let doctorId: bigint | null = null;

  const app = createApp();
  const agent = request.agent(app);

  beforeAll(async () => {
    const role = await prisma.employeeRole.upsert({
      where: { roleName: 'pathologist' },
      update: {},
      create: { roleName: 'pathologist' },
    });
    roleId = role.employeeRoleId;

    const bodySite = await prisma.bodySite.upsert({
      where: { bodySiteName: 'Test Site' },
      update: {},
      create: { bodySiteName: 'Test Site' },
    });
    bodySiteId = bodySite.bodySiteId;

    const loginRes = await agent.post('/api/auth/login').send({
      newEmployee: {
        userName,
        firstName: 'Workflow',
        lastName: 'Tester',
        employeeRoleId: roleId,
      },
    });
    expect(loginRes.status).toBe(200);
    employeeId = Number(loginRes.body.data.employeeId);
    expect(employeeId).toBeGreaterThan(0);
  });

  afterAll(async () => {
    // Cascade-delete via order; patient/doctor/employee are cleared explicitly.
    if (orderId) {
      await prisma.order.deleteMany({ where: { orderId } });
    }
    await prisma.patient.deleteMany({ where: { patientId } });
    if (doctorId !== null) {
      await prisma.doctor.deleteMany({ where: { doctorId } });
    }
    if (employeeId) {
      await prisma.employee.deleteMany({ where: { employeeId: BigInt(employeeId) } });
    }
    // Body site and role are shared and idempotent — leave them.
  });

  it('walks the full order lifecycle and reflects sign-out in /query', async () => {
    // 1. Create order with new patient + new doctor + one specimen
    const createRes = await agent.post('/api/orders').send({
      patientId,
      patientLastName: 'Doe',
      patientFirstName: 'Jane',
      patientDateOfBirth: '1980-01-01',
      patientSex: 'F',
      doctorLastName: 'House',
      doctorFirstName: 'Gregory',
      caseType: 'SU',
      registeredDate: new Date().toISOString(),
      specimens: [{ bodySiteId }],
    });
    expect(createRes.status).toBe(201);
    orderId = createRes.body.data.orderId;
    expect(orderId).toMatch(/^SU/);
    const specimens = createRes.body.data.specimens as Array<{ specimenId: string }>;
    expect(specimens).toHaveLength(1);
    const specimenId = specimens[0].specimenId;

    // Capture created doctor for cleanup
    const order = await prisma.order.findUniqueOrThrow({ where: { orderId } });
    doctorId = order.doctorId;

    // 2. Processing queue (showAll=true so already-with-materials cases still appear)
    const procRes = await agent.get('/api/orders/processing-queue').query({
      showAll: true,
      search: orderId,
      page: 1,
      pageSize: 50,
    });
    expect(procRes.status).toBe(200);
    expect((procRes.body.data as Array<{ orderId: string }>).some((o) => o.orderId === orderId)).toBe(true);

    // 3. Create a block on the specimen
    const blockRes = await agent.post(`/api/specimens/${specimenId}/blocks`).send({ count: 1 });
    expect(blockRes.status).toBe(201);
    const blocks = blockRes.body.data as Array<{ blockId: string }>;
    expect(blocks).toHaveLength(1);
    const blockId = blocks[0].blockId;

    // 4. Create a slide on the block
    const slideRes = await agent.post(`/api/blocks/${blockId}/slides`).send({ count: 1 });
    expect(slideRes.status).toBe(201);
    expect(slideRes.body.data).toHaveLength(1);

    // 5. Result queue should now include the order (has materials, not signed out)
    const resultBefore = await agent.get('/api/orders/result-queue').query({
      search: orderId,
      page: 1,
      pageSize: 50,
    });
    expect(resultBefore.status).toBe(200);
    expect((resultBefore.body.data as Array<{ orderId: string }>).some((o) => o.orderId === orderId)).toBe(true);

    // 6. Create a draft report
    const draftRes = await agent.post(`/api/orders/${orderId}/reports/draft`).send({
      diagnosis: 'Benign reactive changes.',
      gross: 'Single fragment 1.0 cm, entirely submitted in cassette A.',
      pathologistEmployeeId: employeeId,
    });
    expect(draftRes.status).toBe(201);
    const reportId = Number(draftRes.body.data.reportId);
    expect(reportId).toBeGreaterThan(0);

    // 7. Sign out
    const signRes = await agent.post(`/api/reports/${reportId}/signout`).send({
      diagnosis: 'Benign reactive changes.',
      gross: 'Single fragment 1.0 cm, entirely submitted in cassette A.',
      pathologistEmployeeId: employeeId,
    });
    expect(signRes.status).toBe(200);
    expect(signRes.body.data.isFinal).toBe(true);
    expect(signRes.body.data.signedOutDatetime).toBeTruthy();

    // 8. Query endpoint reports isSignedOut: true
    const queryRes = await agent.get('/api/orders/query').query({ orderId, page: 1, pageSize: 10 });
    expect(queryRes.status).toBe(200);
    const queryHit = (queryRes.body.data as Array<{ orderId: string; isSignedOut: boolean }>).find(
      (o) => o.orderId === orderId,
    );
    expect(queryHit?.isSignedOut).toBe(true);

    // 9. Result queue no longer lists the order
    const resultAfter = await agent.get('/api/orders/result-queue').query({
      search: orderId,
      page: 1,
      pageSize: 50,
    });
    expect(resultAfter.status).toBe(200);
    expect(
      (resultAfter.body.data as Array<{ orderId: string }>).some((o) => o.orderId === orderId),
    ).toBe(false);
  });
});
