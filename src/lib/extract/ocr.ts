import type { TextItem } from './layout';

/**
 * Turns on-device OCR output (Google ML Kit text recognition, read from a
 * photo or a scanned page) into the same positioned text items a text PDF
 * gives, so one parser handles both.
 */

export type OcrRect = { left: number; top: number; right: number; bottom: number };
export type OcrElement = { text: string; frame: OcrRect };
export type OcrLine = { text: string; frame: OcrRect; elements: OcrElement[] };
export type OcrBlock = { text: string; frame: OcrRect; lines: OcrLine[] };
export type OcrResult = { text: string; blocks: OcrBlock[] };

const center = (r: OcrRect) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });

/**
 * How far the page is turned, in radians, from the slope of the words along
 * each recognised line. ML Kit follows tilted lines well, so the median slope
 * of its multi-word lines is a good estimate even when the photo is skewed.
 */
export function estimateSkew(result: OcrResult): number {
  const slopes: number[] = [];
  for (const block of result.blocks) {
    for (const line of block.lines) {
      const pts = line.elements.map((e) => center(e.frame));
      if (pts.length < 2) continue;
      const span = pts[pts.length - 1].x - pts[0].x;
      const height = median(line.elements.map((e) => e.frame.bottom - e.frame.top));
      if (span < height * 3) continue; // Too short to measure a slope.
      const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      let num = 0;
      let den = 0;
      for (const p of pts) {
        num += (p.x - mx) * (p.y - my);
        den += (p.x - mx) ** 2;
      }
      if (den > 0) slopes.push(num / den);
    }
  }
  if (!slopes.length) return 0;
  const angle = Math.atan(median(slopes));
  // Beyond ~15° the photo needs retaking rather than straightening.
  return Math.abs(angle) > 0.26 ? 0 : angle;
}

/**
 * OCR mixes up look-alike characters inside numbers ("1O.5", "l3.2") and
 * sometimes reads a decimal point as a comma ("13,5"). Only tokens that are
 * clearly meant to be numbers are touched.
 */
export function fixNumberToken(text: string): string {
  const t = text.trim();
  if (!/\d/.test(t) || !/^[<>≤≥]?=?[\dOoIl|.,]+[%*]?$/.test(t)) return text;
  const digitsOnly = t.replace(/[^0-9OoIl|]/g, '');
  const realDigits = digitsOnly.replace(/[^0-9]/g, '').length;
  if (realDigits < digitsOnly.length / 2) return text; // Mostly letters: a word, not a number.
  let fixed = t.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1');
  // "13,5" is a decimal; Indian grouping ("1,85,000") always has 2-3 digits after a comma.
  if (/^\D*\d+,\d$/.test(fixed)) fixed = fixed.replace(',', '.');
  return fixed;
}

/** ML Kit result for one page/photo → text items (y grows upwards, like PDF). */
export function ocrToItems(result: OcrResult, page: number): TextItem[] {
  const angle = estimateSkew(result);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const items: TextItem[] = [];
  for (const block of result.blocks) {
    for (const line of block.lines) {
      const elements = line.elements.length ? line.elements : [{ text: line.text, frame: line.frame }];
      for (const e of elements) {
        const { left, top, right, bottom } = e.frame;
        const h = bottom - top;
        // Rotate the word's bottom-left corner to undo the tilt, then flip y.
        const x = left * cos - bottom * sin;
        const y = left * sin + bottom * cos;
        items.push({ str: fixNumberToken(e.text), x, y: -y, w: right - left, h, page });
      }
    }
  }
  return items;
}

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}
