import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';

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
    sex: string;
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

  async findOrCreate(data: {
    patientId: string;
    lastName: string;
    firstName: string;
    dateOfBirth: string;
    sex: string;
  }): Promise<{ patientId: string }> {
    const existing = await prisma.patient.findUnique({ where: { patientId: data.patientId } });
    if (existing) return existing;
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
}
