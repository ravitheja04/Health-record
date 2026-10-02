/// <reference types="node" />
/**
 * Builds lab-report PDFs for tests, laid out like real Apollo / Tata 1mg
 * reports (positions and font sizes), and reads them back with pdf.js exactly
 * as the app does.
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { TextItem } from '../../extract/layout';
import { fromPdfJs } from '../../extract/pdfItems';

/** [x, text, fontSize?, bold?] */
export type FixtureCell = [number, string, number?, boolean?];
/** A line of cells, or a number = extra vertical space in points. */
export type FixtureLine = FixtureCell[] | number;

export async function buildPdf(pages: FixtureLine[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const lines of pages) {
    const page = doc.addPage([595, 842]);
    let y = 800;
    for (const line of lines) {
      if (typeof line === 'number') {
        y -= line;
        continue;
      }
      const size = Math.max(...line.map((c) => c[2] ?? 9));
      for (const [x, text, s = 9, isBold = false] of line) {
        // Lines of mixed font sizes share a baseline only roughly, like real reports.
        page.drawText(text, { x, y: y + (size - s) * 0.2, size: s, font: isBold ? bold : regular });
      }
      y -= size * 1.6;
    }
  }
  return doc.save();
}

export async function readItems(bytes: Uint8Array): Promise<TextItem[]> {
  const task = getDocument({ data: bytes, verbosity: 0 });
  const pdf = await task.promise;
  const items: TextItem[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    items.push(...fromPdfJs(content.items, n));
  }
  await task.destroy();
  return items;
}
