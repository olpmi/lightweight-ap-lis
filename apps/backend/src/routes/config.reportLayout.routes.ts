import { Router } from 'express';
import { z } from 'zod';
import { ConfigReportLayoutService } from '../services/config.reportLayout.service.js';
import { PdfLayoutService } from '../services/pdf.layout.service.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router: Router = Router();
const layoutService = new ConfigReportLayoutService();
const pdfLayoutService = new PdfLayoutService();

const REPORT_TYPES = ['final', 'preliminary', 'addendum', 'revision'] as const;
type ReportType = (typeof REPORT_TYPES)[number];
function isReportType(v: string): v is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(v);
}

const upsertSchema = z.object({
  reportType: z.enum(REPORT_TYPES),
  name: z.string().min(1).max(255),
  htmlTemplate: z.string().min(1),
  isActive: z.boolean().optional(),
});

router.use(requireAuth);

// GET /api/config/report-layouts
router.get('/', async (_req, res, next) => {
  try {
    const layouts = await layoutService.listLayouts();
    res.json(layouts);
  } catch (err) {
    next(err);
  }
});

// GET /api/config/report-layouts/:reportType
router.get('/:reportType', async (req, res, next) => {
  try {
    const { reportType } = req.params;
    if (!isReportType(reportType)) return res.status(400).json({ message: 'Invalid report type' });
    const layout = await layoutService.getLayout(reportType);
    if (!layout) return res.status(404).json({ message: 'Layout not found' });
    res.json(layout);
  } catch (err) {
    next(err);
  }
});

// PUT /api/config/report-layouts  (upsert by reportType in body)
router.put('/', validateBody(upsertSchema), async (req, res, next) => {
  try {
    const { reportType, name, htmlTemplate, isActive } = req.body;
    const layout = await layoutService.upsertLayout(reportType, { name, htmlTemplate, isActive });
    res.json(layout);
  } catch (err) {
    next(err);
  }
});

// POST /api/config/report-layouts/:reportType/reset  â€” reset to built-in default template
router.post('/:reportType/reset', async (req, res, next) => {
  try {
    const { reportType } = req.params;
    if (!isReportType(reportType)) {
      return res.status(400).json({ message: 'Invalid report type' });
    }
    const layout = await layoutService.resetToDefault(reportType);
    res.json(layout);
  } catch (err) {
    next(err);
  }
});

// POST /api/config/report-layouts/:reportType/preview â€” render a sample PDF
router.post('/:reportType/preview', async (req, res, next) => {
  try {
    const { reportType } = req.params;
    if (!isReportType(reportType)) return res.status(400).json({ message: 'Invalid report type' });
    // Use the template from the request body if provided, otherwise use the saved one
    let htmlTemplate: string | undefined = req.body?.htmlTemplate;
    if (!htmlTemplate) {
      const saved = await layoutService.getLayout(reportType);
      if (!saved) return res.status(404).json({ message: 'Layout not found. Save it first.' });
      htmlTemplate = saved.htmlTemplate;
    }
    const data = PdfLayoutService.sampleData(reportType);
    const pdfBuffer = await pdfLayoutService.renderToPdf(htmlTemplate, data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="preview-${reportType}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

export { router as configReportLayoutRoutes };
