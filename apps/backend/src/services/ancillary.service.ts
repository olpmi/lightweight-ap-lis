import type {
  CreateAncillaryOrderInput,
  UpdateAncillaryOrderStatusInput,
} from '@lis/shared';
import {
  type AncillaryStatus,
  isValidAncillaryTransition,
} from '@lis/shared';
import { Prisma } from '@prisma/client';
import { buildOrderIdConditions } from '../utils/searchUtils.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';

const ORDERABLE_INCLUDE = {
  orderable: true,
} as const;

export class AncillaryService {
  /**
   * Place one or more ancillary orders in a single transaction.
   * Initial status is determined by orderable category:
   *   MOLECULAR / SEND_OUT → PULL_MATERIAL
   *   all others            → PULL_BLOCK
   */
  async createBatchOrders(
    items: CreateAncillaryOrderInput[],
    orderedById?: number,
  ) {
    const orderableIds = [...new Set(items.map((i) => i.orderableId))];
    const orderables = await prisma.ancillaryOrderable.findMany({
      where: { id: { in: orderableIds } },
      select: { id: true, category: true },
    });
    const catMap = new Map(orderables.map((o) => [o.id, o.category]));
    const SENDOUT_CATS = new Set<string>(['MOLECULAR', 'SEND_OUT']);

    return prisma.$transaction(
      items.map((item) => {
        const cat = catMap.get(item.orderableId) ?? '';
        const status = SENDOUT_CATS.has(cat) ? ('PULL_MATERIAL' as const) : ('PULL_BLOCK' as const);
        return prisma.ancillaryOrder.create({
          data: {
            orderId: item.orderId,
            blockId: item.blockId,
            orderableId: item.orderableId,
            levelCount: item.levelCount ?? null,
            notes: item.notes ?? null,
            orderedById: orderedById ? BigInt(orderedById) : null,
            status,
          },
          include: ORDERABLE_INCLUDE,
        });
      }),
    );
  }

  /**
   * All ancillary orders for a specific case, grouped by block.
   */
  async getOrdersByCase(orderId: string) {
    return prisma.ancillaryOrder.findMany({
      where: { orderId },
      include: {
        orderable: true,
        orderedBy: {
          select: { employeeId: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ blockId: 'asc' }, { orderedAt: 'asc' }],
    });
  }

  /**
   * Count non-cancelled ancillary orders per block for a given case.
   * Returns a map of blockId → count.
   */
  async getBlockOrderCounts(orderId: string): Promise<Record<string, number>> {
    const rows = await prisma.ancillaryOrder.groupBy({
      by: ['blockId'],
      where: { orderId, status: { not: 'CANCELLED' } },
      _count: { id: true },
    });
    return Object.fromEntries(rows.map((r) => [r.blockId, r._count.id]));
  }

  /**
   * Worklist queue — all orders matching optional status/category filters.
   * Returns orders enriched with case metadata (patient name, etc.).
   */
  async getQueue(filters?: { statuses?: string[]; category?: string; categories?: string[]; since?: Date; page?: number; pageSize?: number; search?: string }) {
    const andConditions: Record<string, unknown>[] = [];

    if (filters?.search) {
      const search = filters.search;
      andConditions.push({
        OR: [
          ...buildOrderIdConditions(search),
          { order: { patient: { lastName: { contains: search, mode: 'insensitive' as const } } } },
          { order: { patient: { firstName: { contains: search, mode: 'insensitive' as const } } } },
        ],
      });
    }

    if (filters?.statuses?.length) {
      andConditions.push({ status: { in: filters.statuses } });
    }
    // categories (array) takes precedence over single category
    if (filters?.categories?.length) {
      andConditions.push({ orderable: { category: { in: filters.categories } } });
    } else if (filters?.category) {
      andConditions.push({ orderable: { category: filters.category } });
    }
    if (filters?.since) {
      const terminalStatuses = ['DISTRIBUTED', 'CANCELLED', 'MATERIAL_RETURNED'];
      andConditions.push({
        OR: [
          { status: { notIn: terminalStatuses } },
          { completedAt: { gte: filters.since } },
          { cancelledAt: { gte: filters.since } },
        ],
      });
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : {};

    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    // Case-level pagination: find distinct orderIds matching filters, then slice
    const allCaseIds = await prisma.ancillaryOrder.findMany({
      where,
      distinct: ['orderId'],
      select: { orderId: true },
      orderBy: [{ orderedAt: 'desc' }],
    });
    const total = allCaseIds.length;
    const pagedCaseIds = allCaseIds.slice(skip, skip + pageSize).map((r) => r.orderId);

    if (pagedCaseIds.length === 0) {
      return { data: [], total, page, pageSize };
    }

    const rowConditions = [...andConditions, { orderId: { in: pagedCaseIds } }];
    const rows = await prisma.ancillaryOrder.findMany({
      where: { AND: rowConditions },
      include: {
        orderable: true,
        orderedBy: {
          select: { employeeId: true, firstName: true, lastName: true },
        },
        order: {
          select: {
            orderId: true,
            caseType: true,
            patient: {
              select: { patientId: true, firstName: true, lastName: true },
            },
          },
        },
        block: {
          select: {
            blockId: true,
            blockNumber: true,
            _count: { select: { slides: { where: { discarded: false } } } },
            slides: { select: { slideId: true, slideNumber: true, discarded: true }, orderBy: { slideNumber: 'asc' } },
          },
        },
      },
      orderBy: [{ orderedAt: 'desc' }],
    });

    return { data: rows, total, page, pageSize };
  }

  /**
   * Update the status (and optional result notes) of a single ancillary order.
   *
   * Concurrency model:
   *   1. Validate the requested transition against the state machine. Reject
   *      invalid transitions with 400 INVALID_TRANSITION.
   *   2. Apply the update with a WHERE clause that pins the current status, so
   *      two techs racing on the same row only allow one to win. The loser hits
   *      P2025 and is normalized to 409 by the error middleware.
   */
  async updateStatus(id: number, data: UpdateAncillaryOrderStatusInput) {
    const current = await prisma.ancillaryOrder.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!current) {
      throw new AppError(404, 'NOT_FOUND', `Ancillary order ${id} not found`);
    }

    const from = current.status as AncillaryStatus;
    const to = data.status as AncillaryStatus;
    if (!isValidAncillaryTransition(from, to)) {
      throw new AppError(
        400,
        'INVALID_TRANSITION',
        `Cannot transition ancillary order from ${from} to ${to}`,
        { from, to },
      );
    }

    const now = new Date();
    const timestamps: Record<string, Date> = {};
    if (to === 'MICROTOMY') timestamps.inProgressAt = now;
    if (to === 'MATERIAL_SENT') timestamps.inProgressAt = now;
    if (to === 'DISTRIBUTED') timestamps.completedAt = now;
    if (to === 'MATERIAL_RETURNED') timestamps.completedAt = now;
    if (to === 'CANCELLED') timestamps.cancelledAt = now;

    try {
      return await prisma.ancillaryOrder.update({
        // Atomic guard: only update if status is still the value we validated against.
        where: { id, status: from },
        data: {
          status: to,
          resultNotes: data.resultNotes ?? undefined,
          ...timestamps,
        },
        include: ORDERABLE_INCLUDE,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new AppError(
          409,
          'STATUS_CHANGED_BY_ANOTHER_USER',
          'Ancillary order status was changed by another user; please reload',
        );
      }
      throw err;
    }
  }
}
