import { PrismaClient } from '@prisma/client';
import type {
  CreateAncillaryOrderInput,
  UpdateAncillaryOrderStatusInput,
} from '@lis/shared';

const prisma = new PrismaClient();

const ORDERABLE_INCLUDE = {
  orderable: true,
} as const;

export class AncillaryService {
  /**
   * Place one or more ancillary orders in a single transaction.
   */
  async createBatchOrders(
    items: CreateAncillaryOrderInput[],
    orderedById?: number,
  ) {
    return prisma.$transaction(
      items.map((item) =>
        prisma.ancillaryOrder.create({
          data: {
            orderId: item.orderId,
            blockId: item.blockId,
            orderableId: item.orderableId,
            levelCount: item.levelCount ?? null,
            notes: item.notes ?? null,
            orderedById: orderedById ? BigInt(orderedById) : null,
          },
          include: ORDERABLE_INCLUDE,
        }),
      ),
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
  async getQueue(filters?: { statuses?: string[]; category?: string }) {
    const where: Record<string, unknown> = {};

    if (filters?.statuses?.length) {
      where.status = { in: filters.statuses };
    }
    if (filters?.category) {
      where.orderable = { category: filters.category };
    }

    const rows = await prisma.ancillaryOrder.findMany({
      where,
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
          select: { blockId: true, blockNumber: true },
        },
      },
      orderBy: [{ orderedAt: 'desc' }],
    });

    return rows;
  }

  /**
   * Update the status (and optional result notes) of a single ancillary order.
   */
  async updateStatus(id: number, data: UpdateAncillaryOrderStatusInput) {
    return prisma.ancillaryOrder.update({
      where: { id },
      data: {
        status: data.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'CANCELLED',
        resultNotes: data.resultNotes ?? undefined,
      },
      include: ORDERABLE_INCLUDE,
    });
  }
}
