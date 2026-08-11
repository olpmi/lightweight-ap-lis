/**
 * Role-based authorization, end to end over HTTP.
 *
 * The unit tests prove the guards decide correctly in isolation; these prove the
 * guards are actually mounted on the routes that matter. That distinction is the
 * point of the suite — the defect this feature fixes was not a wrong decision,
 * it was no decision at all: role metadata existed and was never consulted.
 *
 * Three actors, one per role, each with its own cookie jar.
 *
 * Skipped unless DATABASE_URL + SESSION_SECRET are set, matching the other
 * integration suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { EMPLOYEE_ROLES } from '@lis/shared';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createEmployeeAndLogin } from '../helpers/auth.js';

const hasDb = Boolean(process.env.DATABASE_URL && process.env.SESSION_SECRET);

describe.skipIf(!hasDb)('Role-based authorization', () => {
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const surname = `ZZAUTHZ_${nonce}`;

  const app = createApp();
  const pathologist = request.agent(app);
  const technologist = request.agent(app);
  const administrator = request.agent(app);
  const anonymous = request(app);

  let pathologistId = 0;
  let technologistId = 0;
  let administratorId = 0;
  let bodySiteId = 0;
  const createdOrderIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdDoctorIds: bigint[] = [];

  /** An accessioned case with one specimen. */
  async function createOrder(agent: typeof pathologist): Promise<{ orderId: string; specimenId: string }> {
    // Small jitter: the auto-generated patientId is timestamp-derived and can
    // collide between rapid back-to-back calls.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const res = await agent.post('/api/orders').send({
      patientLastName: `${surname}_${createdOrderIds.length}`,
      patientFirstName: 'Jane',
      patientDateOfBirth: '1980-01-01',
      patientSex: 'Female',
      doctorLastName: surname,
      doctorFirstName: 'Gregory',
      caseType: 'Surgical Pathology',
      registeredDate: new Date().toISOString(),
      specimens: [{ bodySiteId }],
    });
    expect(res.status).toBe(201);

    const orderId = res.body.data.orderId as string;
    const specimenId = (res.body.data.specimens as Array<{ specimenId: string }>)[0].specimenId;
    createdOrderIds.push(orderId);

    const order = await prisma.order.findUniqueOrThrow({ where: { orderId } });
    createdDoctorIds.push(order.doctorId);
    createdPatientIds.push(order.patientId);

    return { orderId, specimenId };
  }

  /**
   * A case carried far enough that sign-out's own workflow guards are satisfied —
   * blocks cut, slides made, H&E distributed. Without this a sign-out attempt is
   * rejected as premature (400) and would tell us nothing about authorization.
   */
  async function createReportableOrder(): Promise<string> {
    const { orderId, specimenId } = await createOrder(pathologist);

    const blockRes = await pathologist.post(`/api/specimens/${specimenId}/blocks`).send({ count: 1 });
    expect(blockRes.status).toBe(201);
    const blockId = (blockRes.body.data as Array<{ blockId: string }>)[0].blockId;

    expect((await pathologist.post(`/api/blocks/${blockId}/slides`).send({ count: 1 })).status).toBe(201);
    expect(
      (await pathologist.patch(`/api/blocks/${blockId}/he-status`).send({ status: 'DISTRIBUTED' })).status
    ).toBe(200);

    return orderId;
  }

  /** Creates a draft as the pathologist and returns its report id. */
  async function draftFor(orderId: string): Promise<number> {
    const draft = await pathologist.post(`/api/orders/${orderId}/reports/draft`).send({
      diagnosis: 'Authorized diagnosis.',
      gross: 'Gross.',
      pathologistEmployeeId: pathologistId,
    });
    expect(draft.status).toBe(201);
    return Number(draft.body.data.reportId);
  }

  beforeAll(async () => {
    const bodySite = await prisma.bodySite.upsert({
      where: { bodySiteName: 'Test Site' },
      update: {},
      create: { bodySiteName: 'Test Site' },
    });
    bodySiteId = bodySite.bodySiteId;

    pathologistId = (
      await createEmployeeAndLogin(pathologist, EMPLOYEE_ROLES.PATHOLOGIST, `authz_path_${nonce}`, {
        firstName: 'Authz',
        lastName: 'Pathologist',
      })
    ).employeeId;

    technologistId = (
      await createEmployeeAndLogin(technologist, EMPLOYEE_ROLES.TECHNOLOGIST, `authz_tech_${nonce}`, {
        firstName: 'Authz',
        lastName: 'Technologist',
      })
    ).employeeId;

    administratorId = (
      await createEmployeeAndLogin(administrator, EMPLOYEE_ROLES.ADMINISTRATOR, `authz_admin_${nonce}`, {
        firstName: 'Authz',
        lastName: 'Administrator',
      })
    ).employeeId;
  });

  afterAll(async () => {
    if (createdOrderIds.length) {
      const where = { orderId: { in: createdOrderIds } } as const;
      await prisma.ancillaryOrder.deleteMany({ where });
      await prisma.reportFile.deleteMany({ where: { report: { orderId: { in: createdOrderIds } } } });
      await prisma.report.updateMany({ where, data: { supersedesReportId: null } });
      await prisma.report.deleteMany({ where });
      await prisma.slide.deleteMany({ where: { block: { specimen: where } } });
      await prisma.block.deleteMany({ where: { specimen: where } });
      await prisma.specimen.deleteMany({ where });
      await prisma.order.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    }
    if (createdPatientIds.length) {
      await prisma.patient.deleteMany({ where: { patientId: { in: createdPatientIds } } });
    }
    if (createdDoctorIds.length) {
      await prisma.doctor.deleteMany({ where: { doctorId: { in: createdDoctorIds } } });
    }
    const actorIds = [pathologistId, technologistId, administratorId].filter(Boolean).map((id) => BigInt(id));
    if (actorIds.length) {
      await prisma.employee.deleteMany({ where: { employeeId: { in: actorIds } } });
    }
  });

  // -------------------------------------------------------------------------
  // Work every authenticated user must still be able to do
  // -------------------------------------------------------------------------

  describe('routine technical work', () => {
    it('a technologist can accession a case', async () => {
      const { orderId } = await createOrder(technologist);
      expect(orderId).toBeTruthy();
    });

    it('a technologist can read the worklists', async () => {
      for (const path of ['/api/orders/processing-queue', '/api/orders/histology-queue', '/api/orders/result-queue']) {
        expect((await technologist.get(path)).status).toBe(200);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Clinically privileged acts — pathologist only
  // -------------------------------------------------------------------------

  describe('diagnostic authorship and sign-out', () => {
    it('rejects draft creation by a technologist', async () => {
      const { orderId } = await createOrder(pathologist);
      const res = await technologist.post(`/api/orders/${orderId}/reports/draft`).send({
        diagnosis: 'Attempted by a technologist.',
        gross: 'Gross.',
        pathologistEmployeeId: technologistId,
      });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects draft creation by an administrator', async () => {
      // Administrative authority is not clinical authority.
      const { orderId } = await createOrder(pathologist);
      const res = await administrator.post(`/api/orders/${orderId}/reports/draft`).send({
        diagnosis: 'Attempted by an administrator.',
        gross: 'Gross.',
        pathologistEmployeeId: administratorId,
      });
      expect(res.status).toBe(403);
    });

    it('allows a pathologist to draft and sign out, and records them as signatory', async () => {
      const reportId = await draftFor(await createReportableOrder());
      const signed = await pathologist.post(`/api/reports/${reportId}/signout`).send({
        diagnosis: 'Authorized diagnosis.',
        gross: 'Gross.',
        pathologistEmployeeId: pathologistId,
      });
      expect(signed.status).toBe(200);
      expect(signed.body.data.isFinal).toBe(true);
      expect(Number(signed.body.data.pathologistEmployeeId)).toBe(pathologistId);
    });

    it('rejects sign-out by a technologist', async () => {
      const reportId = await draftFor(await createReportableOrder());

      const res = await technologist.post(`/api/reports/${reportId}/signout`).send({
        diagnosis: 'Diagnosis.',
        gross: 'Gross.',
        pathologistEmployeeId: technologistId,
      });
      expect(res.status).toBe(403);

      const stored = await prisma.report.findUniqueOrThrow({ where: { reportId: BigInt(reportId) } });
      expect(stored.isFinal).toBe(false);
    });

    it('rejects preliminary sign-out by a technologist', async () => {
      const reportId = await draftFor(await createReportableOrder());

      const res = await technologist.post(`/api/reports/${reportId}/signprelim`).send({
        diagnosis: 'Diagnosis.',
        gross: 'Gross.',
        pathologistEmployeeId: technologistId,
      });
      expect(res.status).toBe(403);
    });

    it('rejects a pathologist attributing a sign-out to someone else', async () => {
      // The signatory comes from the request body, so the role gate alone would
      // still allow signing under a colleague's name.
      const reportId = await draftFor(await createReportableOrder());

      const res = await pathologist.post(`/api/reports/${reportId}/signout`).send({
        diagnosis: 'Diagnosis.',
        gross: 'Gross.',
        pathologistEmployeeId: technologistId,
      });
      expect(res.status).toBe(403);

      const stored = await prisma.report.findUniqueOrThrow({ where: { reportId: BigInt(reportId) } });
      expect(stored.isFinal).toBe(false);
    });
  });

  describe('amendment', () => {
    it('rejects reactivation by a technologist', async () => {
      const orderId = await createReportableOrder();
      const reportId = await draftFor(orderId);
      expect(
        (
          await pathologist.post(`/api/reports/${reportId}/signout`).send({
            diagnosis: 'Authorized diagnosis.',
            gross: 'Gross.',
            pathologistEmployeeId: pathologistId,
          })
        ).status
      ).toBe(200);

      const res = await technologist.post(`/api/orders/${orderId}/reactivate`).send({
        reactivationType: 'revise',
        reactivationReason: 'Attempted by a technologist.',
      });
      expect(res.status).toBe(403);

      const order = await prisma.order.findUniqueOrThrow({ where: { orderId } });
      expect(order.isReactivated).toBe(false);
    });
  });

  describe('terminal order status', () => {
    it('rejects COMPLETED from a technologist', async () => {
      // The direct status write reaches the same terminal state as sign-out
      // without passing through any ReportService guard.
      const { orderId } = await createOrder(pathologist);
      const res = await technologist.patch(`/api/orders/${orderId}/status`).send({ status: 'COMPLETED' });
      expect(res.status).toBe(403);
    });

    it('allows routine triage statuses from a technologist', async () => {
      const { orderId } = await createOrder(pathologist);
      expect((await technologist.patch(`/api/orders/${orderId}/status`).send({ status: 'HOLD' })).status).toBe(200);
    });

    it('allows COMPLETED from a pathologist', async () => {
      const { orderId } = await createOrder(pathologist);
      expect((await pathologist.patch(`/api/orders/${orderId}/status`).send({ status: 'COMPLETED' })).status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Configuration — administrator only
  // -------------------------------------------------------------------------

  describe('configuration surface', () => {
    it('rejects a template write by a pathologist', async () => {
      const res = await pathologist.post('/api/config/report-templates').send({
        templateName: `Authz ${nonce}`,
        reportType: 'final',
        content: 'Body',
      });
      expect(res.status).toBe(403);
    });

    it('rejects an ancillary catalog write by a technologist', async () => {
      const res = await technologist.post('/api/config/ancillary/orderables').send({
        category: 'IHC',
        name: `Authz stain ${nonce}`,
      });
      expect(res.status).toBe(403);
    });

    it('rejects a report-layout write by a pathologist', async () => {
      const res = await pathologist.put('/api/config/report-layouts').send({
        reportType: 'final',
        name: `Authz layout ${nonce}`,
        htmlTemplate: '<html><body>x</body></html>',
      });
      expect(res.status).toBe(403);
    });

    it('still allows every authenticated role to read configuration', async () => {
      // Reporting itself loads templates, so reads must stay open.
      for (const agent of [pathologist, technologist, administrator]) {
        expect((await agent.get('/api/config/report-templates')).status).toBe(200);
      }
    });
  });

  describe('roster import', () => {
    const staffCsv = (user: string) =>
      [
        'user_name,last_name,first_name,role,default_language,password',
        `${user},${surname},Imported,Pathologist,en,ImportedPass1`,
      ].join('\n');

    it('rejects a staff import by a pathologist', async () => {
      // Importing staff provisions accounts, so it is administrative rather than
      // clinical — otherwise a pathologist could mint further pathologists.
      const res = await pathologist
        .post('/api/config/data-import/staff')
        .set('Content-Type', 'text/csv')
        .send(staffCsv(`authz_imp_a_${nonce}`));
      expect(res.status).toBe(403);
      expect(await prisma.employee.findUnique({ where: { userName: `authz_imp_a_${nonce}` } })).toBeNull();
    });

    it('rejects a staff import by a technologist', async () => {
      const res = await technologist
        .post('/api/config/data-import/staff')
        .set('Content-Type', 'text/csv')
        .send(staffCsv(`authz_imp_b_${nonce}`));
      expect(res.status).toBe(403);
    });

    it('allows a staff import by an administrator', async () => {
      const user = `authz_imp_c_${nonce}`;
      const res = await administrator
        .post('/api/config/data-import/staff')
        .set('Content-Type', 'text/csv')
        .send(staffCsv(user));
      expect(res.status).toBe(201);
      await prisma.employee.deleteMany({ where: { userName: user } });
    });
  });

  // -------------------------------------------------------------------------
  // Account provisioning
  // -------------------------------------------------------------------------

  describe('account provisioning', () => {
    it('refuses anonymous account creation once an account exists', async () => {
      // The escalation that made every other guard decorative: an unauthenticated
      // caller could create an account with any role it chose. With accounts
      // present the caller is simply unauthenticated, so 401 rather than 403.
      const res = await anonymous.post('/api/employees').send({
        firstName: 'Anon',
        lastName: surname,
        userName: `authz_anon_${nonce}`,
        employeeRoleId: 1,
        password: 'AnonPass1!',
      });
      expect(res.status).toBe(401);
      expect(await prisma.employee.findUnique({ where: { userName: `authz_anon_${nonce}` } })).toBeNull();
    });

    it('refuses anonymous self-registration through the login endpoint', async () => {
      const res = await anonymous.post('/api/auth/login').send({
        newEmployee: {
          firstName: 'Anon',
          lastName: surname,
          userName: `authz_anonlogin_${nonce}`,
          employeeRoleId: 1,
          password: 'AnonPass1!',
        },
      });
      expect(res.status).toBe(403);
      expect(await prisma.employee.findUnique({ where: { userName: `authz_anonlogin_${nonce}` } })).toBeNull();
    });

    it('refuses account creation by a pathologist', async () => {
      const res = await pathologist.post('/api/employees').send({
        firstName: 'Made',
        lastName: surname,
        userName: `authz_bypath_${nonce}`,
        employeeRoleId: 1,
        password: 'MadePass1!',
      });
      expect(res.status).toBe(403);
    });

    it('allows an administrator to create an account and change a role', async () => {
      const userName = `authz_made_${nonce}`;
      const created = await administrator.post('/api/employees').send({
        firstName: 'Made',
        lastName: surname,
        userName,
        employeeRoleId: (await prisma.employeeRole.findUniqueOrThrow({
          where: { roleName: EMPLOYEE_ROLES.TECHNOLOGIST },
        })).employeeRoleId,
        password: 'MadePass1!',
      });
      expect(created.status).toBe(201);

      const madeId = Number(created.body.data.employeeId);
      const promoted = await administrator
        .patch(`/api/employees/${madeId}/role`)
        .send({ roleName: EMPLOYEE_ROLES.PATHOLOGIST });
      expect(promoted.status).toBe(200);
      expect(promoted.body.data.employeeRole.roleName).toBe(EMPLOYEE_ROLES.PATHOLOGIST);

      await prisma.employee.deleteMany({ where: { employeeId: BigInt(madeId) } });
    });

    it('refuses a role change by a non-administrator', async () => {
      const res = await pathologist
        .patch(`/api/employees/${technologistId}/role`)
        .send({ roleName: EMPLOYEE_ROLES.PATHOLOGIST });
      expect(res.status).toBe(403);

      const unchanged = await prisma.employee.findUniqueOrThrow({
        where: { employeeId: BigInt(technologistId) },
        include: { employeeRole: true },
      });
      expect(unchanged.employeeRole.roleName).toBe(EMPLOYEE_ROLES.TECHNOLOGIST);
    });

    it('takes a revoked role into effect without waiting for the session to expire', async () => {
      // requireCurrentRole re-reads the role, so a demotion applies to the live
      // session rather than at next login.
      const demoted = request.agent(app);
      const actor = await createEmployeeAndLogin(demoted, EMPLOYEE_ROLES.PATHOLOGIST, `authz_demo_${nonce}`, {
        firstName: 'Authz',
        lastName: 'Demoted',
      });

      const { orderId } = await createOrder(pathologist);
      const allowed = await demoted.post(`/api/orders/${orderId}/reports/draft`).send({
        diagnosis: 'Before demotion.',
        gross: 'Gross.',
        pathologistEmployeeId: actor.employeeId,
      });
      expect(allowed.status).toBe(201);

      expect(
        (
          await administrator
            .patch(`/api/employees/${actor.employeeId}/role`)
            .send({ roleName: EMPLOYEE_ROLES.TECHNOLOGIST })
        ).status
      ).toBe(200);

      const { orderId: afterOrderId } = await createOrder(pathologist);
      const refused = await demoted.post(`/api/orders/${afterOrderId}/reports/draft`).send({
        diagnosis: 'After demotion.',
        gross: 'Gross.',
        pathologistEmployeeId: actor.employeeId,
      });
      expect(refused.status).toBe(403);

      await prisma.report.deleteMany({ where: { orderId } });
      await prisma.employee.deleteMany({ where: { employeeId: BigInt(actor.employeeId) } });
    });
  });
});
