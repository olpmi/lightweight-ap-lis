import { Request, Response, NextFunction } from 'express';

/**
 * For routes that answer with a PDF. helmet puts a Content-Security-Policy on
 * every response, which is right for JSON but meaningless for a PDF document,
 * and some built-in viewers honour it when the PDF is opened directly from a
 * link. Drop the header before the handler runs so the viewer sees a plain PDF.
 */
export function pdfResponse(_req: Request, res: Response, next: NextFunction): void {
  res.removeHeader('Content-Security-Policy');
  next();
}
