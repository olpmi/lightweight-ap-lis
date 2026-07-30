/**
 * Order edit-lock integration tests.
 *
 * Covers:
 *   - acquire on a fresh order: returns lock state with ownedByRequester=true
 *   - second user gets 409 LOCKED with the holder's identity in details
 *   - holder can refresh (re-POST) without conflict
 *   - getState reflects the holder; for the holder it's owned, for others not
 *   - release by holder clears the lock; subsequent acquire by another user
 *     succeeds
 *   - expired lease can be taken over (we backdate `editingExpiresAt` directly)
 *
 * Run inside the backend container on Windows (host SCRAM bug).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const hasDb = Boolean(process.env.DATABASE_URL && process.env.SESSION_SECRET);

describe.skipIf(!hasDb)('Order edit-lock', () => {
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const userA = `lockA_${nonce}`;
  const userB = `lockB_${nonce}`;
  let roleId = 0;
  let bodySiteId = 0;
  let employeeAId = 0;
  let employeeBId = 0;
  const createdOrderIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdDoctorIds: bigint[] = [];

  const app = createApp();
  const agentA = request.agent(app);
  const agentB = request.agent(app);

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

    const loginA = await agentA.post('/api/auth/login').send({
      newEmployee: { userName: userA, firstName: 'Lock', lastName: 'A', employeeRoleId: roleId, password: 'Integration1!' },
    });
    expect(loginA.status).toBe(200);
    employeeAId = Number(loginA.body.data.employeeId);

    const loginB = await agentB.post('/api/auth/login').send({
      newEmployee: { userName: userB, firstName: 'Lock', lastName: 'B', employeeRoleId: roleId, password: 'Integration1!' },
    });
    expect(loginB.status).toBe(200);
    employeeBId = Number(loginB.body.data.employeeId);
  });

  async function createOrder(): Promise<string> {
    const res = await agentA.post('/api/orders').send({
      patientLastName: `Doe_${nonce}_${createdOrderIds.length}`,
      patientFirstName: 'Jane',
      patientDateOfBirth: '1980-01-01',
      patientSex: 'Female',
      doctorLastName: `House_${nonce}`,
      doctorFirstName: 'Gregory',
      caseType: 'SU',
      registeredDate: new Date().toISOString(),
      specimens: [{ bodySiteId }],
    });
    expect(res.status).toBe(201);
    const orderId = res.body.data.orderId as string;
    createdOrderIds.push(orderId);
    const order = await prisma.order.findUniqueOrThrow({ where: { orderId } });
    createdPatientIds.push(order.patientId);
    createdDoctorIds.push(order.doctorId);
    return orderId;
  }

  afterAll(async () => {
    if (createdOrderIds.length) {
      const where = { orderId: { in: createdOrderIds } } as const;
      await prisma.ancillaryOrder.deleteMany({ where });
      // The enforcement tests below create draft reports, which hold a
      // restricting FK to the order.
      await prisma.reportFile.deleteMany({ where: { report: { orderId: { in: createdOrderIds } } } });
      await prisma.report.deleteMany({ where });
      await prisma.specimen.deleteMany({ where });
      await prisma.order.deleteMany({ where });
    }
    if (createdPatientIds.length) {
      await prisma.patient.deleteMany({ where: { patientId: { in: createdPatientIds } } });
    }
    for (const docId of createdDoctorIds) {
      await prisma.doctor.deleteMany({ where: { doctorId: docId } });
    }
    if (employeeAId) {
      await prisma.employee.deleteMany({ where: { employeeId: BigInt(employeeAId) } });
    }
    if (employeeBId) {
      await prisma.employee.deleteMany({ where: { employeeId: BigInt(employeeBId) } });
    }
  });

  it('first acquire reports ownedByRequester=true and a future expiry', async () => {
    const orderId = await createOrder();

    const res = await agentA.post(`/api/orders/${orderId}/lock`);
    expect(res.status).toBe(200);
    expect(res.body.data.ownedByRequester).toBe(true);
    expect(res.body.data.editingEmployeeId).toBe(employeeAId);
    expect(new Date(res.body.data.editingExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('second user gets 409 LOCKED with the holder details', async () => {
    const orderId = await createOrder();
    const a = await agentA.post(`/api/orders/${orderId}/lock`);
    expect(a.status).toBe(200);

    const b = await agentB.post(`/api/orders/${orderId}/lock`);
    expect(b.status).toBe(409);
    expect(b.body.error.code).toBe('LOCKED');
    expect(b.body.error.details.editingEmployeeId).toBe(employeeAId);
  });

  it('holder can refresh (re-POST) the lock without conflict', async () => {
    const orderId = await createOrder();
    const a1 = await agentA.post(`/api/orders/${orderId}/lock`);
    expect(a1.status).toBe(200);

    const a2 = await agentA.post(`/api/orders/${orderId}/lock`);
    expect(a2.status).toBe(200);
    expect(a2.body.data.ownedByRequester).toBe(true);
    // New expiry should be at least as fresh.
    expect(new Date(a2.body.data.editingExpiresAt).getTime()).toBeGreaterThanOrEqual(
      new Date(a1.body.data.editingExpiresAt).getTime(),
    );
  });

  it('getState shows different ownedByRequester for holder vs other user', async () => {
    const orderId = await createOrder();
    await agentA.post(`/api/orders/${orderId}/lock`);

    const stateA = await agentA.get(`/api/orders/${orderId}/lock`);
    expect(stateA.status).toBe(200);
    expect(stateA.body.data.ownedByRequester).toBe(true);

    const stateB = await agentB.get(`/api/orders/${orderId}/lock`);
    expect(stateB.status).toBe(200);
    expect(stateB.body.data.ownedByRequester).toBe(false);
    expect(stateB.body.data.editingEmployeeId).toBe(employeeAId);
  });

  it('release by holder clears the lock and lets another user acquire', async () => {
    const orderId = await createOrder();
    await agentA.post(`/api/orders/${orderId}/lock`);

    const rel = await agentA.delete(`/api/orders/${orderId}/lock`);
    expect(rel.status).toBe(204);

    const b = await agentB.post(`/api/orders/${orderId}/lock`);
    expect(b.status).toBe(200);
    expect(b.body.data.ownedByRequester).toBe(true);
    expect(b.body.data.editingEmployeeId).toBe(employeeBId);
  });

  it('release by non-holder is a no-op (does not steal the lock)', async () => {
    const orderId = await createOrder();
    await agentA.post(`/api/orders/${orderId}/lock`);

    const stolenRelease = await agentB.delete(`/api/orders/${orderId}/lock`);
    expect(stolenRelease.status).toBe(204);

    const stateA = await agentA.get(`/api/orders/${orderId}/lock`);
    expect(stateA.body.data.ownedByRequester).toBe(true);
    expect(stateA.body.data.editingEmployeeId).toBe(employeeAId);
  });

  it('expired lease can be taken over by another user', async () => {
    const orderId = await createOrder();
    await agentA.post(`/api/orders/${orderId}/lock`);

    // Backdate the lease past expiry without going through the API.
    await prisma.order.update({
      where: { orderId },
      data: { editingExpiresAt: new Date(Date.now() - 60_000) },
    });

    const b = await agentB.post(`/api/orders/${orderId}/lock`);
    expect(b.status).toBe(200);
    expect(b.body.data.ownedByRequester).toBe(true);
    expect(b.body.data.editingEmployeeId).toBe(employeeBId);
  });

  /**
   * Enforcement on mutating endpoints.
   *
   * `OrderLockService.assertHolder` existed but had no call sites, so the lock
   * was advisory: a client that skipped the lock hook could still write to a
   * case another user was editing. It is now called inside the transactions of
   * createDraft, signOut, signPrelim and reactivate.
   *
   * Draft creation is used as the representative mutation because it needs only
   * an order, no materials.
   */
  describe('enforcement on mutating endpoints', () => {
    function draftBody(pathologistEmployeeId: number): Record<string, unknown> {
      return {
        diagnosis: 'Lock enforcement diagnosis.',
        gross: 'Lock enforcement gross.',
        pathologistEmployeeId,
      };
    }

    it('the lock holder can write to the case', async () => {
      const orderId = await createOrder();
      expect((await agentA.post(`/api/orders/${orderId}/lock`)).status).toBe(200);

      const res = await agentA
        .post(`/api/orders/${orderId}/reports/draft`)
        .send(draftBody(employeeAId));
      expect(res.status).toBe(201);
    });

    it('a non-holder is rejected with 409 LOCKED while another user holds the lock', async () => {
      const orderId = await createOrder();
      expect((await agentA.post(`/api/orders/${orderId}/lock`)).status).toBe(200);

      const res = await agentB
        .post(`/api/orders/${orderId}/reports/draft`)
        .send(draftBody(employeeBId));

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('LOCKED');
      expect(res.body.error.details.editingEmployeeId).toBe(employeeAId);

      // The rejected write must not have persisted anything.
      expect(await prisma.report.count({ where: { orderId } })).toBe(0);
    });

    it('writes are permitted when no lock is held at all', async () => {
      // Clients that never acquire a lock keep working; they retain only the
      // optimistic-locking protection.
      const orderId = await createOrder();

      const res = await agentB
        .post(`/api/orders/${orderId}/reports/draft`)
        .send(draftBody(employeeBId));
      expect(res.status).toBe(201);
    });

    it('another user can write once the holder releases the lock', async () => {
      const orderId = await createOrder();
      expect((await agentA.post(`/api/orders/${orderId}/lock`)).status).toBe(200);

      const blocked = await agentB
        .post(`/api/orders/${orderId}/reports/draft`)
        .send(draftBody(employeeBId));
      expect(blocked.status).toBe(409);

      expect((await agentA.delete(`/api/orders/${orderId}/lock`)).status).toBe(204);

      const allowed = await agentB
        .post(`/api/orders/${orderId}/reports/draft`)
        .send(draftBody(employeeBId));
      expect(allowed.status).toBe(201);
    });

    it('an expired lease does not block another user', async () => {
      const orderId = await createOrder();
      expect((await agentA.post(`/api/orders/${orderId}/lock`)).status).toBe(200);

      await prisma.order.update({
        where: { orderId },
        data: { editingExpiresAt: new Date(Date.now() - 60_000) },
      });

      const res = await agentB
        .post(`/api/orders/${orderId}/reports/draft`)
        .send(draftBody(employeeBId));
      expect(res.status).toBe(201);
    });
  });
});
