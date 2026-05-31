/**
 * Concurrency / conflict integration tests.
 *
 * Exercises the deterministic 409 paths added in the 2026-05-29 hardening:
 *   - REPORT_ALREADY_FINAL          (signOut twice)
 *   - DRAFT_STALE                   (createDraft / signOut with stale expectedUpdatedAt)
 *   - REPORT_ALREADY_SIGNED         (signPrelim after final sign-out)
 *   - ORDER_ALREADY_REACTIVATED     (reactivate twice)
 *   - INVALID_TRANSITION            (ancillary state machine guard)
 *
 * Skipped unless DATABASE_URL + SESSION_SECRET are set. On Windows the host
 * SCRAM bug (see user notes) means this should be run inside the backend
 * container — same as orderWorkflow.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const hasDb = Boolean(process.env.DATABASE_URL && process.env.SESSION_SECRET);

interface TestCase {
  orderId: string;
  specimenId: string;
  blockId: string;
  reportId: number;
  reportUpdatedAt: string;
}

describe.skipIf(!hasDb)('Concurrency / conflict paths', () => {
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const userName = `conf_${nonce}`;
  let roleId = 0;
  let employeeId = 0;
  let bodySiteId = 0;
  const createdOrderIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdDoctorIds: bigint[] = [];

  const app = createApp();
  const agent = request.agent(app);

  async function bootstrapAuthAndLookups() {
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
        firstName: 'Conflict',
        lastName: 'Tester',
        employeeRoleId: roleId,
      },
    });
    expect(loginRes.status).toBe(200);
    employeeId = Number(loginRes.body.data.employeeId);
    expect(employeeId).toBeGreaterThan(0);
  }

  /**
   * Build a fresh case ready for sign-out: 1 specimen → 1 block → 1 slide,
   * with the block's heStatus advanced to DISTRIBUTED. Returns the
   * created reportId + its updatedAt so callers can exercise optimistic
   * locking. Patient + doctor rows are auto-created by the order service;
   * we capture the IDs so afterAll() can clean up.
   *
   * The `_suffix` parameter exists only to give each case a distinct stack
   * trace (it's no longer used to drive the patientId).
   */
  async function buildSignableCase(_suffix: string): Promise<TestCase> {
    // Add a small jitter so the auto-generated patientId (P + ts.slice(-7))
    // doesn't collide between rapid back-to-back calls.
    await new Promise((r) => setTimeout(r, 5));
    const createRes = await agent.post('/api/orders').send({
      patientLastName: `Doe${nonce}`,
      patientFirstName: 'Jane',
      patientDateOfBirth: '1980-01-01',
      patientSex: 'Female',
      doctorLastName: `House${nonce}`,
      doctorFirstName: 'Gregory',
      caseType: 'SU',
      registeredDate: new Date().toISOString(),
      specimens: [{ bodySiteId }],
    });
    if (createRes.status !== 201) {
      // Surface the body to make CI failures debuggable.
      throw new Error(
        `order create failed: status=${createRes.status} body=${JSON.stringify(createRes.body)}`,
      );
    }
    const orderId = createRes.body.data.orderId as string;
    const specimenId = (createRes.body.data.specimens as Array<{ specimenId: string }>)[0].specimenId;
    createdOrderIds.push(orderId);

    const order = await prisma.order.findUniqueOrThrow({ where: { orderId } });
    createdDoctorIds.push(order.doctorId);
    createdPatientIds.push(order.patientId);

    const blockRes = await agent.post(`/api/specimens/${specimenId}/blocks`).send({ count: 1 });
    expect(blockRes.status).toBe(201);
    const blockId = (blockRes.body.data as Array<{ blockId: string }>)[0].blockId;

    const slideRes = await agent.post(`/api/blocks/${blockId}/slides`).send({ count: 1 });
    expect(slideRes.status).toBe(201);

    // Sign-out workflow guard requires block.heStatus === 'DISTRIBUTED'.
    const heStatusRes = await agent
      .patch(`/api/blocks/${blockId}/he-status`)
      .send({ status: 'DISTRIBUTED' });
    expect(heStatusRes.status).toBe(200);

    const draftRes = await agent.post(`/api/orders/${orderId}/reports/draft`).send({
      diagnosis: 'Diagnosis A.',
      gross: 'Gross description.',
      pathologistEmployeeId: employeeId,
    });
    expect(draftRes.status).toBe(201);
    const reportId = Number(draftRes.body.data.reportId);
    const reportUpdatedAt = draftRes.body.data.updatedAt as string;
    expect(reportId).toBeGreaterThan(0);
    expect(reportUpdatedAt).toBeTruthy();

    return { orderId, specimenId, blockId, reportId, reportUpdatedAt };
  }

  beforeAll(async () => {
    await bootstrapAuthAndLookups();
  });

  afterAll(async () => {
    // Tear down children before parents — the schema doesn't cascade.
    if (createdOrderIds.length) {
      const where = { orderId: { in: createdOrderIds } } as const;
      await prisma.ancillaryOrder.deleteMany({ where });
      await prisma.reportFile.deleteMany({
        where: { report: { orderId: { in: createdOrderIds } } },
      });
      await prisma.report.deleteMany({ where });
      await prisma.slide.deleteMany({
        where: { block: { specimen: { orderId: { in: createdOrderIds } } } },
      });
      await prisma.block.deleteMany({
        where: { specimen: { orderId: { in: createdOrderIds } } },
      });
      await prisma.specimen.deleteMany({ where });
      await prisma.order.deleteMany({ where });
    }
    if (createdPatientIds.length) {
      await prisma.patient.deleteMany({ where: { patientId: { in: createdPatientIds } } });
    }
    for (const docId of createdDoctorIds) {
      await prisma.doctor.deleteMany({ where: { doctorId: docId } });
    }
    if (employeeId) {
      await prisma.employee.deleteMany({ where: { employeeId: BigInt(employeeId) } });
    }
  });

  it('signOut twice: second call returns 409 REPORT_ALREADY_FINAL', async () => {
    const c = await buildSignableCase('a');

    const sign1 = await agent.post(`/api/reports/${c.reportId}/signout`).send({
      diagnosis: 'Diagnosis A.',
      gross: 'Gross description.',
      pathologistEmployeeId: employeeId,
    });
    expect(sign1.status).toBe(200);
    expect(sign1.body.data.isFinal).toBe(true);

    const sign2 = await agent.post(`/api/reports/${c.reportId}/signout`).send({
      diagnosis: 'Diagnosis A.',
      gross: 'Gross description.',
      pathologistEmployeeId: employeeId,
    });
    expect(sign2.status).toBe(409);
    // Either CONFLICT (pre-flight check on isFinal) or REPORT_ALREADY_FINAL
    // (atomic guard). Both are acceptable — both signal the same to the UI.
    expect(['CONFLICT', 'REPORT_ALREADY_FINAL']).toContain(sign2.body.error.code);
  });

  it('createDraft with stale expectedUpdatedAt returns 409 DRAFT_STALE', async () => {
    const c = await buildSignableCase('b');

    // First update succeeds and bumps updatedAt.
    const update1 = await agent.post(`/api/orders/${c.orderId}/reports/draft`).send({
      diagnosis: 'Diagnosis B updated.',
      gross: 'Gross.',
      pathologistEmployeeId: employeeId,
      expectedUpdatedAt: c.reportUpdatedAt,
    });
    expect(update1.status).toBe(201);

    // Second update with the original (now stale) expectedUpdatedAt is rejected.
    const update2 = await agent.post(`/api/orders/${c.orderId}/reports/draft`).send({
      diagnosis: 'Diagnosis B even newer.',
      gross: 'Gross.',
      pathologistEmployeeId: employeeId,
      expectedUpdatedAt: c.reportUpdatedAt,
    });
    expect(update2.status).toBe(409);
    expect(update2.body.error.code).toBe('DRAFT_STALE');
  });

  it('signOut with stale expectedUpdatedAt returns 409 DRAFT_STALE', async () => {
    const c = await buildSignableCase('c');

    // Bump the draft so the original updatedAt is stale.
    const bump = await agent.post(`/api/orders/${c.orderId}/reports/draft`).send({
      diagnosis: 'Bumped.',
      gross: 'Gross.',
      pathologistEmployeeId: employeeId,
    });
    expect(bump.status).toBe(201);

    const stale = await agent.post(`/api/reports/${c.reportId}/signout`).send({
      diagnosis: 'Stale signout.',
      gross: 'Gross.',
      pathologistEmployeeId: employeeId,
      expectedUpdatedAt: c.reportUpdatedAt,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('DRAFT_STALE');
  });

  it('signPrelim after final sign-out returns 409', async () => {
    const c = await buildSignableCase('d');

    const sign = await agent.post(`/api/reports/${c.reportId}/signout`).send({
      diagnosis: 'Diagnosis D.',
      gross: 'Gross.',
      pathologistEmployeeId: employeeId,
    });
    expect(sign.status).toBe(200);

    const prelim = await agent.post(`/api/reports/${c.reportId}/signprelim`).send({
      diagnosis: 'Diagnosis D prelim.',
      gross: 'Gross.',
      pathologistEmployeeId: employeeId,
    });
    expect(prelim.status).toBe(409);
    // Either CONFLICT (pre-flight) or REPORT_ALREADY_SIGNED (atomic guard).
    expect(['CONFLICT', 'REPORT_ALREADY_SIGNED']).toContain(prelim.body.error.code);
  });

  it('reactivate twice returns 409 ORDER_ALREADY_REACTIVATED', async () => {
    const c = await buildSignableCase('e');

    const sign = await agent.post(`/api/reports/${c.reportId}/signout`).send({
      diagnosis: 'Diagnosis E.',
      gross: 'Gross.',
      pathologistEmployeeId: employeeId,
    });
    expect(sign.status).toBe(200);

    const react1 = await agent.post(`/api/orders/${c.orderId}/reactivate`).send({
      reactivationType: 'addend',
      reactivationReason: 'Late IHC results.',
    });
    expect(react1.status).toBe(200);

    const react2 = await agent.post(`/api/orders/${c.orderId}/reactivate`).send({
      reactivationType: 'addend',
      reactivationReason: 'Should fail.',
    });
    expect(react2.status).toBe(409);
    expect(react2.body.error.code).toBe('ORDER_ALREADY_REACTIVATED');
  });

  it('ancillary status transition skipping a step returns 400 INVALID_TRANSITION', async () => {
    const c = await buildSignableCase('f');

    // Find a fresh HE ancillary on a brand-new block on the same case.
    const blockRes = await agent.post(`/api/specimens/${c.specimenId}/blocks`).send({ count: 1 });
    expect(blockRes.status).toBe(201);
    const newBlockId = (blockRes.body.data as Array<{ blockId: string }>)[0].blockId;

    const heOrder = await prisma.ancillaryOrder.findFirstOrThrow({
      where: { blockId: newBlockId, orderable: { category: 'HE' } },
      select: { id: true, status: true },
    });
    expect(heOrder.status).toBe('MICROTOMY');

    // Skip SLIDE_STAIN: MICROTOMY → DISTRIBUTED is not a valid transition.
    const skip = await agent
      .patch(`/api/ancillary/orders/${heOrder.id}/status`)
      .send({ status: 'DISTRIBUTED' });
    expect(skip.status).toBe(400);
    expect(skip.body.error.code).toBe('INVALID_TRANSITION');
    expect(skip.body.error.details).toMatchObject({ from: 'MICROTOMY', to: 'DISTRIBUTED' });
  });
});
