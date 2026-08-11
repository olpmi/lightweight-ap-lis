/**
 * CSV data-import tests.
 *
 * Production deployments start with an empty database, so this endpoint is how
 * a real lab loads its roster. The properties that matter most are the ones a
 * careless implementation gets wrong: a preview must write nothing, a file with
 * a single bad row must write nothing, and re-uploading a file must not double
 * the roster or reset anyone's password.
 *
 * Skipped unless DATABASE_URL + SESSION_SECRET are set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { EMPLOYEE_ROLES } from '@lis/shared';
import { createEmployeeAndLogin, ensureRole } from '../helpers/auth.js';

const hasDb = Boolean(process.env.DATABASE_URL && process.env.SESSION_SECRET);

describe.skipIf(!hasDb)('CSV data import', () => {
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const userName = `imp_${nonce}`;
  const surname = `ZZIMPORT_${nonce}`;
  let roleId = 0;
  let employeeId = 0;

  const app = createApp();
  const agent = request.agent(app);

  /** Posts a CSV body the way the frontend does. */
  const post = (pathname: string, csv: string) =>
    agent.post(pathname).set('Content-Type', 'text/csv').send(csv);

  const previewPatients = (csv: string) => post('/api/config/data-import/patients/preview', csv);
  const commitPatients = (csv: string) => post('/api/config/data-import/patients', csv);

  const patientsCsv = (rows: string[]) =>
    ['patient_id,last_name,first_name,date_of_birth,sex', ...rows].join('\n');

  beforeAll(async () => {
    // Roster import provisions staff accounts, so the whole /api/config/data-import
    // surface is Administrator-only.
    const actor = await createEmployeeAndLogin(agent, EMPLOYEE_ROLES.ADMINISTRATOR, userName, {
      firstName: 'Import',
      lastName: 'Tester',
    });
    employeeId = actor.employeeId;

    // The staff-import test asserts that a lower-cased `pathologist` in the CSV
    // resolves to the canonical Pathologist role, which is a different row from
    // the importing administrator's own.
    roleId = await ensureRole(EMPLOYEE_ROLES.PATHOLOGIST);
  });

  afterAll(async () => {
    await prisma.patient.deleteMany({ where: { lastName: surname } });
    await prisma.doctor.deleteMany({ where: { lastName: surname } });
    await prisma.employee.deleteMany({ where: { userName: { startsWith: `${userName}_staff` } } });
    if (employeeId) {
      await prisma.employee.deleteMany({ where: { employeeId: BigInt(employeeId) } });
    }
  });

  // -------------------------------------------------------------------------
  // Access and transport
  // -------------------------------------------------------------------------

  it('rejects an unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/config/data-import/patients/preview')
      .set('Content-Type', 'text/csv')
      .send(patientsCsv([`,${surname},Alpha,1980-01-01,Female`]));
    expect(res.status).toBe(401);
  });

  it('rejects a JSON body with 415 rather than misparsing it', async () => {
    const res = await agent
      .post('/api/config/data-import/patients/preview')
      .send({ csv: patientsCsv([`,${surname},Alpha,1980-01-01,Female`]) });
    expect(res.status).toBe(415);
  });

  it('404s an unknown import type', async () => {
    const res = await post('/api/config/data-import/unicorns/preview', 'a\n1');
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Header validation
  // -------------------------------------------------------------------------

  it('rejects a file missing a required column', async () => {
    const res = await previewPatients(`last_name,first_name\n${surname},Alpha`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IMPORT_BAD_HEADER');
    expect(res.body.error.message).toMatch(/date_of_birth/);
  });

  it('rejects an unrecognized column instead of silently ignoring it', async () => {
    // Every required column is present here, so this isolates the unknown-column
    // check. A stray `notes` column would otherwise be dropped without comment,
    // and the same leniency is what lets a typo'd header import blank fields.
    const res = await previewPatients(
      `last_name,first_name,date_of_birth,notes\n${surname},Alpha,1980-01-01,hello`,
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IMPORT_BAD_HEADER');
    expect(res.body.error.message).toMatch(/notes/);
  });

  it('rejects a file over the row ceiling', async () => {
    const rows = Array.from(
      { length: 5001 },
      (_, i) => `,${surname},Row${i},1980-01-01,Female`,
    );
    const res = await previewPatients(patientsCsv(rows));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IMPORT_PARSE_ERROR');
  });

  // -------------------------------------------------------------------------
  // Preview
  // -------------------------------------------------------------------------

  it('reports per-row errors and writes nothing', async () => {
    const before = await prisma.patient.count({ where: { lastName: surname } });

    const res = await previewPatients(
      patientsCsv([
        `,${surname},Valid,1980-01-01,Female`,
        `,${surname},BadDate,05/01/2001,Female`,
      ]),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.counts.error).toBe(1);
    expect(res.body.data.counts.create).toBe(1);
    expect(res.body.data.canCommit).toBe(false);
    expect(res.body.data.errors[0].column).toBe('date_of_birth');
    // Line 3, not row 2: the number the user sees in their spreadsheet.
    expect(res.body.data.errors[0].line).toBe(3);

    expect(await prisma.patient.count({ where: { lastName: surname } })).toBe(before);
  });

  it('reports the correct line after a record containing a quoted newline', async () => {
    const res = await previewPatients(
      patientsCsv([
        `,"${surname}","Multi\nLine",1980-01-01,Female`,
        `,${surname},BadDate,not-a-date,Female`,
      ]),
    );
    expect(res.status).toBe(200);
    // The first record spans lines 2-3, so the bad row is line 4.
    expect(res.body.data.errors[0].line).toBe(4);
  });

  // -------------------------------------------------------------------------
  // Commit
  // -------------------------------------------------------------------------

  it('imports valid rows and allocates identifiers for blank patient_id cells', async () => {
    const res = await commitPatients(
      patientsCsv([
        `,${surname},Ada,1970-05-05,Female`,
        `,${surname},Grace,1971-06-06,f`,
        `,"${surname}","Comma, Name",1972-07-07,M`,
      ]),
    );

    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(3);

    const imported = await prisma.patient.findMany({
      where: { lastName: surname },
      orderBy: { patientId: 'asc' },
    });
    expect(imported).toHaveLength(3);
    for (const patient of imported) {
      expect(patient.patientId).toMatch(/^P\d{7}$/);
    }
    // A quoted field carrying a comma survives the round trip intact.
    expect(imported.map((p) => p.firstName)).toContain('Comma, Name');
    // Aliases resolve to the enum.
    expect(imported.map((p) => p.sex).sort()).toEqual(['Female', 'Female', 'Male']);
  });

  it('skips rows whose patient_id already exists, creating nothing', async () => {
    const id = `EX_${nonce}_1`;
    const csv = patientsCsv([`${id},${surname},Repeat,1975-01-01,Female`]);

    const first = await commitPatients(csv);
    expect(first.status).toBe(201);
    expect(first.body.data.created).toBe(1);

    // Re-running the same import is a successful no-op, not an error: a
    // scripted re-run should be safe, and the UI disables the button anyway
    // once the preview reports nothing to create.
    const second = await commitPatients(csv);
    expect(second.status).toBe(201);
    expect(second.body.data.created).toBe(0);
    expect(second.body.data.skipped).toBe(1);

    const preview = await previewPatients(csv);
    expect(preview.body.data.counts.skip).toBe(1);
    expect(preview.body.data.counts.create).toBe(0);
    expect(preview.body.data.canCommit).toBe(false);
    expect(preview.body.data.rows[0].reason).toBe('ALREADY_EXISTS');

    expect(await prisma.patient.count({ where: { patientId: id } })).toBe(1);
  });

  it('refuses to overwrite an existing patient whose details disagree', async () => {
    const id = `EX_${nonce}_2`;
    await commitPatients(patientsCsv([`${id},${surname},Original,1975-01-01,Female`]));

    const res = await previewPatients(patientsCsv([`${id},${surname},Different,1990-09-09,Male`]));
    expect(res.status).toBe(200);
    expect(res.body.data.counts.error).toBe(1);
    expect(res.body.data.errors[0].code).toBe('PATIENT_MISMATCH');

    const stored = await prisma.patient.findUniqueOrThrow({ where: { patientId: id } });
    expect(stored.firstName).toBe('Original');
  });

  it('flags a patient_id repeated within one file', async () => {
    const id = `EX_${nonce}_3`;
    const res = await previewPatients(
      patientsCsv([
        `${id},${surname},First,1975-01-01,Female`,
        `${id},${surname},Second,1975-01-01,Female`,
      ]),
    );
    expect(res.body.data.errors.some((e: { code: string }) => e.code === 'DUPLICATE_IN_FILE')).toBe(
      true,
    );
  });

  it('imports nothing when any single row fails validation', async () => {
    const before = await prisma.patient.count({ where: { lastName: surname } });

    const res = await commitPatients(
      patientsCsv([
        `,${surname},WouldBeFine,1980-01-01,Female`,
        `,${surname},Broken,1980-13-45,Female`,
      ]),
    );

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IMPORT_VALIDATION_FAILED');
    expect(await prisma.patient.count({ where: { lastName: surname } })).toBe(before);
  });

  it('keeps the allocator ahead of an explicitly supplied P####### identifier', async () => {
    const supplied = 'P9990001';
    await prisma.patient.deleteMany({ where: { patientId: supplied } });

    const res = await commitPatients(patientsCsv([`${supplied},${surname},Sequence,1980-01-01,Female`]));
    expect(res.status).toBe(201);

    const sequence = await prisma.patientSequence.findUniqueOrThrow({ where: { id: 1 } });
    expect(sequence.lastValue).toBeGreaterThanOrEqual(9990001);

    await prisma.patient.deleteMany({ where: { patientId: supplied } });
  });

  // -------------------------------------------------------------------------
  // Doctors
  // -------------------------------------------------------------------------

  it('matches existing referring clinicians case-insensitively and collapses in-file duplicates', async () => {
    const csv = `last_name,first_name\n${surname},Mary\n${surname.toLowerCase()},mary\n${surname},Chidi`;

    const first = await post('/api/config/data-import/doctors', csv);
    expect(first.status).toBe(201);
    // Three rows, two distinct clinicians.
    expect(first.body.data.created).toBe(2);

    const second = await post('/api/config/data-import/doctors/preview', csv);
    expect(second.body.data.counts.create).toBe(0);
    expect(second.body.data.counts.skip).toBe(3);

    expect(await prisma.doctor.count({ where: { lastName: surname } })).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Staff
  // -------------------------------------------------------------------------

  it('resolves the role by name, hashes the password, and never echoes it back', async () => {
    const staffUser = `${userName}_staff1`;
    const csv = [
      'user_name,last_name,first_name,role,default_language,password',
      // Lower-cased role name still resolves.
      `${staffUser},${surname},Sam,pathologist,sw,SuppliedPass1`,
    ].join('\n');

    const res = await post('/api/config/data-import/staff', csv);
    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain('SuppliedPass1');

    const created = await prisma.employee.findUniqueOrThrow({ where: { userName: staffUser } });
    expect(created.employeeRoleId).toBe(roleId);
    expect(created.defaultLanguage).toBe('sw');
    expect(created.passwordHash).toBeTruthy();
    expect(created.passwordHash).not.toBe('SuppliedPass1');
    expect(await bcrypt.compare('SuppliedPass1', created.passwordHash!)).toBe(true);
  });

  it('rejects an unknown role and lists the valid ones', async () => {
    const csv = [
      'user_name,last_name,first_name,role,default_language,password',
      `${userName}_staff_bad,${surname},Nope,Wizard,en,SuppliedPass1`,
    ].join('\n');

    const res = await post('/api/config/data-import/staff/preview', csv);
    expect(res.body.data.counts.error).toBe(1);
    expect(res.body.data.errors[0].column).toBe('role');
    expect(res.body.data.errors[0].message).toMatch(/pathologist/i);
  });

  it('leaves an existing account untouched, including its password hash', async () => {
    const staffUser = `${userName}_staff2`;
    const header = 'user_name,last_name,first_name,role,default_language,password';

    const created = await post(
      '/api/config/data-import/staff',
      `${header}\n${staffUser},${surname},Original,Pathologist,en,OriginalPass1`,
    );
    expect(created.status).toBe(201);
    const before = await prisma.employee.findUniqueOrThrow({ where: { userName: staffUser } });

    // Same username, different password: re-running an import must not reset it.
    const again = await post(
      '/api/config/data-import/staff/preview',
      `${header}\n${staffUser},${surname},Original,Pathologist,en,DifferentPass1`,
    );
    expect(again.body.data.counts.skip).toBe(1);
    expect(again.body.data.counts.create).toBe(0);

    const after = await prisma.employee.findUniqueOrThrow({ where: { userName: staffUser } });
    expect(after.passwordHash).toBe(before.passwordHash);
  });
});
