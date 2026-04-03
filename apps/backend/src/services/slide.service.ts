import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';
import { generateSlideId } from '../utils/idGenerator';

export class SlideService {
  async createSlides(blockId: string, count: number, slideType?: string): Promise<object[]> {
    const block = await prisma.block.findUnique({ where: { blockId } });
    if (!block) throw new AppError(404, 'NOT_FOUND', `Block ${blockId} not found`);

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
