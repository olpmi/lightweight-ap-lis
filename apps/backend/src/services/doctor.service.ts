import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';

export class DoctorService {
  async search(query: string): Promise<object[]> {
    return prisma.doctor.findMany({
      where: {
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
    });
  }

  async findById(doctorId: number): Promise<object> {
    const doc = await prisma.doctor.findUnique({ where: { doctorId: BigInt(doctorId) } });
    if (!doc) throw new AppError(404, 'NOT_FOUND', `Doctor ${doctorId} not found`);
    return doc;
  }

  async create(data: { lastName: string; firstName: string }): Promise<object> {
    return prisma.doctor.create({ data });
  }

  async findOrCreate(data: { lastName: string; firstName: string }): Promise<{ doctorId: bigint }> {
    // Try to find existing match
    const existing = await prisma.doctor.findFirst({
      where: {
        lastName: { equals: data.lastName, mode: 'insensitive' },
        firstName: { equals: data.firstName, mode: 'insensitive' },
      },
    });
    if (existing) return existing;
    return prisma.doctor.create({ data });
  }
}
