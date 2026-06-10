/**
 * Ancillary order pipeline integration tests.
 *
 * Covers both ancillary state machines end-to-end through the HTTP API:
 *
 *   Slide pipeline (HE / IHC / SPECIAL_STAIN):
 *     PULL_BLOCK → MICROTOMY → SLIDE_STAIN → DISTRIBUTED
 *
 *   Material pipeline (MOLECULAR / SEND_OUT):
 *     PULL_MATERIAL → MATERIAL_SENT → MATERIAL_RETURNED
 *
 * Plus:
 *   - cancel from any non-terminal state succeeds
 *   - any transition out of a terminal state is rejected with INVALID_TRANSITION
 *
 * The pure state-machine logic is already covered by the unit test in
 * `unit/ancillaryStateMachine.test.ts`; this test exercises the wiring:
 * service → updateMany guard → timestamp population → response shape.
 *
 * Run inside the backend container on Windows (host SCRAM bug).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const hasDb = Boolean(process.env.DATABASE_URL && process.env.SESSION_SECRET);

describe.skipIf(!hasDb)('Ancillary order pipelines', () => {
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const userName = `anc_${nonce}`;
  let roleId = 0;
  let employeeId = 0;
  let bodySiteId = 0;
  let orderId = '';
  let blockId = '';
  let ihcOrderableId = 0;
  let molecularOrderableId = 0;
  const cleanupOrderableIds: number[] = [];
  const cleanupAncillaryIds: number[] = [];
  let createdPatientId = '';
  let createdDoctorId: bigint | null = null;

  const app = createApp();
  const agent = request.agent(app);

  async function ensureOrderable(name: string, category: string): Promise<number> {
    const existing = await prisma.ancillaryOrderable.findFirst({
      where: { category, isActive: true },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await prisma.ancillaryOrderable.create({
      data: { name, category, isActive: true, sortOrder: 999 },
      select: { id: true },
    });
    cleanupOrderableIds.push(created.id);
    return created.id;
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

    const login = await agent.post('/api/auth/login').send({
      newEmployee: { userName, firstName: 'Anc', lastName: 'Tester', employeeRoleId: roleId, password: 'Integration1!' },
    });
    expect(login.status).toBe(200);
    employeeId = Number(login.body.data.employeeId);

    // Build the case + a block to attach ancillary orders to.
    const orderRes = await agent.post('/api/orders').send({
      patientLastName: `Doe_${nonce}`,
      patientFirstName: 'Jane',
      patientDateOfBirth: '1980-01-01',
      patientSex: 'Female',
      doctorLastName: `House_${nonce}`,
      doctorFirstName: 'Gregory',
      caseType: 'SU',
      registeredDate: new Date().toISOString(),
      specimens: [{ bodySiteId }],
    });
    expect(orderRes.status).toBe(201);
    orderId = orderRes.body.data.orderId as string;
    const order = await prisma.order.findUniqueOrThrow({ where: { orderId } });
    createdPatientId = order.patientId;
    createdDoctorId = order.doctorId;
    const specimenId = (orderRes.body.data.specimens as Array<{ specimenId: string }>)[0].specimenId;

    const blockRes = await agent.post(`/api/specimens/${specimenId}/blocks`).send({ count: 1 });
    expect(blockRes.status).toBe(201);
    blockId = (blockRes.body.data as Array<{ blockId: string }>)[0].blockId;

    ihcOrderableId = await ensureOrderable(`IHC test ${nonce}`, 'IHC');
    molecularOrderableId = await ensureOrderable(`Molecular test ${nonce}`, 'MOLECULAR');
  });

  afterAll(async () => {
    if (cleanupAncillaryIds.length) {
      await prisma.ancillaryOrder.deleteMany({ where: { id: { in: cleanupAncillaryIds } } });
    }
    if (orderId) {
      const where = { orderId } as const;
      await prisma.ancillaryOrder.deleteMany({ where });
      await prisma.specimen.deleteMany({ where });
      await prisma.order.deleteMany({ where });
    }
    if (createdPatientId) {
      await prisma.patient.deleteMany({ where: { patientId: createdPatientId } });
    }
    if (createdDoctorId !== null) {
      await prisma.doctor.deleteMany({ where: { doctorId: createdDoctorId } });
    }
    if (employeeId) {
      await prisma.employee.deleteMany({ where: { employeeId: BigInt(employeeId) } });
    }
    // Only delete orderables we ourselves created (not seed/migration ones).
    if (cleanupOrderableIds.length) {
      await prisma.ancillaryOrderable.deleteMany({
        where: { id: { in: cleanupOrderableIds } },
      });
    }
  });

  async function createAncillary(orderableId: number): Promise<number> {
    const res = await agent.post('/api/ancillary/orders').send({
      orders: [{ orderId, blockId, orderableId }],
    });
    expect(res.status).toBe(201);
    const created = res.body.data as Array<{ id: number; status: string }>;
    expect(created).toHaveLength(1);
    cleanupAncillaryIds.push(created[0].id);
    return created[0].id;
  }

  async function patchStatus(id: number, status: string): Promise<request.Response> {
    return agent.patch(`/api/ancillary/orders/${id}/status`).send({ status });
  }

  it('slide pipeline: PULL_BLOCK → MICROTOMY → SLIDE_STAIN → DISTRIBUTED', async () => {
    const id = await createAncillary(ihcOrderableId);

    // Initial status for IHC (slide pipeline) is PULL_BLOCK.
    const initial = await prisma.ancillaryOrder.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    expect(initial.status).toBe('PULL_BLOCK');

    const r1 = await patchStatus(id, 'MICROTOMY');
    expect(r1.status).toBe(200);
    expect(r1.body.data.status).toBe('MICROTOMY');
    expect(r1.body.data.inProgressAt).toBeTruthy();

    const r2 = await patchStatus(id, 'SLIDE_STAIN');
    expect(r2.status).toBe(200);
    expect(r2.body.data.status).toBe('SLIDE_STAIN');

    const r3 = await patchStatus(id, 'DISTRIBUTED');
    expect(r3.status).toBe(200);
    expect(r3.body.data.status).toBe('DISTRIBUTED');
    expect(r3.body.data.completedAt).toBeTruthy();
  });

  it('material pipeline: PULL_MATERIAL → MATERIAL_SENT → MATERIAL_RETURNED', async () => {
    const id = await createAncillary(molecularOrderableId);

    const initial = await prisma.ancillaryOrder.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    expect(initial.status).toBe('PULL_MATERIAL');

    const r1 = await patchStatus(id, 'MATERIAL_SENT');
    expect(r1.status).toBe(200);
    expect(r1.body.data.status).toBe('MATERIAL_SENT');
    expect(r1.body.data.inProgressAt).toBeTruthy();

    const r2 = await patchStatus(id, 'MATERIAL_RETURNED');
    expect(r2.status).toBe(200);
    expect(r2.body.data.status).toBe('MATERIAL_RETURNED');
    expect(r2.body.data.completedAt).toBeTruthy();
  });

  it('cancel from a non-terminal state succeeds and stamps cancelledAt', async () => {
    const id = await createAncillary(ihcOrderableId);

    const r = await patchStatus(id, 'CANCELLED');
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('CANCELLED');
    expect(r.body.data.cancelledAt).toBeTruthy();
  });

  it('any transition out of a terminal state returns 400 INVALID_TRANSITION', async () => {
    const id = await createAncillary(ihcOrderableId);

    expect((await patchStatus(id, 'MICROTOMY')).status).toBe(200);
    expect((await patchStatus(id, 'SLIDE_STAIN')).status).toBe(200);
    expect((await patchStatus(id, 'DISTRIBUTED')).status).toBe(200);

    // DISTRIBUTED is terminal — every onward move must be rejected.
    for (const target of ['MICROTOMY', 'SLIDE_STAIN', 'CANCELLED']) {
      const r = await patchStatus(id, target);
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('INVALID_TRANSITION');
      expect(r.body.error.details).toMatchObject({ from: 'DISTRIBUTED', to: target });
    }
  });

  it('cross-pipeline transition is rejected (slide → material status)', async () => {
    const id = await createAncillary(ihcOrderableId);

    const r = await patchStatus(id, 'MATERIAL_SENT');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_TRANSITION');
  });
});
