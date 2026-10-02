/**
 * Simulates what ML Kit returns for a photo of a report: the fixture layout
 * scaled to camera pixels, tilted, with each table cell as its own OCR line
 * of word boxes (y grows downwards, as in an image), plus typos.
 */
import type { OcrBlock, OcrResult } from '../../extract/ocr';
import type { FixtureLine } from './reportPdf';

export function photoOf(lines: FixtureLine[], opts: { degrees?: number; typos?: Record<string, string> } = {}): OcrResult {
  const scale = 3; // ~1800 px wide photo of an A4 page
  const angle = ((opts.degrees ?? 0) * Math.PI) / 180;
  const rot = (x: number, y: number) => ({ x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) });
  const blocks: OcrBlock[] = [];
  let top = 60;
  for (const line of lines) {
    if (typeof line === 'number') {
      top += line * scale;
      continue;
    }
    const lineSize = Math.max(...line.map((c) => c[2] ?? 9));
    for (const [cx, rawText, size = 9] of line) {
      const text = opts.typos?.[rawText] ?? rawText;
      const h = size * scale * 1.25;
      const charW = size * scale * 0.55;
      let x = cx * scale;
      const elements = text.split(' ').filter(Boolean).map((word) => {
        const left = x;
        const right = x + word.length * charW;
        x = right + charW; // one space
        const bottom = top + lineSize * scale;
        // A tilted page moves each word's box; ML Kit reports axis-aligned frames.
        const a = rot(left, bottom - h);
        const b = rot(right, bottom);
        return { text: word, frame: { left: a.x, top: a.y, right: b.x, bottom: b.y } };
      });
      if (!elements.length) continue;
      const frame = {
        left: Math.min(...elements.map((e) => e.frame.left)),
        top: Math.min(...elements.map((e) => e.frame.top)),
        right: Math.max(...elements.map((e) => e.frame.right)),
        bottom: Math.max(...elements.map((e) => e.frame.bottom)),
      };
      blocks.push({ text, frame, lines: [{ text, frame, elements }] });
    }
    top += lineSize * scale * 1.6;
  }
  return { text: blocks.map((b) => b.text).join('\n'), blocks };
}
