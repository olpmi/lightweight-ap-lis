/**
 * Order-entry typeahead tests.
 *
 * The patient and referring-clinician typeaheads fire a search the moment the
 * field is focused, before the user has typed. Both endpoints used to reject an
 * empty `q` with 400, which the dropdown rendered as "No options" — so on a
 * freshly provisioned deployment, whose roster had just arrived by CSV import,
 * order entry looked as though the import had silently failed.
 *
 * Skipped unless DATABASE_URL + SESSION_SECRET are set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const hasDb = Boolean(process.env.DATABASE_URL && process.env.SESSION_SECRET);

describe.skipIf(!hasDb)('Order-entry typeahead search', () => {
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const userName = `tah_${nonce}`;
  const surname = `ZZTYPEAHEAD_${nonce}`;
  let employeeId = 0;

  const app = createApp();
  const agent = request.agent(app);

  beforeAll(async () => {
    const role = await prisma.employeeRole.upsert({
      where: { roleName: 'pathologist' },
      update: {},
      create: { roleName: 'pathologist' },
    });

    const loginRes = await agent.post('/api/auth/login').send({
      newEmployee: {
        userName,
        firstName: 'Typeahead',
        lastName: 'Tester',
        employeeRoleId: role.employeeRoleId,
        password: 'Integration1!',
      },
    });
    expect(loginRes.status).toBe(200);
    employeeId = Number(loginRes.body.data.employeeId);

    await prisma.patient.create({
      data: {
        patientId: `TA_${nonce}`,
        lastName: surname,
        firstName: 'Grace',
        dateOfBirth: new Date('1984-03-17T00:00:00.000Z'),
        sex: 'Female',
      },
    });
    await prisma.doctor.create({ data: { lastName: surname, firstName: 'Mary' } });
  });

  afterAll(async () => {
    await prisma.patient.deleteMany({ where: { lastName: surname } });
    await prisma.doctor.deleteMany({ where: { lastName: surname } });
    if (employeeId) {
      await prisma.employee.deleteMany({ where: { employeeId: BigInt(employeeId) } });
    }
  });

  describe.each([
    ['patients', '/api/patients/search'],
    ['doctors', '/api/doctors/search'],
  ])('%s', (_label, endpoint) => {
    it('returns a first page when the field is focused but empty', async () => {
      // This is the request the dropdown makes on open.
      const res = await agent.get(`${endpoint}?q=`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('returns a first page when q is absent entirely', async () => {
      const res = await agent.get(endpoint);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('treats a whitespace-only query as empty rather than matching nothing', async () => {
      const res = await agent.get(`${endpoint}?q=%20%20`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('still filters on a real query', async () => {
      const res = await agent.get(`${endpoint}?q=${surname}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].lastName).toBe(surname);
    });

    it('returns an empty list, not an error, when nothing matches', async () => {
      const res = await agent.get(`${endpoint}?q=nobodynamedthis_${nonce}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('rejects an over-long query', async () => {
      const res = await agent.get(`${endpoint}?q=${'x'.repeat(101)}`);
      expect(res.status).toBe(400);
    });

    it('orders results stably, so the same call lists the same people', async () => {
      const [first, second] = await Promise.all([
        agent.get(`${endpoint}?q=`),
        agent.get(`${endpoint}?q=`),
      ]);
      expect(first.body.data.map((r: { lastName: string }) => r.lastName)).toEqual(
        second.body.data.map((r: { lastName: string }) => r.lastName),
      );
    });
  });

  it('lists a patient that arrived through the CSV import', async () => {
    // The reported symptom, end to end: import, then open order entry.
    const csv = [
      'patient_id,last_name,first_name,date_of_birth,sex',
      `IMP_${nonce},${surname},Imported,1990-04-04,Female`,
    ].join('\n');

    const imported = await agent
      .post('/api/config/data-import/patients')
      .set('Content-Type', 'text/csv')
      .send(csv);
    expect(imported.status).toBe(201);

    const res = await agent.get('/api/patients/search?q=');
    expect(res.status).toBe(200);
    expect(
      res.body.data.some((p: { patientId: string }) => p.patientId === `IMP_${nonce}`),
    ).toBe(true);
  });
});
