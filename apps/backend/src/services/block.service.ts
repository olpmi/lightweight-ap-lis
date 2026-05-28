import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { generateBlockId } from '../utils/idGenerator.js';

export class BlockService {
  async createBlocks(specimenId: string, count: number): Promise<object[]> {
    const specimen = await prisma.specimen.findUnique({ where: { specimenId } });
    if (!specimen) throw new AppError(404, 'NOT_FOUND', `Specimen ${specimenId} not found`);

    // Find the current max block number for this specimen
    const existing = await prisma.block.findMany({
      where: { specimenId },
      orderBy: { blockNumber: 'desc' },
    });
    const nextBlockNumber = existing.length > 0 ? existing[0].blockNumber + 1 : 1;

    // Look up the HE orderable once (auto-created by migration)
    const heOrderable = await prisma.ancillaryOrderable.findFirst({
      where: { category: 'HE', isActive: true },
    });

    const created: object[] = [];

    for (let i = 0; i < count; i++) {
      const blockNumber = nextBlockNumber + i;
      const blockId = generateBlockId(specimen.orderId, specimen.specimenCode, blockNumber);

      // Check for duplicate
      const exists = await prisma.block.findUnique({ where: { blockId } });
      if (exists) continue;

      const block = await prisma.block.create({
        data: {
          blockId,
          specimenId,
          blockNumber,
          createdDatetime: new Date(),
        },
      });
      created.push(block);

      // Auto-create H&E staining order for this block, starting at MICROTOMY (no pull block step)
      if (heOrderable) {
        await prisma.ancillaryOrder.create({
          data: {
            orderId: specimen.orderId,
            blockId,
            orderableId: heOrderable.id,
            status: 'MICROTOMY',
          },
        });
      }
    }

    return created;
  }
}
