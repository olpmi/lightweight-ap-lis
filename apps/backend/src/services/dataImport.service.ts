import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import {
  CsvFormatError,
  IMPORT_COLUMNS,
  IMPORT_ROW_LIMITS,
  importDoctorRowSchema,
  importPatientRowSchema,
  importStaffRowSchema,
  parseCsv,
  type DataImportEntity,
  type ImportPreview,
  type ImportResult,
  type ImportRowIssue,
  type ImportRowSummary,
} from '@lis/shared';
// `ZodSchema<T>` fixes the schema's *input* type to T as well, which these row
// schemas do not satisfy — they take a record of raw strings and transform it
// into typed values. Naming the input explicitly keeps the output inference.
import type { ZodType, ZodTypeDef } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { PatientService } from './patient.service.js';

/** Matches EmployeeService, so imported and UI-created accounts hash alike. */
const BCRYPT_ROUNDS = 12;

/**
 * Cap on how many rows are echoed back. A 5000-row file with 5000 problems
 * would otherwise produce a response nobody can read and a payload nobody
 * wants to send; the counts stay exact either way.
 */
const MAX_REPORTED = 200;

const patientService = new PatientService();

/** Never echo a password back to the client, even in an error report. */
function redact(column: string, value: string): string | undefined {
  if (column === 'password') return undefined;
  return value.length > 60 ? `${value.slice(0, 60)}…` : value;
}

/** Case- and whitespace-insensitive key for name matching. */
function nameKey(lastName: string, firstName: string): string {
  const norm = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();
  return `${norm(lastName)}|${norm(firstName)}`;
}

interface ValidatedRows<T> {
  rows: Array<{ line: number; row: number; value: T }>;
  issues: ImportRowIssue[];
  headers: string[];
}

export class DataImportService {
  async preview(entity: DataImportEntity, csv: string): Promise<ImportPreview> {
    return (await this.plan(entity, csv)).preview;
  }

  async commit(entity: DataImportEntity, csv: string): Promise<ImportResult> {
    const plan = await this.plan(entity, csv);

    // All-or-nothing per file. A file with a bad row is a file the user needs
    // to fix; importing the good half leaves them unable to re-run the whole
    // thing without hunting for what already landed.
    if (plan.preview.counts.error > 0) {
      throw new AppError(
        422,
        'IMPORT_VALIDATION_FAILED',
        `${plan.preview.counts.error} row(s) failed validation; nothing was imported`,
        { preview: plan.preview as unknown as Record<string, unknown> },
      );
    }

    const created = await plan.write();

    return { ...plan.preview, created, skipped: plan.preview.counts.skip };
  }

  // -------------------------------------------------------------------------
  // Shared front half: parse, check headers, validate each row
  // -------------------------------------------------------------------------

