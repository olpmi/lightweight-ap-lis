import { prisma } from '../lib/prisma.js';
import type { CreateReportTemplateInput, UpdateReportTemplateInput } from '@lis/shared';

export class ConfigReportTemplateService {
  async listReportTemplates(type?: string) {
    return prisma.reportTemplate.findMany({
      where: type ? { type } : undefined,
      orderBy: [{ type: 'asc' }, { templateName: 'asc' }],
    });
  }

  async createReportTemplate(data: CreateReportTemplateInput) {
    return prisma.reportTemplate.create({
      data: {
        templateName: data.templateName,
        type: data.type,
        templateText: data.templateText ?? null,
        isActive: true,
      },
    });
  }

  async updateReportTemplate(reportTemplateId: number, data: UpdateReportTemplateInput) {
    return prisma.reportTemplate.update({
      where: { reportTemplateId },
      data: {
        ...(data.templateName !== undefined && { templateName: data.templateName }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.templateText !== undefined && { templateText: data.templateText }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async deleteReportTemplate(reportTemplateId: number) {
    // Nullify FK on any reports referencing this template before deleting
    await prisma.report.updateMany({
      where: { reportTemplateId },
      data: { reportTemplateId: null },
    });
    return prisma.reportTemplate.delete({ where: { reportTemplateId } });
  }
}
