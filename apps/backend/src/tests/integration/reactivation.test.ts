/**
 * Amendment (reactivation) integration tests.
 *
 * concurrency.test.ts already covers the 409 double-reactivate conflict path.
 * What was missing — and what this file adds — is the *semantics* of an
 * amendment: that the prior final report is left untouched, that a new draft is
 * created at the next version carrying the previous content forward, that the
 * supersedes link and amendment metadata are recorded, and that the case
 * re-enters the result queue so a pathologist can act on it.
 *
 * Covers both amendment types defined by the ReactivationType enum:
 *   - revise  (correcting a signed-out report)
 *   - addend  (adding to a signed-out report)
 *
 * Skipped unless DATABASE_URL + SESSION_SECRET are set, matching the other
 * integration suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const hasDb = Boolean(process.env.DATABASE_URL && process.env.SESSION_SECRET);

interface SignedCase {
  orderId: string;
  reportId: number;
}

describe.skipIf(!hasDb)('Report amendment (reactivation)', () => {
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const userName = `amend_${nonce}`;
  let roleId = 0;
  let employeeId = 0;
  let bodySiteId = 0;
  const createdOrderIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdDoctorIds: bigint[] = [];

  const app = createApp();
  const agent = request.agent(app);

  /** Builds a case and signs it out, returning the final report's identifiers. */
  async function buildSignedOutCase(): Promise<SignedCase> {
    // Small jitter: the auto-generated patientId is timestamp-derived and can
    // collide between rapid back-to-back calls.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const createRes = await agent.post('/api/orders').send({
      patientLastName: `Doe${nonce}`,
      patientFirstName: 'Jane',
      patientDateOfBirth: '1980-01-01',
      patientSex: 'Female',
      doctorLastName: `House${nonce}`,
      doctorFirstName: 'Gregory',
      caseType: 'Surgical Pathology',
      registeredDate: new Date().toISOString(),
      specimens: [{ bodySiteId }],
    });
    expect(createRes.status).toBe(201);

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

    const heStatusRes = await agent
      .patch(`/api/blocks/${blockId}/he-status`)
      .send({ status: 'DISTRIBUTED' });
    expect(heStatusRes.status).toBe(200);

    const draftRes = await agent.post(`/api/orders/${orderId}/reports/draft`).send({
      diagnosis: 'Original diagnosis.',
      comment: 'Original comment.',
      gross: 'Original gross description.',
      pathologistEmployeeId: employeeId,
    });
    expect(draftRes.status).toBe(201);

    const reportId = Number(draftRes.body.data.reportId);
    const signRes = await agent.post(`/api/reports/${reportId}/signout`).send({
      diagnosis: 'Original diagnosis.',
      comment: 'Original comment.',
      gross: 'Original gross description.',
      pathologistEmployeeId: employeeId,
    });
    expect(signRes.status).toBe(200);
    expect(signRes.body.data.isFinal).toBe(true);

    return { orderId, reportId };
  }

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
        firstName: 'Amend',
        lastName: 'Tester',
        employeeRoleId: roleId,
        password: 'Integration1!',
      },
    });
    expect(loginRes.status).toBe(200);
    employeeId = Number(loginRes.body.data.employeeId);
  });

  afterAll(async () => {
    // Tear down children before parents — the schema doesn't cascade everywhere.
    if (createdOrderIds.length) {
      const where = { orderId: { in: createdOrderIds } } as const;
      await prisma.ancillaryOrder.deleteMany({ where });
      await prisma.reportFile.deleteMany({
        where: { report: { orderId: { in: createdOrderIds } } },
      });
      // Clear self-references before deleting, or the FK blocks the delete.
      await prisma.order.updateMany({ where, data: { reactivatedFromReportId: null } });
      await prisma.report.updateMany({ where, data: { supersedesReportId: null } });
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
    for (const doctorId of createdDoctorIds) {
      await prisma.doctor.deleteMany({ where: { doctorId } });
    }
    if (employeeId) {
      await prisma.employee.deleteMany({ where: { employeeId: BigInt(employeeId) } });
    }
  });

  it('revise: creates a v2 draft carrying prior content forward and links it to the superseded report', async () => {
    const signedCase = await buildSignedOutCase();

    const reactivateRes = await agent.post(`/api/orders/${signedCase.orderId}/reactivate`).send({
      reactivationType: 'revise',
      reactivationReason: 'Typographical error in the diagnosis line.',
    });
    expect(reactivateRes.status).toBe(200);

    const amended = reactivateRes.body.data;
    expect(Number(amended.versionNumber)).toBe(2);
    expect(amended.isFinal).toBe(false);
    expect(amended.signedOutDatetime).toBeFalsy();
    expect(amended.reactivationType).toBe('revise');
    expect(amended.reactivationReason).toBe('Typographical error in the diagnosis line.');
    expect(Number(amended.supersedesReportId)).toBe(signedCase.reportId);

    // Prior content is copied forward so the pathologist edits rather than retypes.
    expect(amended.diagnosis).toBe('Original diagnosis.');
    expect(amended.comment).toBe('Original comment.');
    expect(amended.gross).toBe('Original gross description.');

    // The original final report must remain intact and signed out.
    const original = await prisma.report.findUniqueOrThrow({
      where: { reportId: BigInt(signedCase.reportId) },
    });
    expect(original.isFinal).toBe(true);
    expect(original.signedOutDatetime).not.toBeNull();
    expect(original.versionNumber).toBe(1);
    expect(original.diagnosis).toBe('Original diagnosis.');

    // The order is flagged as amended and its completion date cleared.
    const order = await prisma.order.findUniqueOrThrow({ where: { orderId: signedCase.orderId } });
    expect(order.isReactivated).toBe(true);
    expect(order.completedDate).toBeNull();
    expect(Number(order.reactivatedFromReportId)).toBe(signedCase.reportId);
  });

  it('addend: records the addendum amendment type', async () => {
    const signedCase = await buildSignedOutCase();

    const reactivateRes = await agent.post(`/api/orders/${signedCase.orderId}/reactivate`).send({
      reactivationType: 'addend',
      reactivationReason: 'Immunohistochemistry results received after sign-out.',
    });
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.data.reactivationType).toBe('addend');
    expect(Number(reactivateRes.body.data.versionNumber)).toBe(2);
    expect(Number(reactivateRes.body.data.supersedesReportId)).toBe(signedCase.reportId);
  });

  /**
   * An amended case must come back onto the pathologist's work queue.
   *
   * `getResultQueue` used to exclude any order with a signed-out final report.
   * After an amendment the superseded version 1 still matches that condition, so
   * the case never reappeared even though its version 2 draft was unsigned and
   * waiting to be worked — it was reachable only by query or direct navigation.
   * The predicate now also admits a reactivated case that still has an open
   * draft, and drops it again once that draft is signed.
   */
  it('an amended case returns to the result queue until the amendment is signed', async () => {
    const signedCase = await buildSignedOutCase();

    async function resultQueueContains(orderId: string): Promise<boolean> {
      const res = await agent.get('/api/orders/result-queue?page=1&pageSize=200');
      expect(res.status).toBe(200);
      return (res.body.data as Array<{ orderId: string }>).some((row) => row.orderId === orderId);
    }

    // Signed out, so it is not waiting for a pathologist.
    expect(await resultQueueContains(signedCase.orderId)).toBe(false);

    const reactivateRes = await agent.post(`/api/orders/${signedCase.orderId}/reactivate`).send({
      reactivationType: 'revise',
      reactivationReason: 'Diagnosis revised after review.',
    });
    expect(reactivateRes.status).toBe(200);
    const amendedReportId = Number(reactivateRes.body.data.reportId);

    // The unsigned amendment puts the case back on the work queue.
    expect(await resultQueueContains(signedCase.orderId)).toBe(true);

    // It also remains retrievable by query.
    const queryRes = await agent.get(
      `/api/orders/query?orderId=${encodeURIComponent(signedCase.orderId)}`
    );
    expect(queryRes.status).toBe(200);
    expect((queryRes.body.data as Array<{ orderId: string }>).some(
      (row) => row.orderId === signedCase.orderId
    )).toBe(true);

    const signRes = await agent.post(`/api/reports/${amendedReportId}/signout`).send({
      diagnosis: 'Revised diagnosis.',
      comment: 'Original comment.',
      gross: 'Original gross description.',
      pathologistEmployeeId: employeeId,
    });
    expect(signRes.status).toBe(200);
    expect(signRes.body.data.isFinal).toBe(true);

    expect(await resultQueueContains(signedCase.orderId)).toBe(false);

    // Both versions are retained; amending does not overwrite the original.
    const versions = await prisma.report.findMany({
      where: { orderId: signedCase.orderId },
      orderBy: { versionNumber: 'asc' },
      select: { versionNumber: true, isFinal: true, diagnosis: true },
    });
    expect(versions).toHaveLength(2);
    expect(versions[0].diagnosis).toBe('Original diagnosis.');
    expect(versions[1].diagnosis).toBe('Revised diagnosis.');
    expect(versions.every((version) => version.isFinal)).toBe(true);
  });

  it('rejects amendment of a case that has never been signed out', async () => {
    const createRes = await agent.post('/api/orders').send({
      patientLastName: `Doe${nonce}`,
      patientFirstName: 'Unsigned',
      patientDateOfBirth: '1980-01-01',
      patientSex: 'Female',
      doctorLastName: `House${nonce}`,
      doctorFirstName: 'Gregory',
      caseType: 'Surgical Pathology',
      registeredDate: new Date().toISOString(),
      specimens: [{ bodySiteId }],
    });
    expect(createRes.status).toBe(201);

    const orderId = createRes.body.data.orderId as string;
    createdOrderIds.push(orderId);
    const order = await prisma.order.findUniqueOrThrow({ where: { orderId } });
    createdDoctorIds.push(order.doctorId);
    createdPatientIds.push(order.patientId);

    const reactivateRes = await agent.post(`/api/orders/${orderId}/reactivate`).send({
      reactivationType: 'revise',
      reactivationReason: 'Nothing to revise.',
    });
    expect(reactivateRes.status).toBe(400);
  });
});
