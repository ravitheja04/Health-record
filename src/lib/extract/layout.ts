/**
 * Rebuilds lines and table cells from the positioned text a PDF gives back.
 * PDFs don't store tables, only "draw this text at x, y", so lines are found by
 * grouping text at the same height and cells by the gaps between words.
 */

/** One piece of text from pdf.js, in PDF coordinates (y grows upwards). */
export type TextItem = {
  str: string;
  x: number;
  y: number;
  w: number;
  /** Font height; 0 for pdf.js's spacing items. */
  h: number;
  page: number;
};

export type Cell = { text: string; x0: number; x1: number };

export type Line = {
  page: number;
  y: number;
  /** Typical font height on the line. */
  size: number;
  cells: Cell[];
  text: string;
};

/** Groups text into lines (top to bottom) and each line into cells (left to right). */
export function buildLines(items: TextItem[]): Line[] {
  const words = items.filter((i) => i.str.trim() && i.h > 0);
  const byPage = new Map<number, TextItem[]>();
  for (const w of words) byPage.set(w.page, [...(byPage.get(w.page) ?? []), w]);

  const lines: Line[] = [];
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const sorted = byPage.get(page)!.sort((a, b) => b.y - a.y || a.x - b.x);
    const groups: TextItem[][] = [];
    for (const item of sorted) {
      const group = groups[groups.length - 1];
      // Same line when the baselines are within ~40% of the text height; subscripts and
      // slightly offset columns still land together.
      if (group && Math.abs(group[0].y - item.y) <= Math.max(2, 0.4 * Math.min(group[0].h, item.h))) group.push(item);
      else groups.push([item]);
    }
    for (const group of groups) {
      group.sort((a, b) => a.x - b.x);
      const size = median(group.map((g) => g.h));
      const cells: Cell[] = [];
      for (const item of group) {
        const last = cells[cells.length - 1];
        const gap = last ? item.x - last.x1 : Infinity;
        // A gap wider than about one character's width starts a new cell (column).
        if (last && gap < size * 0.9) {
          last.text += gap > size * 0.12 && !last.text.endsWith(' ') && !item.str.startsWith(' ') ? ` ${item.str}` : item.str;
          last.x1 = Math.max(last.x1, item.x + item.w);
        } else {
          cells.push({ text: item.str, x0: item.x, x1: item.x + item.w });
        }
      }
      for (const c of cells) c.text = c.text.replace(/\s+/g, ' ').trim();
      const kept = cells.filter((c) => c.text);
      if (!kept.length) continue;
      lines.push({ page, y: group[0].y, size, cells: kept, text: kept.map((c) => c.text).join('  ') });
    }
  }
  return lines;
}

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}
