/**
 * Small parsers for the pieces of a lab report table row: the result value,
 * its high/low flag, the unit and the printed reference range.
 */

export type ParsedValue = {
  value: number;
  /** As printed, e.g. "<0.5" or "1,50,000". */
  text: string;
  /** Printed with "<" or ">", so the number is a limit rather than an exact result. */
  approx: boolean;
  flag: 'high' | 'low' | null;
};

const NUMBER = String.raw`\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+`;

/** "1,50,000" (Indian grouping) or "1,234.5" → number. */
export function toNumber(text: string): number | null {
  const n = Number(text.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const FLAG_HIGH = /^(?:h|high|hi|\*h|h\*|↑|\^)$/i;
const FLAG_LOW = /^(?:l|low|lo|\*l|l\*|↓)$/i;

export function flagOf(token: string): 'high' | 'low' | null {
  const t = token.trim();
  if (FLAG_HIGH.test(t)) return 'high';
  if (FLAG_LOW.test(t)) return 'low';
  return null;
}

const VALUE_RE = new RegExp(String.raw`^(?<flagBefore>[HL]\s+)?(?<cmp>[<>]=?|≤|≥)?\s*(?<num>${NUMBER})(?![\d.,])(?:\s*(?<flagAfter>\*?[HL]\*?|High|Low|↑|↓|\*)(?=\s|$))?`, 'i');

/**
 * Reads the result at the start of `text`. Returns the value and whatever text
 * follows it (often the unit when the PDF puts them close together).
 */
export function parseValue(text: string): { parsed: ParsedValue; rest: string } | null {
  const t = text.trim();
  const m = VALUE_RE.exec(t);
  if (!m?.groups) return null;
  const value = toNumber(m.groups.num);
  if (value === null) return null;
  const flagText = (m.groups.flagAfter ?? m.groups.flagBefore ?? '').trim();
  return {
    parsed: {
      value,
      text: `${m.groups.cmp ?? ''}${m.groups.num}`,
      approx: !!m.groups.cmp,
      flag: flagText === '*' ? null : flagOf(flagText),
    },
    rest: t.slice(m[0].length).trim(),
  };
}

export type Range = { low: number | null; high: number | null };

const RANGE_ANY = new RegExp(
  String.raw`(${NUMBER})\s*(?:-|–|—|to|till)\s*[<>]?=?\s*(${NUMBER})|(?:(<=?|≤|up\s*to|upto|less\s+than|below|under)|(>=?|≥|more\s+than|greater\s+than|above|over))\s*(${NUMBER})`,
  'gi'
);

function rangesIn(text: string) {
  const found: { range: Range; start: number; end: number }[] = [];
  for (const m of text.matchAll(RANGE_ANY)) {
    let range: Range | null = null;
    if (m[1] !== undefined) {
      const low = toNumber(m[1]);
      const high = toNumber(m[2]);
      if (low !== null && high !== null && low <= high) range = { low, high };
    } else if (m[3] !== undefined) range = { low: null, high: toNumber(m[5]) };
    else if (m[4] !== undefined) range = { low: toNumber(m[5]), high: null };
    if (range) found.push({ range, start: m.index, end: m.index + m[0].length });
  }
  return found;
}

/** Words labs use for the healthy band when they print several bands. */
const NORMAL_LABEL = /\b(?:normal|desirable|optimal|non[\s-]?diabetic|sufficien(?:t|cy)|adequate|healthy|reference|euthyroid)\b/i;
const OTHER_LABEL = /\b(?:borderline|high|very\s+high|low|deficien(?:t|cy)|insufficien(?:t|cy)|toxic\w*|pre[\s-]?diabet\w*|diabet\w*|risk|elevated|hypo\w*|hyper\w*)\b/i;

/**
 * Reads a printed reference range. Handles "13.0 - 17.0", "<200", "Up to 40",
 * "> 40", gender-specific ranges and multi-band tables where the "Normal" or
 * "Desirable" band is picked, whether the label comes before the numbers
 * ("Desirable: <200") or after them ("<200 Desirable").
 */
export function parseRange(text: string, gender: 'male' | 'female' | null = null): Range | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;

  // "Male: 13-17 Female: 12-15" / "M : 13 - 17 , F : 12 - 15"
  const male = /\b(?:male|men|m)\s*[:-]\s*([^;|]*?)(?=\b(?:female|women|f)\s*[:-]|$)/i.exec(t);
  const female = /\b(?:female|women|f)\s*[:-]\s*([^;|]*)/i.exec(t);
  if (male && female) {
    const pick = gender === 'female' ? female[1] : gender === 'male' ? male[1] : null;
    return pick ? (rangesIn(pick)[0]?.range ?? null) : null; // Unknown gender: don't guess.
  }

  const found = rangesIn(t);
  if (!found.length) return null;
  if (found.length === 1) {
    if (OTHER_LABEL.test(t) && !NORMAL_LABEL.test(t)) return null;
    return found[0].range;
  }
  // Several bands: work out whether each label sits before or after its numbers.
  const labelAfter = !/[a-z]/i.test(t.slice(0, found[0].start));
  const labels = found.map((f, i) =>
    labelAfter ? t.slice(f.end, found[i + 1]?.start ?? t.length) : t.slice(i ? found[i - 1].end : 0, f.start)
  );
  const normal = labels.findIndex((l) => NORMAL_LABEL.test(l));
  return normal >= 0 ? found[normal].range : null;
}

const UNIT_FIXES: [RegExp, string][] = [
  [/^mg\s*\/\s*dl$/i, 'mg/dL'],
  [/^gm?s?\s*\/\s*dl$/i, 'g/dL'],
  [/^g\s*%$/i, 'g/dL'],
  [/^u\s*\/\s*l$/i, 'U/L'],
  [/^iu\s*\/\s*l$/i, 'IU/L'],
  [/^ng\s*\/\s*ml$/i, 'ng/mL'],
  [/^ng\s*\/\s*dl$/i, 'ng/dL'],
  [/^pg\s*\/\s*ml$/i, 'pg/mL'],
  [/^(?:µ|μ|u|micro)g\s*\/\s*dl$/i, 'µg/dL'],
  [/^(?:µ|μ|u|micro)\s*iu\s*\/\s*ml$/i, 'µIU/mL'],
  [/^m\s*iu\s*\/\s*l$/i, 'mIU/L'],
  [/^ml\s*\/\s*min\s*\/\s*1\.73\s*m(?:2|²|\^2)?$/i, 'mL/min/1.73m²'],
  [/^mmol\s*\/\s*l$/i, 'mmol/L'],
  [/^meq\s*\/\s*l$/i, 'mEq/L'],
  [/^fl$/i, 'fL'],
];

export function tidyUnit(unit: string) {
  const u = unit.replace(/\s+/g, ' ').trim();
  for (const [re, fixed] of UNIT_FIXES) if (re.test(u)) return fixed;
  return u;
}

/** Looks like a unit rather than a word of a sentence. */
export function looksLikeUnit(text: string) {
  const t = text.trim();
  if (!t || t.length > 24) return false;
  if (/^(?:%|fl|pg|ratio|index|lakhs?\/cumm|cells\/cumm|\/cumm|\/hpf|mill(?:ion)?s?\/cumm)$/i.test(t)) return true;
  return /\//.test(t) || /^(?:10\^?\d|x\s*10)/i.test(t) || /^(?:mg|g|gm|ng|pg|µg|ug|iu|u|mmol|meq|mm|sec|seconds?|min)\b/i.test(t);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

function iso(y: number, m: number, d: number) {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Reads the first date in text: "12/Sep/2026", "12-09-2026", "12 Sep 2026", "2026-09-12". Day-first, as Indian labs print. */
export function parseReportDate(text: string): string | null {
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /\b(\d{1,2})[\s/.-]*([A-Za-z]{3,9})[\s/.,-]*(\d{2,4})\b/.exec(text);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (month >= 0) return iso(+m[3], month + 1, +m[1]);
  }
  m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(text);
  if (m) return iso(+m[3], +m[2], +m[1]);
  return null;
}
