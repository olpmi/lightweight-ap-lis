/**
 * Case-type / accession-prefix integration tests.
 *
 * `generateOrderId` assigns the CN prefix to cytology cases and SU to everything
 * else, but no test exercised the cytology branch: the existing suites all pass
 * `caseType: 'SU'`, which is not one of the two values the order-entry UI can
 * produce, so it fell through to the SU default. The manuscript reports cytology
 * support and a surgical/cytology case mix, so both branches need coverage.
 *
 * The two case-type values asserted here are the ones offered by
 * OrderEntryPage: 'Surgical Pathology' and 'Cytology'.
 *
 * Skipped unless DATABASE_URL + SESSION_SECRET are set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const hasDb = Boolean(process.env.DATABASE_URL && process.env.SESSION_SECRET);

describe.skipIf(!hasDb)('Case type and accession prefix', () => {
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const userName = `ctype_${nonce}`;
  let roleId = 0;
  let employeeId = 0;
  let bodySiteId = 0;
  const createdOrderIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdDoctorIds: bigint[] = [];

  const app = createApp();
  const agent = request.agent(app);

  async function createCase(caseType: string): Promise<{ orderId: string; caseType: string | null }> {
    // The auto-generated patientId is timestamp-derived; jitter avoids collisions
    // between rapid back-to-back creations.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const res = await agent.post('/api/orders').send({
      patientLastName: `Doe_${nonce}`,
      patientFirstName: 'Jane',
      patientDateOfBirth: '1980-01-01',
      patientSex: 'Female',
      doctorLastName: `House_${nonce}`,
      doctorFirstName: 'Gregory',
      caseType,
      registeredDate: new Date().toISOString(),
      specimens: [{ bodySiteId }],
    });
    expect(res.status).toBe(201);

    const orderId = res.body.data.orderId as string;
    createdOrderIds.push(orderId);

    const order = await prisma.order.findUniqueOrThrow({ where: { orderId } });
    createdPatientIds.push(order.patientId);
    createdDoctorIds.push(order.doctorId);

    return { orderId, caseType: order.caseType };
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
        firstName: 'CaseType',
        lastName: 'Tester',
        employeeRoleId: roleId,
        password: 'Integration1!',
      },
    });
    expect(loginRes.status).toBe(200);
    employeeId = Number(loginRes.body.data.employeeId);
  });

  afterAll(async () => {
    if (createdOrderIds.length) {
      const where = { orderId: { in: createdOrderIds } } as const;
      await prisma.ancillaryOrder.deleteMany({ where });
      await prisma.reportFile.deleteMany({ where: { report: { orderId: { in: createdOrderIds } } } });
      await prisma.report.deleteMany({ where });
      await prisma.slide.deleteMany({
        where: { block: { specimen: { orderId: { in: createdOrderIds } } } },
      });
      await prisma.block.deleteMany({ where: { specimen: { orderId: { in: createdOrderIds } } } });
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

  it('assigns the SU prefix to a surgical pathology case', async () => {
    const created = await createCase('Surgical Pathology');

    expect(created.caseType).toBe('Surgical Pathology');
    expect(created.orderId).toMatch(/^SU\d{9}$/);
  });

  it('assigns the CN prefix to a cytology case', async () => {
    const created = await createCase('Cytology');

    expect(created.caseType).toBe('Cytology');
    expect(created.orderId).toMatch(/^CN\d{9}$/);
  });

  it('keeps surgical and cytology accession sequences independent', async () => {
    const firstSurgical = await createCase('Surgical Pathology');
    const firstCytology = await createCase('Cytology');
    const secondSurgical = await createCase('Surgical Pathology');
    const secondCytology = await createCase('Cytology');

    const sequenceOf = (orderId: string): number => Number(orderId.slice(4));

    // Each prefix has its own counter, so both advance by exactly one.
    expect(sequenceOf(secondSurgical.orderId)).toBe(sequenceOf(firstSurgical.orderId) + 1);
    expect(sequenceOf(secondCytology.orderId)).toBe(sequenceOf(firstCytology.orderId) + 1);
  });

  it('encodes the current two-digit year in the accession number', async () => {
    const created = await createCase('Surgical Pathology');
    const expectedYear = String(new Date().getFullYear() % 100).padStart(2, '0');

    expect(created.orderId.slice(2, 4)).toBe(expectedYear);
  });

  it('finds a cytology case by its accession number through /query', async () => {
    const created = await createCase('Cytology');

    const res = await agent.get(`/api/orders/query?orderId=${encodeURIComponent(created.orderId)}`);
    expect(res.status).toBe(200);

    const match = (res.body.data as Array<{ orderId: string; caseType: string | null }>).find(
      (row) => row.orderId === created.orderId
    );
    expect(match).toBeDefined();
    expect(match?.caseType).toBe('Cytology');
  });
});
