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
   *   - has at least one ancillary order in DISTRIBUTED status (slides delivered to pathologist)
   *   - no final signed-out latest report
   */
  async getResultQueue(
    page: number,
    pageSize: number,
    search = ''
  ): Promise<{ data: object[]; total: number; page: number; pageSize: number }> {
    // Case enters Result once at least one block/ancillary order has been distributed.
    // - H&E distribution updates block.heStatus = 'DISTRIBUTED'
    // - Other ancillary tests (IHC/SPECIAL_STAIN/HE_LEVELS) update ancillaryOrder.status
    const hasMaterials = {
      OR: [
        {
          specimens: {
            some: {
              blocks: {
                some: { heStatus: 'DISTRIBUTED', discarded: false },
              },
            },
          },
        },
        {
          ancillaryOrders: {
            some: { status: 'DISTRIBUTED' as const },
          },
        },
      ],
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

    const where = { AND: [hasMaterials, notSignedOut, searchFilter] };

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
   *   - filtered by block heStatus
   *   - for active statuses (MICROTOMY / SLIDE_STAIN): no final signed-out report
   */
  async getHistologyQueue(
    page: number,
    pageSize: number,
    search = '',
    heStatus = 'MICROTOMY',
    since?: string
  ): Promise<{ data: object[]; total: number; page: number; pageSize: number }> {
    const blockFilter: { heStatus: string; discarded: boolean; updatedAt?: { gte: Date } } = {
      heStatus,
      discarded: false,
    };

    // Recency filter only applies to terminal statuses (matches the ancillary queue UX)
    const isTerminal = heStatus === 'DISTRIBUTED' || heStatus === 'CANCELLED';
    if (isTerminal && since) {
      const sinceDate = new Date(since);
      if (!Number.isNaN(sinceDate.getTime())) {
        blockFilter.updatedAt = { gte: sinceDate };
      }
    }

    const hasMatchingBlocks = {
      specimens: {
        some: {
          blocks: {
            some: blockFilter,
          },
        },
      },
    };

    const activeStatuses = ['MICROTOMY', 'SLIDE_STAIN'];
    const notSignedOut = activeStatuses.includes(heStatus)
      ? {
          reports: {
            none: {
              isFinal: true,
              signedOutDatetime: { not: null },
            },
          },
        }
      : {};

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

    const where = { ...hasMatchingBlocks, ...notSignedOut, ...searchFilter };

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
                where: blockFilter,
                include: { slides: { where: { discarded: false }, orderBy: { slideNumber: 'asc' } } },
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
    // Single query: fetch the order with its specimens/blocks/slides in one
    // round-trip. Returns 404 when the order doesn't exist.
    const order = await prisma.order.findUnique({
      where: { orderId },
      select: {
        specimens: {
          include: {
            bodySite: true,
            specimenType: true,
            blocks: {
              orderBy: { blockNumber: 'asc' },
              include: {
                slides: { orderBy: { slideNumber: 'asc' } },
                ancillaryOrders: {
                  where: { orderable: { category: 'HE' } },
                  select: { id: true, status: true, orderableId: true },
                },
              },
            },
          },
          orderBy: { specimenCode: 'asc' },
        },
      },
    });
    if (!order) throw new AppError(404, 'NOT_FOUND', `Order ${orderId} not found`);

    return { specimens: order.specimens };
  }
}
