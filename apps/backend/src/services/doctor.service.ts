import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';

export class DoctorService {
  /**
   * Find referring clinicians for the order-entry typeahead.
   *
   * Empty query returns the first page rather than nothing, for the same reason
   * as PatientService.search: on a fresh deployment the roster arrives by CSV
   * import, and an empty dropdown reads as a failed import.
   */
  async search(query: string): Promise<object[]> {
    const trimmed = query.trim();

    return prisma.doctor.findMany({
      where: trimmed
        ? {
            OR: [
              { firstName: { contains: trimmed, mode: 'insensitive' } },
              { lastName: { contains: trimmed, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { doctorId: 'asc' }],
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
