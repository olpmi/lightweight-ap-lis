import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { generateBlockId } from '../utils/idGenerator.js';

export class BlockService {
  async updateHeStatus(blockId: string, status: string): Promise<object> {
    const VALID = ['MICROTOMY', 'SLIDE_STAIN', 'DISTRIBUTED', 'CANCELLED'];
    if (!VALID.includes(status)) throw new AppError(400, 'BAD_REQUEST', 'Invalid heStatus');

    const block = await prisma.block.findUnique({ where: { blockId } });
    if (!block) throw new AppError(404, 'NOT_FOUND', `Block ${blockId} not found`);
    if (block.discarded) throw new AppError(400, 'BLOCK_DISCARDED', `Block ${blockId} is discarded`);

    const updated = await prisma.block.update({ where: { blockId }, data: { heStatus: status } });
    return updated;
  }

  async discardBlock(blockId: string): Promise<object> {
    const block = await prisma.block.findUnique({ where: { blockId } });
    if (!block) throw new AppError(404, 'NOT_FOUND', `Block ${blockId} not found`);
    if (block.discarded) throw new AppError(400, 'ALREADY_DISCARDED', `Block ${blockId} is already discarded`);

    await prisma.$transaction([
      prisma.slide.updateMany({ where: { blockId }, data: { discarded: true } }),
      prisma.ancillaryOrder.updateMany({ where: { blockId }, data: { status: 'CANCELLED' } }),
      prisma.block.update({ where: { blockId }, data: { discarded: true } }),
    ]);

    return { blockId, discarded: true };
  }

  async createBlocks(specimenId: string, count: number): Promise<object[]> {
    if (!Number.isInteger(count) || count <= 0 || count > 100) {
      throw new AppError(400, 'BAD_REQUEST', 'count must be an integer between 1 and 100');
    }

    const specimen = await prisma.specimen.findUnique({ where: { specimenId } });
    if (!specimen) throw new AppError(404, 'NOT_FOUND', `Specimen ${specimenId} not found`);

    // Look up the HE orderable once (auto-created by migration); read outside the tx.
    const heOrderable = await prisma.ancillaryOrderable.findFirst({
      where: { category: 'HE', isActive: true },
    });

    // Serialize concurrent block creation per-specimen. The Serializable isolation level
    // makes Postgres reject conflicting concurrent transactions with 40001, which is
    // mapped here to a 409 so the caller can retry.
    try {
      return await prisma.$transaction(
        async (tx) => {
          const latest = await tx.block.findFirst({
            where: { specimenId },
            orderBy: { blockNumber: 'desc' },
            select: { blockNumber: true },
          });
          const nextBlockNumber = (latest?.blockNumber ?? 0) + 1;

          const created: object[] = [];
          for (let i = 0; i < count; i++) {
            const blockNumber = nextBlockNumber + i;
            const blockId = generateBlockId(specimen.orderId, specimen.specimenCode, blockNumber);

            const block = await tx.block.create({
              data: {
                blockId,
                specimenId,
                blockNumber,
                createdDatetime: new Date(),
              },
            });
            created.push(block);

            if (heOrderable) {
              await tx.ancillaryOrder.create({
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
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(409, 'CONFLICT', 'Concurrent block creation detected, please retry');
      }
      throw err;
    }
  }
}
