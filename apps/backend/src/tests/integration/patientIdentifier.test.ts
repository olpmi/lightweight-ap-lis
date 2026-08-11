/**
 * Patient-identifier allocation tests.
 *
 * Identifiers were previously `'P' + Date.now().toString().slice(-7)`, which
 * repeats every ~2.8 hours, combined with a find-then-create lookup that
 * returned any existing row with that ID without comparing demographics. Two
 * consequences followed: concurrent registrations in the same millisecond
 * collided on the primary key and returned 409, and — more seriously — a
 * repeated identifier could silently attach a new patient's case to an
 * unrelated existing record.
 *
 * Allocation now comes from the `patient_sequence` counter via a single atomic
 * increment, and a caller-supplied identifier whose demographics disagree with
 * the stored record is rejected rather than accepted.
 *
 * Skipped unless DATABASE_URL + SESSION_SECRET are set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { EMPLOYEE_ROLES } from '@lis/shared';
import { createEmployeeAndLogin } from '../helpers/auth.js';

const hasDb = Boolean(process.env.DATABASE_URL && process.env.SESSION_SECRET);

describe.skipIf(!hasDb)('Patient identifier allocation', () => {
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const userName = `pid_${nonce}`;
  let roleId = 0;
  let employeeId = 0;
  let bodySiteId = 0;
  const createdOrderIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdDoctorIds: bigint[] = [];

  const app = createApp();
  const agent = request.agent(app);

  interface NewPatientFields {
    patientLastName?: string;
    patientFirstName?: string;
    patientDateOfBirth?: string;
    patientSex?: string;
    patientId?: string;
  }

  function orderPayload(overrides: NewPatientFields): Record<string, unknown> {
    return {
      patientLastName: `Doe_${nonce}`,
      patientFirstName: 'Jane',
      patientDateOfBirth: '1980-01-01',
      patientSex: 'Female',
      doctorLastName: `House_${nonce}`,
      doctorFirstName: 'Gregory',
      caseType: 'Surgical Pathology',
      registeredDate: new Date().toISOString(),
      specimens: [{ bodySiteId }],
      ...overrides,
    };
  }

  /** Creates a case and records the IDs it generated so teardown can remove them. */
  async function createCase(overrides: NewPatientFields = {}): Promise<{
    status: number;
    orderId?: string;
    patientId?: string;
    body: Record<string, unknown>;
  }> {
    const res = await agent.post('/api/orders').send(orderPayload(overrides));
    if (res.status !== 201) return { status: res.status, body: res.body };

    const orderId = res.body.data.orderId as string;
    createdOrderIds.push(orderId);

    const order = await prisma.order.findUniqueOrThrow({ where: { orderId } });
    createdPatientIds.push(order.patientId);
    createdDoctorIds.push(order.doctorId);

    return { status: res.status, orderId, patientId: order.patientId, body: res.body };
  }

  beforeAll(async () => {

    const bodySite = await prisma.bodySite.upsert({
      where: { bodySiteName: 'Test Site' },
      update: {},
      create: { bodySiteName: 'Test Site' },
    });
    bodySiteId = bodySite.bodySiteId;

    const actor = await createEmployeeAndLogin(agent, EMPLOYEE_ROLES.PATHOLOGIST, userName, {
      firstName: 'Patient',
      lastName: 'IdTester',
    });
    employeeId = actor.employeeId;
    roleId = actor.employeeRoleId;
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

  it('allocates a distinct identifier to each sequential registration', async () => {
    const first = await createCase({ patientFirstName: 'Alpha' });
    const second = await createCase({ patientFirstName: 'Beta' });
    const third = await createCase({ patientFirstName: 'Gamma' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(third.status).toBe(201);

    const ids = [first.patientId, second.patientId, third.patientId];
    for (const id of ids) expect(id).toMatch(/^P\d{7,}$/);
    expect(new Set(ids).size).toBe(3);
  });

  it('increments monotonically rather than deriving the identifier from the clock', async () => {
    const first = await createCase({ patientFirstName: 'Mono1' });
    const second = await createCase({ patientFirstName: 'Mono2' });

    const numeric = (patientId: string): number => Number(patientId.slice(1));
    expect(numeric(second.patientId as string)).toBe(numeric(first.patientId as string) + 1);
  });

  it('registers concurrent patients without collisions', async () => {
    // The old timestamp scheme produced duplicate IDs for requests landing in
    // the same millisecond, which surfaced as 409s under load.
    const CONCURRENCY = 15;
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, index) =>
        createCase({ patientFirstName: `Concurrent${index}` })
      )
    );

    const created = results.filter((result) => result.status === 201);
    expect(created).toHaveLength(CONCURRENCY);

    const ids = created.map((result) => result.patientId);
    expect(new Set(ids).size).toBe(CONCURRENCY);
  });

  it('never reuses an identifier already held by another patient', async () => {
    const existing = await createCase({
      patientFirstName: 'Existing',
      patientLastName: `Holder_${nonce}`,
    });

    const fresh = await createCase({
      patientFirstName: 'Fresh',
      patientLastName: `Newcomer_${nonce}`,
    });

    expect(fresh.patientId).not.toBe(existing.patientId);

    const [existingRow, freshRow] = await Promise.all([
      prisma.patient.findUniqueOrThrow({ where: { patientId: existing.patientId as string } }),
      prisma.patient.findUniqueOrThrow({ where: { patientId: fresh.patientId as string } }),
    ]);

    expect(existingRow.firstName).toBe('Existing');
    expect(freshRow.firstName).toBe('Fresh');
  });

  it('accepts an existing patient identifier when the supplied details match', async () => {
    const first = await createCase({
      patientFirstName: 'Returning',
      patientLastName: `Patient_${nonce}`,
      patientDateOfBirth: '1975-06-15',
      patientSex: 'Male',
    });
    expect(first.status).toBe(201);

    const second = await createCase({
      patientId: first.patientId,
      patientFirstName: 'Returning',
      patientLastName: `Patient_${nonce}`,
      patientDateOfBirth: '1975-06-15',
      patientSex: 'Male',
    });

    expect(second.status).toBe(201);
    // Same person, so the second case attaches to the same record.
    expect(second.patientId).toBe(first.patientId);
  });

  it('rejects an existing patient identifier whose details disagree', async () => {
    const first = await createCase({
      patientFirstName: 'Original',
      patientLastName: `Mismatch_${nonce}`,
      patientDateOfBirth: '1970-02-02',
      patientSex: 'Female',
    });
    expect(first.status).toBe(201);

    // A different person sent against the same identifier must not be silently
    // merged into the existing record — this is the patient-safety case.
    const conflicting = await createCase({
      patientId: first.patientId,
      patientFirstName: 'Different',
      patientLastName: `Person_${nonce}`,
      patientDateOfBirth: '1991-11-11',
      patientSex: 'Male',
    });

    expect(conflicting.status).toBe(409);
    expect((conflicting.body.error as { code: string }).code).toBe('PATIENT_MISMATCH');

    const stored = await prisma.patient.findUniqueOrThrow({
      where: { patientId: first.patientId as string },
    });
    expect(stored.firstName).toBe('Original');
  });

  it('returns 404 for an unknown patient identifier', async () => {
    const res = await agent.post('/api/orders').send(
      orderPayload({ patientId: `P${nonce.slice(0, 6)}zz` })
    );
    expect(res.status).toBe(404);
  });
});
