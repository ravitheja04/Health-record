import type { TextItem } from './layout';

/** The parts of a pdf.js text item the extractor uses. */
export type PdfJsTextItem = { str: string; transform: number[]; width: number; height: number };

/**
 * Converts pdf.js `getTextContent()` items to the extractor's TextItem.
 * The in-app WebView (components/PdfReader.tsx) does the same mapping in its
 * own script; keep the two in step.
 */
export function fromPdfJs(items: unknown[], page: number): TextItem[] {
  return (items as PdfJsTextItem[])
    .filter((i) => typeof i?.str === 'string')
    .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || i.height, page }));
}