  private validateRows<T>(
    entity: DataImportEntity,
    csv: string,
    schema: ZodType<T, ZodTypeDef, Record<string, string>>,
  ): ValidatedRows<T> {
    const spec = IMPORT_COLUMNS[entity];

    let table;
    try {
      table = parseCsv(csv, { maxRows: IMPORT_ROW_LIMITS[entity] });
    } catch (err) {
      if (err instanceof CsvFormatError) {
        throw new AppError(400, 'IMPORT_PARSE_ERROR', err.message, { line: err.line });
      }
      throw err;
    }

    const missing = spec.required.filter((c) => !table.headers.includes(c));
    if (missing.length > 0) {
      throw new AppError(
        400,
        'IMPORT_BAD_HEADER',
        `Missing required column(s): ${missing.join(', ')}`,
        { expected: [...spec.all], required: [...spec.required], found: table.headers },
      );
    }

    // Unknown columns are rejected rather than ignored. A header typed as
    // `date_of_brith` would otherwise import every row with a blank date and
    // report complete success.
    const unknown = table.headers.filter((c) => !spec.all.includes(c));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        'IMPORT_BAD_HEADER',
        `Unrecognized column(s): ${unknown.join(', ')}`,
        { expected: [...spec.all], required: [...spec.required], found: table.headers },
      );
    }

    const rows: ValidatedRows<T>['rows'] = [];
    const issues: ImportRowIssue[] = [];

    table.rows.forEach((record, index) => {
      const row = index + 1;

      // A missing comma shifts every later field left, which without this check
      // would quietly file a date of birth as the patient's sex.
      if (record.values.length !== table.headers.length) {
        issues.push({
          line: record.line,
          row,
          code: 'COLUMN_COUNT',
          message: `Expected ${table.headers.length} columns, found ${record.values.length}`,
        });
        return;
      }

      // Pre-fill every column in the spec so an absent optional column and a
      // blank cell behave identically, and the row schemas never see undefined.
      const cells: Record<string, string> = Object.fromEntries(spec.all.map((c) => [c, '']));
      table.headers.forEach((header, i) => {
        cells[header] = record.values[i];
      });

      const parsed = schema.safeParse(cells);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const column = String(issue.path[0] ?? '');
          issues.push({
            line: record.line,
            row,
            column: column || undefined,
            code: 'INVALID_VALUE',
            message: issue.message,
            value: column ? redact(column, cells[column] ?? '') : undefined,
          });
        }
        return;
      }

      rows.push({ line: record.line, row, value: parsed.data });
    });

    return { rows, issues, headers: table.headers };
  }

  private buildPreview(
    entity: DataImportEntity,
    headers: string[],
    summaries: ImportRowSummary[],
    errors: ImportRowIssue[],
  ): ImportPreview {
    const spec = IMPORT_COLUMNS[entity];
    const counts = {
      total: summaries.length,
      create: summaries.filter((s) => s.action === 'create').length,
      skip: summaries.filter((s) => s.action === 'skip').length,
      error: errors.length,
    };

    return {
      entity,
      columns: { expected: [...spec.all], required: [...spec.required], found: headers },
      counts,
      rows: summaries.slice(0, MAX_REPORTED),
      errors: errors.slice(0, MAX_REPORTED),
      truncated: summaries.length > MAX_REPORTED || errors.length > MAX_REPORTED,
      canCommit: counts.error === 0 && counts.create > 0,
    };
  }

  private async plan(
    entity: DataImportEntity,
    csv: string,
  ): Promise<{ preview: ImportPreview; write: () => Promise<number> }> {
    switch (entity) {
      case 'patients':
        return this.planPatients(csv);
      case 'doctors':
        return this.planDoctors(csv);
      case 'staff':
        return this.planStaff(csv);
    }
  }

  // -------------------------------------------------------------------------
  // Patients
  // -------------------------------------------------------------------------

  private async planPatients(
    csv: string,
  ): Promise<{ preview: ImportPreview; write: () => Promise<number> }> {
    const { rows, issues, headers } = this.validateRows('patients', csv, importPatientRowSchema);

    const suppliedIds = rows.map((r) => r.value.patient_id).filter((id) => id !== '');
    const existing = suppliedIds.length
      ? await prisma.patient.findMany({ where: { patientId: { in: suppliedIds } } })
      : [];
    const existingById = new Map(existing.map((p) => [p.patientId, p]));

    const summaries: ImportRowSummary[] = [];
    const errors = [...issues];
    const seenInFile = new Set<string>();
    const creates: Prisma.PatientCreateManyInput[] = [];
    const generatedIdRows: Array<{ index: number }> = [];

    for (const { line, row, value } of rows) {
      const label = `${value.patient_id || '(generated)'} — ${value.last_name}, ${value.first_name} (${value.date_of_birth})`;

      if (value.patient_id !== '') {
        if (seenInFile.has(value.patient_id)) {
          errors.push({
            line,
            row,
            column: 'patient_id',
            code: 'DUPLICATE_IN_FILE',
            message: `patient_id '${value.patient_id}' appears more than once in this file`,
            value: value.patient_id,
          });
          continue;
        }
        seenInFile.add(value.patient_id);

        const match = existingById.get(value.patient_id);
        if (match) {
          // Compare rather than update. Overwriting an existing patient's
          // demographics with a different person's is the exact failure
          // PatientService.assertDemographicsMatch exists to prevent, so a
          // conflict is an error the user must resolve, not a silent merge.
          const mismatched: string[] = [];
          if (nameKey(match.lastName, match.firstName) !== nameKey(value.last_name, value.first_name)) {
            mismatched.push('name');
          }
          if (match.dateOfBirth.toISOString().slice(0, 10) !== value.date_of_birth) {
            mismatched.push('date_of_birth');
          }
          if (match.sex !== value.sex) mismatched.push('sex');

          if (mismatched.length > 0) {
            errors.push({
              line,
              row,
              column: 'patient_id',
              code: 'PATIENT_MISMATCH',
              message: `Patient '${value.patient_id}' already exists with different ${mismatched.join(', ')}. Verify the identifier before importing.`,
              value: value.patient_id,
            });
            continue;
          }

          summaries.push({ line, row, action: 'skip', label, reason: 'ALREADY_EXISTS' });
          continue;
        }
      }

      if (value.patient_id === '') generatedIdRows.push({ index: creates.length });

      creates.push({
        patientId: value.patient_id, // filled in below for generated ids
        lastName: value.last_name,
        firstName: value.first_name,
        dateOfBirth: new Date(`${value.date_of_birth}T00:00:00.000Z`),
        sex: value.sex,
      });
      summaries.push({ line, row, action: 'create', label });
    }

    const preview = this.buildPreview('patients', headers, summaries, errors);

    const write = async (): Promise<number> => {
      // Reserve identifiers before the transaction: the sequence increment must
      // be visible to concurrent callers immediately, and holding it inside the
      // import transaction would serialize every other patient registration
      // behind a bulk load.
      const generated = await patientService.generatePatientIds(generatedIdRows.length);
      generatedIdRows.forEach((target, i) => {
        creates[target.index].patientId = generated[i];
      });

      // Keep the allocator ahead of any explicitly supplied P####### value, so
      // a later generatePatientId() cannot hand out an identifier this import
      // just used. Same intent as the patient_id_sequence migration.
      const maxSupplied = suppliedIds.reduce((highest, id) => {
        const match = /^P(\d{1,9})$/.exec(id);
        if (!match) return highest;
        return Math.max(highest, Number(match[1]));
      }, 0);

      return prisma.$transaction(async (tx) => {
        const result = await tx.patient.createMany({ data: creates });
        if (maxSupplied > 0) {
          await tx.$executeRaw`UPDATE patient_sequence SET last_value = GREATEST(last_value, ${maxSupplied}) WHERE id = 1`;
        }
        return result.count;
      });
    };

    return { preview, write };
  }

  // -------------------------------------------------------------------------
  // Referring doctors
  // -------------------------------------------------------------------------

  private async planDoctors(
    csv: string,
  ): Promise<{ preview: ImportPreview; write: () => Promise<number> }> {
    const { rows, issues, headers } = this.validateRows('doctors', csv, importDoctorRowSchema);

    // `Doctor` has no unique constraint on the name — deliberately, because two
    // real clinicians can share one and the model has no NPI or other column to
    // tell them apart. Dedupe is therefore an application-layer decision: match
    // what is already there so a re-upload is a no-op rather than a doubling.
    const allDoctors = await prisma.doctor.findMany({
      select: { lastName: true, firstName: true },
    });
    const existingKeys = new Set(allDoctors.map((d) => nameKey(d.lastName, d.firstName)));

    const summaries: ImportRowSummary[] = [];
    const errors = [...issues];
    const seenInFile = new Set<string>();
    const creates: Prisma.DoctorCreateManyInput[] = [];

    for (const { line, row, value } of rows) {
      const label = `${value.last_name}, ${value.first_name}`;
      const key = nameKey(value.last_name, value.first_name);

      if (existingKeys.has(key)) {
        summaries.push({ line, row, action: 'skip', label, reason: 'ALREADY_EXISTS' });
        continue;
      }
      if (seenInFile.has(key)) {
        summaries.push({ line, row, action: 'skip', label, reason: 'DUPLICATE_IN_FILE' });
        continue;
      }

      seenInFile.add(key);
      creates.push({ lastName: value.last_name, firstName: value.first_name });
      summaries.push({ line, row, action: 'create', label });
    }

    const preview = this.buildPreview('doctors', headers, summaries, errors);

    const write = async (): Promise<number> =>
      prisma.$transaction(async (tx) => (await tx.doctor.createMany({ data: creates })).count);

    return { preview, write };
  }

  // -------------------------------------------------------------------------
  // Staff accounts
  // -------------------------------------------------------------------------

  private async planStaff(
    csv: string,
  ): Promise<{ preview: ImportPreview; write: () => Promise<number> }> {
    const { rows, issues, headers } = this.validateRows('staff', csv, importStaffRowSchema);

    const [existingEmployees, roles] = await Promise.all([
      prisma.employee.findMany({ select: { userName: true } }),
      prisma.employeeRole.findMany({ select: { employeeRoleId: true, roleName: true } }),
    ]);
    const existingUserNames = new Set(existingEmployees.map((e) => e.userName.toLowerCase()));
    // Matched against the database rather than a hard-coded list, so a
    // deployment that adds a role does not need a code change.
    const rolesByName = new Map(roles.map((r) => [r.roleName.toLowerCase(), r]));
    const roleNames = roles.map((r) => r.roleName).join(', ');

    // In production AuthService refuses to log in an account with no password
    // hash, so importing one without a password creates an account nobody can
    // ever use. Outside production login is passwordless, so it is optional.
    const passwordRequired = process.env.NODE_ENV === 'production';

    const summaries: ImportRowSummary[] = [];
    const errors = [...issues];
    const seenInFile = new Set<string>();
    const pending: Array<{
      userName: string;
      lastName: string;
      firstName: string;
      employeeRoleId: number;
      defaultLanguage: string;
      password: string;
    }> = [];

    for (const { line, row, value } of rows) {
      const label = `${value.user_name} — ${value.last_name}, ${value.first_name}`;
      const key = value.user_name.toLowerCase();

      const role = rolesByName.get(value.role.toLowerCase());
      if (!role) {
        errors.push({
          line,
          row,
          column: 'role',
          code: 'INVALID_VALUE',
          message: `Unknown role '${value.role}'. Valid roles are: ${roleNames}`,
          value: value.role,
        });
        continue;
      }

      if (passwordRequired && value.password === '') {
        errors.push({
          line,
          row,
          column: 'password',
          code: 'INVALID_VALUE',
          message:
            'password is required in production — an account without one cannot log in',
        });
        continue;
      }

      if (seenInFile.has(key)) {
        errors.push({
          line,
          row,
          column: 'user_name',
          code: 'DUPLICATE_IN_FILE',
          message: `user_name '${value.user_name}' appears more than once in this file`,
          value: value.user_name,
        });
        continue;
      }
      seenInFile.add(key);

      if (existingUserNames.has(key)) {
        // Skipping leaves the existing passwordHash untouched. Re-running an
        // import must never reset a working account's password.
        summaries.push({ line, row, action: 'skip', label, reason: 'ALREADY_EXISTS' });
        continue;
      }

      pending.push({
        userName: value.user_name,
        lastName: value.last_name,
        firstName: value.first_name,
        employeeRoleId: role.employeeRoleId,
        defaultLanguage: value.default_language,
        password: value.password,
      });
      summaries.push({ line, row, action: 'create', label });
    }

    const preview = this.buildPreview('staff', headers, summaries, errors);

    const write = async (): Promise<number> => {
      // Hashing happens before the transaction opens. bcrypt at 12 rounds is
      // deliberately slow, so hashing a full roster inside the transaction
      // would hold locks for the entire duration and risk a timeout.
      const data: Prisma.EmployeeCreateManyInput[] = await Promise.all(
        pending.map(async (p) => ({
          userName: p.userName,
          lastName: p.lastName,
          firstName: p.firstName,
          employeeRoleId: p.employeeRoleId,
          defaultLanguage: p.defaultLanguage as Prisma.EmployeeCreateManyInput['defaultLanguage'],
          ...(p.password ? { passwordHash: await bcrypt.hash(p.password, BCRYPT_ROUNDS) } : {}),
        })),
      );

      return prisma.$transaction(async (tx) => (await tx.employee.createMany({ data })).count);
    };

    return { preview, write };
  }
}
