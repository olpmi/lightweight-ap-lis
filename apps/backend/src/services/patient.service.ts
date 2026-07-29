import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { SEX_OPTIONS } from '@lis/shared';

type SexValue = (typeof SEX_OPTIONS)[number];

export class PatientService {
  async search(query: string): Promise<object[]> {
    return prisma.patient.findMany({
      where: {
        OR: [
          { patientId: { contains: query, mode: 'insensitive' } },
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
    });
  }

  async findById(patientId: string): Promise<object> {
    const patient = await prisma.patient.findUnique({ where: { patientId } });
    if (!patient) throw new AppError(404, 'NOT_FOUND', `Patient ${patientId} not found`);
    return patient;
  }

  async create(data: {
    patientId: string;
    lastName: string;
    firstName: string;
    dateOfBirth: string;
    sex: SexValue;
  }): Promise<object> {
    const existing = await prisma.patient.findUnique({ where: { patientId: data.patientId } });
    if (existing) {
      throw new AppError(409, 'CONFLICT', `Patient ID '${data.patientId}' already exists`);
    }
    return prisma.patient.create({
      data: {
        patientId: data.patientId,
        lastName: data.lastName,
        firstName: data.firstName,
        dateOfBirth: new Date(data.dateOfBirth),
        sex: data.sex,
      },
    });
  }

  /**
   * Allocate the next patient identifier from the `patient_sequence` counter.
   *
   * A single `update` with `increment` compiles to one atomic UPDATE, so
   * concurrent callers cannot receive the same value — the same technique
   * `generateOrderId` uses for accession numbers. This replaces a scheme that
   * derived the identifier from `Date.now()` truncated to seven digits, which
   * repeated roughly every 2.8 hours.
   *
   * Padded to seven digits for continuity with existing identifiers; values
   * beyond that simply grow longer.
   */
  async generatePatientId(): Promise<string> {
    const sequence = await prisma.patientSequence.update({
      where: { id: 1 },
      data: { lastValue: { increment: 1 } },
      select: { lastValue: true },
    });

    return `P${String(sequence.lastValue).padStart(7, '0')}`;
  }

  /**
   * Register a new patient under a freshly allocated identifier.
   *
   * There is deliberately no lookup step: the identifier comes from the
   * sequence and is therefore new, so there is no existing record to match
   * against and no opportunity to merge two different people. Callers that
   * mean to attach a case to a known patient must pass that patient's ID and
   * go through `findById` instead.
   */
  async createWithGeneratedId(data: {
    lastName: string;
    firstName: string;
    dateOfBirth: string;
    sex: SexValue;
  }): Promise<{ patientId: string }> {
    return prisma.patient.create({
      data: {
        patientId: await this.generatePatientId(),
        lastName: data.lastName,
        firstName: data.firstName,
        dateOfBirth: new Date(data.dateOfBirth),
        sex: data.sex,
      },
    });
  }

  /**
   * Confirm that a caller-supplied patient identifier refers to the patient the
   * caller thinks it does, before a case is filed against it.
   *
   * Only fields the caller actually sent are compared, so partial submissions
   * are still accepted. A mismatch is a 409 rather than a silent acceptance:
   * filing a case against the wrong patient is the failure mode this whole
   * change exists to prevent.
   */
  async assertDemographicsMatch(
    patientId: string,
    claimed: {
      lastName?: string;
      firstName?: string;
      dateOfBirth?: string;
      sex?: SexValue;
    },
  ): Promise<void> {
    const patient = await prisma.patient.findUnique({ where: { patientId } });
    if (!patient) throw new AppError(404, 'NOT_FOUND', `Patient ${patientId} not found`);

    const mismatches: string[] = [];

    const compare = (field: string, expected: string | undefined, actual: string): void => {
      if (expected === undefined) return;
      if (expected.trim().toLowerCase() !== actual.trim().toLowerCase()) {
        mismatches.push(field);
      }
    };

    compare('lastName', claimed.lastName, patient.lastName);
    compare('firstName', claimed.firstName, patient.firstName);
    compare('sex', claimed.sex, patient.sex);

    if (claimed.dateOfBirth !== undefined) {
      const claimedDob = new Date(claimed.dateOfBirth);
      // Stored as a DATE; compare the calendar day, not the instant.
      if (claimedDob.toISOString().slice(0, 10) !== patient.dateOfBirth.toISOString().slice(0, 10)) {
        mismatches.push('dateOfBirth');
      }
    }

    if (mismatches.length > 0) {
      throw new AppError(
        409,
        'PATIENT_MISMATCH',
        `Patient ${patientId} exists but its recorded details do not match those supplied (${mismatches.join(', ')}). Verify the patient identifier before filing this case.`,
        { patientId, mismatchedFields: mismatches },
      );
    }
  }
}
