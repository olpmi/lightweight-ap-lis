import { PrismaClient } from '@prisma/client';
import type {
  CreateAncillaryOrderableInput,
  UpdateAncillaryOrderableInput,
  CreateAncillaryPanelInput,
  UpdateAncillaryPanelInput,
} from '@lis/shared';

const prisma = new PrismaClient();

export class ConfigAncillaryService {
  // ---------------------------------------------------------------------------
  // Orderables
  // ---------------------------------------------------------------------------

  async listOrderables() {
    return prisma.ancillaryOrderable.findMany({
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createOrderable(data: CreateAncillaryOrderableInput) {
    return prisma.ancillaryOrderable.create({
      data: {
        name: data.name,
        category: data.category as 'HE_LEVELS' | 'IHC' | 'SPECIAL_STAIN' | 'MOLECULAR' | 'SEND_OUT',
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async updateOrderable(id: number, data: UpdateAncillaryOrderableInput) {
    return prisma.ancillaryOrderable.update({
      where: { id },
      data: {
        name: data.name ?? undefined,
        category: data.category
          ? (data.category as 'HE_LEVELS' | 'IHC' | 'SPECIAL_STAIN' | 'MOLECULAR' | 'SEND_OUT')
          : undefined,
        sortOrder: data.sortOrder ?? undefined,
        isActive: data.isActive ?? undefined,
      },
    });
  }

  async deleteOrderable(id: number) {
    // Check if any non-cancelled orders reference this orderable
    const inUse = await prisma.ancillaryOrder.count({
      where: { orderableId: id, status: { not: 'CANCELLED' } },
    });
    if (inUse > 0) {
      throw Object.assign(new Error('Cannot delete: orderable has active orders'), {
        status: 409,
      });
    }
    return prisma.ancillaryOrderable.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // Panels
  // ---------------------------------------------------------------------------

  async listPanels() {
    return prisma.ancillaryPanel.findMany({
      include: {
        items: {
          include: { orderable: true },
          orderBy: { orderable: { sortOrder: 'asc' } },
        },
      },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createPanel(data: CreateAncillaryPanelInput) {
    return prisma.$transaction(async (tx) => {
      const panel = await tx.ancillaryPanel.create({
        data: {
          name: data.name,
          category: data.category as 'HE_LEVELS' | 'IHC' | 'SPECIAL_STAIN' | 'MOLECULAR' | 'SEND_OUT',
          sortOrder: data.sortOrder ?? 0,
        },
      });
      await tx.ancillaryPanelItem.createMany({
        data: data.orderableIds.map((orderableId) => ({
          panelId: panel.id,
          orderableId,
        })),
      });
      return tx.ancillaryPanel.findUniqueOrThrow({
        where: { id: panel.id },
        include: { items: { include: { orderable: true } } },
      });
    });
  }

  async updatePanel(id: number, data: UpdateAncillaryPanelInput) {
    return prisma.$transaction(async (tx) => {
      await tx.ancillaryPanel.update({
        where: { id },
        data: {
          name: data.name ?? undefined,
          category: data.category
            ? (data.category as 'HE_LEVELS' | 'IHC' | 'SPECIAL_STAIN' | 'MOLECULAR' | 'SEND_OUT')
            : undefined,
          sortOrder: data.sortOrder ?? undefined,
          isActive: data.isActive ?? undefined,
        },
      });
      if (data.orderableIds !== undefined) {
        await tx.ancillaryPanelItem.deleteMany({ where: { panelId: id } });
        await tx.ancillaryPanelItem.createMany({
          data: data.orderableIds.map((orderableId) => ({ panelId: id, orderableId })),
        });
      }
      return tx.ancillaryPanel.findUniqueOrThrow({
        where: { id },
        include: { items: { include: { orderable: true } } },
      });
    });
  }

  async deletePanel(id: number) {
    // Panel items cascade via DB constraint
    return prisma.ancillaryPanel.delete({ where: { id } });
  }
}
