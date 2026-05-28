import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { generateSlideId } from '../utils/idGenerator.js';

export class SlideService {
  async discardSlide(blockId: string, slideId: string): Promise<object> {
    const slide = await prisma.slide.findUnique({ where: { slideId } });
    if (!slide) throw new AppError(404, 'NOT_FOUND', `Slide ${slideId} not found`);
    if (slide.blockId !== blockId) throw new AppError(404, 'NOT_FOUND', `Slide ${slideId} not found on block ${blockId}`);
    if (slide.discarded) throw new AppError(400, 'ALREADY_DISCARDED', `Slide ${slideId} is already discarded`);

    await prisma.slide.update({ where: { slideId }, data: { discarded: true } });
    return { slideId, discarded: true };
  }

  async createSlides(blockId: string, count: number, slideType?: string): Promise<object[]> {
    const block = await prisma.block.findUnique({ where: { blockId } });
    if (!block) throw new AppError(404, 'NOT_FOUND', `Block ${blockId} not found`);
    if (block.discarded) throw new AppError(400, 'BLOCK_DISCARDED', `Block ${blockId} is discarded`);

    const existing = await prisma.slide.findMany({
      where: { blockId },
      orderBy: { slideNumber: 'desc' },
    });
    const nextSlideNumber = existing.length > 0 ? existing[0].slideNumber + 1 : 1;

    const created: object[] = [];

    for (let i = 0; i < count; i++) {
      const slideNumber = nextSlideNumber + i;
      const slideId = generateSlideId(blockId, slideNumber);

      const exists = await prisma.slide.findUnique({ where: { slideId } });
      if (exists) continue;

      const slide = await prisma.slide.create({
        data: {
          slideId,
          blockId,
          slideNumber,
          slideType: slideType ?? 'H&E',
        },
      });
      created.push(slide);
    }

    return created;
  }
}
