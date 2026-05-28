import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { buildOrderIdConditions } from '../utils/searchUtils.js';

/**
 * Processing queue:
 *   - registered orders (not completed/signed-out)
 *   - with optional filter: no materials (default) vs. all non-signed-out
 */
export class QueueService {
  async getProcessingQueue(
    page: number,
    pageSize: number,
    showAll = false,
    search = ''
  ): Promise<{ data: object[]; total: number; page: number; pageSize: number }> {
    // Orders that are not yet signed-out (no final report) â€” skipped when showAll is true
    const notSignedOut = showAll
      ? {}
      : {
          reports: {
            none: {
              isFinal: true,
              signedOutDatetime: { not: null },
            },
          },
        };

    // For default view: require no Report with a saved gross description
    const noGross = showAll
      ? {}
      : {
          NOT: {
            reports: {
              some: {
                AND: [
                  { gross: { not: null } },
                  { gross: { not: '' } },
                ],
              },
            },
          },
        };

    const searchFilter = search
      ? {
          OR: [
            ...buildOrderIdConditions(search),
            { patient: { lastName: { contains: search, mode: 'insensitive' as const } } },
            { patient: { firstName: { contains: search, mode: 'insensitive' as const } } },
            { patient: { patientId: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {};

    const where = {
      ...notSignedOut,
      ...noGross,
      ...searchFilter,
    };

    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { registeredDate: 'desc' },
        include: {
          patient: true,
          doctor: true,
          specimens: {
            include: { bodySite: true, specimenType: true },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * Result queue:
   *   - has at least one block or slide
   *   - no final signed-out latest report
   */
  async getResultQueue(
    page: number,
    pageSize: number,
    search = ''
  ): Promise<{ data: object[]; total: number; page: number; pageSize: number }> {
    // Must have at least one slide
    const hasMaterials = {
      specimens: {
        some: {
          blocks: {
            some: {
              slides: { some: {} },
            },
          },
        },
      },
    };

    // No final signed-out report
    const notSignedOut = {
      reports: {
        none: {
          isFinal: true,
          signedOutDatetime: { not: null },
        },
      },
    };

    const searchFilter = search
      ? {
          OR: [
            ...buildOrderIdConditions(search),
            { patient: { lastName: { contains: search, mode: 'insensitive' as const } } },
            { patient: { firstName: { contains: search, mode: 'insensitive' as const } } },
            { patient: { patientId: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {};

    const where = { ...hasMaterials, ...notSignedOut, ...searchFilter };

    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { registeredDate: 'desc' },
        include: {
          patient: true,
          doctor: true,
          specimens: {
            include: { bodySite: true, specimenType: true },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * Histology queue:
   *   - has at least one block with no slides
   *   - no final signed-out report
   */
  async getHistologyQueue(
    page: number,
    pageSize: number,
    search = ''
  ): Promise<{ data: object[]; total: number; page: number; pageSize: number }> {
    const hasBlocksNeedingSlides = {
      specimens: {
        some: {
          blocks: {
            some: {
              slides: { none: {} },
            },
          },
        },
      },
    };

    const notSignedOut = {
      reports: {
        none: {
          isFinal: true,
          signedOutDatetime: { not: null },
        },
      },
    };

    const searchFilter = search
      ? {
          OR: [
            ...buildOrderIdConditions(search),
            { patient: { lastName: { contains: search, mode: 'insensitive' as const } } },
            { patient: { firstName: { contains: search, mode: 'insensitive' as const } } },
            { patient: { patientId: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {};

    const where = { ...hasBlocksNeedingSlides, ...notSignedOut, ...searchFilter };

    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { registeredDate: 'desc' },
        include: {
          patient: true,
          doctor: true,
          specimens: {
            include: {
              bodySite: true,
              specimenType: true,
              blocks: {
                where: { slides: { none: {} } },
                include: { slides: true },
                orderBy: { blockNumber: 'asc' },
              },
            },
            orderBy: { specimenCode: 'asc' },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async getOrderMaterials(orderId: string): Promise<object> {
    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', `Order ${orderId} not found`);

    const specimens = await prisma.specimen.findMany({
      where: { orderId },
      include: {
        bodySite: true,
        specimenType: true,
        blocks: {
          orderBy: { blockNumber: 'asc' },
          include: {
            slides: { orderBy: { slideNumber: 'asc' } },
          },
        },
      },
      orderBy: { specimenCode: 'asc' },
    });

    return { specimens };
  }
}
