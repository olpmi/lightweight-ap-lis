/**
 * Generated-PDF file names are built from order IDs, and formatOrderIdDisplay
 * passes a non-canonical ID through unchanged. generatedPdfPath is the last
 * line of defence: whatever reaches a generator, the file lands inside
 * GENERATED_PDFS_DIR or not at all.
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { PdfService, generatedPdfPath } from '../../services/pdf.service.js';
import { GENERATED_PDFS_DIR } from '../../utils/storageDirs.js';

describe('generatedPdfPath', () => {
  it('resolves a plain file name inside the generated-PDFs directory', () => {
    expect(generatedPdfPath('SU-26-5-reference-strips.pdf')).toBe(
      path.resolve(GENERATED_PDFS_DIR, 'SU-26-5-reference-strips.pdf')
    );
  });

  it.each(['../../evil-reference-strips.pdf', '..', 'sub/dir.pdf', '/abs.pdf'])(
    'refuses %s',
    (fileName) => {
      expect(() => generatedPdfPath(fileName)).toThrow(/outside the storage directory/);
    }
  );

  it('is enforced by the reference-strips generator before anything is written', async () => {
    await expect(new PdfService().generateReferenceStripsPdf('../../evil', [])).rejects.toThrow(
      /outside the storage directory/
    );
  });
});
