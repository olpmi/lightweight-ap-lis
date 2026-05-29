import { prisma } from '../lib/prisma.js';
import { DEFAULT_REPORT_HTML_TEMPLATE } from './pdf.layout.service.js';
import type { ReportTemplateType } from '@lis/shared';

const REPORT_TYPES = ['final', 'preliminary', 'addendum', 'revision'] as const;
type ReportType = typeof REPORT_TYPES[number];

export class ConfigReportLayoutService {
  async listLayouts() {
    return prisma.reportLayout.findMany({
      orderBy: { reportType: 'asc' },
    });
  }

  async getLayout(reportType: ReportTemplateType) {
    return prisma.reportLayout.findUnique({ where: { reportType } });
  }

  async upsertLayout(reportType: ReportType, data: { name: string; htmlTemplate: string; isActive?: boolean }) {
    return prisma.reportLayout.upsert({
      where: { reportType },
      update: {
        name: data.name,
        htmlTemplate: data.htmlTemplate,
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      create: {
        reportType,
        name: data.name,
        htmlTemplate: data.htmlTemplate,
        isActive: data.isActive ?? true,
      },
    });
  }

  async resetToDefault(reportType: ReportType) {
    const name = reportType.charAt(0).toUpperCase() + reportType.slice(1) + ' Report (Default)';
    return prisma.reportLayout.upsert({
      where: { reportType },
      update: { htmlTemplate: DEFAULT_REPORT_HTML_TEMPLATE, name },
      create: { reportType, name, htmlTemplate: DEFAULT_REPORT_HTML_TEMPLATE, isActive: true },
    });
  }

  /**
   * Ensure all 4 report types have a default layout row.
   * In development: always overwrites the htmlTemplate with the current code default
   * so changes to DEFAULT_REPORT_HTML_TEMPLATE are reflected immediately on restart.
   * In production: only creates missing rows to preserve user-customised templates.
   */
  async seedDefaults() {
    const isDev = process.env.NODE_ENV !== 'production';
    for (const rt of REPORT_TYPES) {
      const name = rt.charAt(0).toUpperCase() + rt.slice(1) + ' Report';
      const existing = await prisma.reportLayout.findUnique({ where: { reportType: rt } });
      if (!existing) {
        await prisma.reportLayout.create({
          data: { reportType: rt, name, htmlTemplate: DEFAULT_REPORT_HTML_TEMPLATE, isActive: true },
        });
      } else if (isDev) {
        await prisma.reportLayout.update({
          where: { reportType: rt },
          data: { htmlTemplate: DEFAULT_REPORT_HTML_TEMPLATE },
        });
      }
    }
  }
}
