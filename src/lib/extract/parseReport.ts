import { matchTest, normalizeName } from '../labTests';
import { buildLines, type Cell, type Line, type TextItem } from './layout';
import { detectProfile, type ColumnKind, type LabProfile } from './profiles';
import { looksLikeUnit, parseRange, parseReportDate, parseValue, tidyUnit } from './values';

export type ExtractedRow = {
  testKey: string;
  /** Catalog name when recognised, otherwise the cleaned printed name. */
  testName: string;
  printedName: string;
  /** Recognised as one of the app's common tests, so it joins that test's trend. */
  matched: boolean;
  value: number;
  valueText: string;
  approx: boolean;
  /** High / low mark printed by the lab, if any. */
  flag: 'high' | 'low' | null;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  rangeText: string;
  section: string | null;
  page: number;
};

export type ExtractedReport = {
  labId: LabProfile['id'];
  labName: string;
  patientName: string | null;
  age: string | null;
  gender: 'male' | 'female' | null;
  collectedDate: string | null;
  reportedDate: string | null;
  doctor: string | null;
  rows: ExtractedRow[];
  /** Results that aren't numbers ("Negative", "Pale yellow"), listed so nothing silently disappears. */
  skipped: { name: string; value: string }[];
  /** False for scanned (image-only) PDFs, which have no text to read. */
  hasText: boolean;
  /** Read from a text PDF, or by OCR from a photo / scanned page (less exact). */
  source: 'pdf' | 'ocr';
};

type Column = { kind: ColumnKind; x0: number; x1: number };

type RawRow = {
  name: string;
  valueText: string;
  unit: string;
  range: string;
  flagText: string;
  section: string | null;
  page: number;
};

/** Patient-detail lines ("Age/Gender : 45 Y / M") that must never be read as results. */
const META_LINE = /\b(?:uhid|mr\s*no|age|gender|sex|patient|name|collected|received|reported|registered|ref(?:erring|erred)?\.?\s*(?:doctor|dr|by)|barcode|booking|order\s*id|lab\s*(?:no|id)|visit|bill|client|location|centre|center)\b\s*(?:\/\s*\w+\s*)?:/i;
/** Labels of interpretation bands, which look like rows but aren't results. */
const BAND_NAME = /^(?:normal|non[\s-]?diabetic|pre[\s-]?diabet\w*|diabet\w*|desirable|borderline(?:\s+high)?|high|very\s+high|low|near\s+optimal|optimal|above\s+optimal|deficien\w*|insufficien\w*|sufficien\w*|toxic\w*|adults?|child(?:ren)?|infants?|new\s*borns?|males?|females?|men|women|pregnan\w*|(?:first|second|third|1st|2nd|3rd)\s+trimester|good\s+control|poor\s+control|fair\s+control|target|(?:low|moderate|high|average)\s+risk)\s*(?:[:\-–(<>≤≥=\d]|$)/i;
const NOTES_HEADING = /^(?:interpretation|notes?|comments?|clinical\s+significance|remarks?)\b/i;

export function parseReport(items: TextItem[], source: 'pdf' | 'ocr' = 'pdf'): ExtractedReport {
  const lines = buildLines(items, { lineTolerance: source === 'ocr' ? 0.5 : 0.4 });
  const profile = detectProfile(lines.map((l) => l.text).join('\n'));
  const meta = readMeta(lines, profile);
  const { raw, skipped } = readTable(lines, profile);
  const rows = finishRows(raw, meta.gender, profile);
  return {
    labId: profile.id,
    labName: profile.labName,
    ...meta,
    rows,
    skipped,
    hasText: lines.length > 0,
    source,
  };
}

// ---- Patient details ---------------------------------------------------------

const COLON_SPLIT = /\s*:\s+|\s+:\s*|\s*:$/;

function readMeta(lines: Line[], profile: LabProfile) {
  const found: Partial<Record<keyof LabProfile['meta'], string>> = {};
  for (const line of lines) {
    const pieces = line.cells.flatMap((c) => c.text.split(COLON_SPLIT)).map((p) => p.trim()).filter((p) => p && p !== ':');
    const labelOf = (p: string) =>
      (Object.keys(profile.meta) as (keyof LabProfile['meta'])[]).find((k) => profile.meta[k].test(p.replace(/[.:]+$/, '').trim()));
    for (let i = 0; i < pieces.length - 1; i++) {
      const label = labelOf(pieces[i]);
      if (!label || found[label]) continue;
      const value = pieces[i + 1];
      if (labelOf(value)) continue;
      found[label] = value;
    }
  }

  const ageText = found.age ?? null;
  const genderText = `${found.gender ?? ''} ${ageText ?? ''}`;
  const gender = /\b(?:female|f)\b/i.test(genderText) ? 'female' : /\b(?:male|m)\b/i.test(genderText) ? 'male' : null;
  const age = ageText ? (/(\d{1,3})\s*(?:y|yrs?|years?)\b/i.exec(ageText)?.[1] ?? /^\s*(\d{1,3})\b/.exec(ageText)?.[1] ?? null) : null;

  return {
    patientName: found.patient ? cleanPatientName(found.patient) : null,
    age,
    gender: gender as 'male' | 'female' | null,
    collectedDate: found.collected ? parseReportDate(found.collected) : null,
    reportedDate: found.reported ? parseReportDate(found.reported) : null,
    doctor: found.doctor && !/^(?:dr\.?\s*)?(?:self|na|n\/a|-+)$/i.test(found.doctor.trim()) ? found.doctor.trim() : null,
  };
}

function cleanPatientName(name: string) {
  const n = name
    .replace(/^(?:mr|mrs|ms|miss|master|mast|baby|b\/o|dr|smt|shri|sri|kum)(?:\.\s*|\s+)/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return titleCase(n);
}

// ---- Results table -----------------------------------------------------------

function headerColumns(line: Line, profile: LabProfile): Column[] | null {
  const cols: Column[] = [];
  for (const cell of line.cells) {
    const text = cell.text.replace(/[:.]+$/, '').trim();
    const kind = profile.headers.find(([, re]) => re.test(text))?.[0];
    if (kind && !cols.some((c) => c.kind === kind)) cols.push({ kind, x0: cell.x0, x1: cell.x1 });
  }
  const kinds = new Set(cols.map((c) => c.kind));
  if (!kinds.has('result') || !(kinds.has('name') || kinds.has('unit') || kinds.has('range'))) return null;
  if (!kinds.has('name')) cols.unshift({ kind: 'name', x0: 0, x1: Math.min(...cols.map((c) => c.x0)) - 1 });
  return cols.sort((a, b) => a.x0 - b.x0);
}

function columnOf(cell: Cell, cols: Column[], size: number): ColumnKind {
  let best: Column | null = null;
  let bestOverlap = 0;
  for (const c of cols) {
    const overlap = Math.min(cell.x1, c.x1) - Math.max(cell.x0, c.x0);
    if (overlap > bestOverlap) {
      best = c;
      bestOverlap = overlap;
    }
  }
  if (best) return best.kind;
  // No overlap: the column that starts nearest to the left of the cell.
  const left = cols.filter((c) => c.x0 <= cell.x0 + size * 1.5);
  return (left[left.length - 1] ?? cols[0]).kind;
}

function readTable(lines: Line[], profile: LabProfile) {
  const raw: RawRow[] = [];
  const skipped: { name: string; value: string }[] = [];
  let cols: Column[] | null = null;
  let section: string | null = null;
  let pendingName: string | null = null;
  let last: RawRow | null = null;
  let inNotes = false;

  for (const line of lines) {
    const header = headerColumns(line, profile);
    if (header) {
      cols = header;
      // A heading just above the table header ("LIPID PROFILE , SERUM") names this block.
      section = pendingName;
      last = null;
      pendingName = null;
      inNotes = false;
      continue;
    }
    if (NOTES_HEADING.test(line.cells[0].text)) {
      inNotes = true;
      last = null;
      pendingName = null;
      continue;
    }
    if (META_LINE.test(line.text) || profile.skip.some((re) => re.test(line.text) || re.test(line.cells[0].text))) {
      continue;
    }

    if (!cols) {
      // No table header seen yet: only take lines that clearly are a known test with a value.
      const row = looseRow(line, section);
      if (row) raw.push(row);
      continue;
    }

    const parts: Record<ColumnKind, string[]> = { name: [], result: [], unit: [], range: [], method: [], flag: [] };
    for (const cell of line.cells) parts[columnOf(cell, cols, line.size)].push(cell.text);
    const name = parts.name.join(' ').trim();
    const result = parts.result.join(' ').trim();
    const range = parts.range.join(' ').trim();
    const value = result ? parseValue(result) : null;
    const isSingleValue = value && (!value.rest || looksLikeUnit(value.rest)) && !/^[-–]\s*\d/.test(value.rest);

    if (value && isSingleValue) {
      const rowName = name || pendingName || '';
      if (!rowName || BAND_NAME.test(rowName) || (inNotes && !matchTest(cleanName(rowName, profile)))) {
        last = null;
        continue;
      }
      let fullName = rowName;
      if (name && pendingName) {
        // The line above is either the first half of this name (value printed on the
        // second line) or a section heading such as "LIPID PROFILE".
        if (continuesName(pendingName, name, profile)) fullName = `${pendingName} ${name}`;
        else section = pendingName;
      }
      const row: RawRow = {
        name: fullName,
        valueText: result,
        unit: parts.unit.join(' ').trim() || (value.rest && looksLikeUnit(value.rest) ? value.rest : ''),
        range,
        flagText: parts.flag.join(' '),
        section,
        page: line.page,
      };
      raw.push(row);
      last = row;
      pendingName = null;
      continue;
    }

    if (!name && !result && last && (range || parts.unit.length)) {
      // A reference range (or unit) that wrapped onto the next line.
      if (range) last.range = `${last.range} ${range}`.trim();
      if (!last.unit && parts.unit.length) last.unit = parts.unit.join(' ');
      continue;
    }

    if (name && result && !value) {
      // Text results such as "Negative" or "Pale yellow".
      if (!BAND_NAME.test(name) && !inNotes) skipped.push({ name: titleCase(cleanName(name, profile)), value: result });
      last = null;
      pendingName = null;
      continue;
    }

    if (name && !result && !range) {
      if (last && (name.startsWith('(') || /^[a-z]/.test(name) || /\([^)]*$/.test(last.name) || continuesName(last.name, name, profile))) {
        last.name = `${last.name} ${name}`; // "Glycosylated Haemoglobin" + "(HbA1c)"
        continue;
      }
      pendingName = pendingName && !last ? `${pendingName} ${name}` : name;
      last = null;
      continue;
    }

    last = null;
  }
  return { raw, skipped };
}

const knows = (name: string, profile: LabProfile) => nameVariants(cleanName(name, profile)).some((v) => !!matchTest(v));

/** "THYROID STIMULATING" + "HORMONE (TSH)" only makes sense as one name. */
function continuesName(first: string, second: string, profile: LabProfile) {
  return knows(`${first} ${second}`, profile) && !knows(first, profile) && !knows(second, profile);
}

/** Header-less fallback: "<known test> <value> <unit> <range>" on one line. */
function looseRow(line: Line, section: string | null): RawRow | null {
  const m = /^(?<name>[A-Za-z(][A-Za-z0-9().,/\- ]*?[A-Za-z)])\s+(?<value>[<>]?\d[\d,]*(?:\.\d+)?)\s*(?<flag>\b[HL]\b)?\s*(?<unit>\S*\/\S+|%|fL|pg)?\s*(?<range>.*)$/.exec(line.text);
  if (!m?.groups) return null;
  const name = m.groups.name.trim();
  if (!matchTest(name) || BAND_NAME.test(name)) return null;
  if (!m.groups.unit && !parseRange(m.groups.range)) return null;
  return {
    name,
    valueText: `${m.groups.value}${m.groups.flag ? ` ${m.groups.flag}` : ''}`,
    unit: m.groups.unit ?? '',
    range: m.groups.range,
    flagText: '',
    section,
    page: line.page,
  };
}

// ---- Names -------------------------------------------------------------------

function cleanName(name: string, profile?: LabProfile) {
  let n = name;
  for (const re of profile?.nameNoise ?? []) n = n.replace(re, ' ');
  return n.replace(/\s+/g, ' ').replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '').trim();
}

/** Ways the printed name might be written in the catalog: "CHOLESTEROL, TOTAL" → "Total cholesterol". */
function nameVariants(name: string) {
  const variants = [name];
  const outside = name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const inside = [...name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim());
  variants.push(outside, ...inside);
  for (const base of [name, outside]) {
    for (const sep of [',', ' - ', ' – ', '/']) {
      if (!base.includes(sep)) continue;
      const parts = base.split(sep).map((p) => p.trim()).filter(Boolean);
      variants.push([...parts].reverse().join(' '), ...parts);
    }
  }
  // Trailing qualifiers labs add: "LDL Cholesterol Direct", "TSH 3rd Generation".
  variants.push(...variants.map((v) => v.replace(/\b(?:direct|calculated|total|ultra\s*sensitive|ultrasensitive|3rd\s*generation|third\s*generation|serum|plasma|blood|level)\b/gi, ' ').replace(/\s+/g, ' ').trim()));
  return [...new Set(variants.filter((v) => normalizeName(v)))];
}

const GENERIC_GLUCOSE = /^(?:glucose|blood\s*sugar|sugar|plasma\s*glucose|blood\s*glucose)$/i;

function finishRows(raw: RawRow[], gender: 'male' | 'female' | null, profile: LabProfile): ExtractedRow[] {
  const rows: ExtractedRow[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const printed = r.name.replace(/\s+/g, ' ').trim();
    const cleaned = cleanName(printed, profile);
    if (!cleaned || cleaned.length > 70 || !/[a-z]/i.test(cleaned)) continue;
    const value = parseValue(r.valueText);
    if (!value) continue;

    let def = nameVariants(cleaned).map(matchTest).find(Boolean);
    if (!def && GENERIC_GLUCOSE.test(cleaned) && r.section) {
      // "Glucose" under a "Fasting blood sugar" heading.
      def = nameVariants(cleanName(r.section, profile)).map(matchTest).find(Boolean);
    }
    const testName = def?.name ?? titleCase(cleaned);
    const testKey = def?.key ?? `custom:${normalizeName(cleaned)}`;
    if (seen.has(testKey)) continue;
    seen.add(testKey);

    const range = parseRange(r.range, gender);
    rows.push({
      testKey,
      testName,
      printedName: printed,
      matched: !!def,
      value: value.parsed.value,
      valueText: value.parsed.text,
      approx: value.parsed.approx,
      flag: value.parsed.flag ?? (/\b(?:h|high)\b/i.test(r.flagText) ? 'high' : /\b(?:l|low)\b/i.test(r.flagText) ? 'low' : null),
      unit: tidyUnit(r.unit),
      refLow: range?.low ?? null,
      refHigh: range?.high ?? null,
      rangeText: r.range,
      section: r.section ? titleCase(cleanName(r.section, profile)) : null,
      page: r.page,
    });
  }
  return rows;
}

function titleCase(text: string) {
  const letters = text.replace(/[^A-Za-z]/g, '');
  const upper = letters.replace(/[^A-Z]/g, '').length;
  if (!letters || upper / letters.length < 0.7) return text; // Already in normal case.
  return text
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Hba1c|Tsh|Ldl|Hdl|Vldl|Rbc|Wbc|Tlc|Dlc|Pcv|Hct|Mpv|Pdw|Mcv|Mch|Mchc|Rdw|Eag|Ggtp|Ldh|Cpk|Hscrp|Apo|Inr|Pt|Aptt|Ana|Ra|Esr|Sgot|Sgpt|Ast|Alt|Alp|Ggt|Bun|Egfr|Crp|Hs|T3|T4|Ft3|Ft4|Psa|Ige|Hiv|Hbsag|Cbc|Kft|Lft|Rft)\b/g, (w) => w.toUpperCase());
}

// ---- Matching the report to a family member ---------------------------------

/** Picks the member whose name best matches the patient name on the report. */
export function matchMember<T extends { id: string; name: string }>(patientName: string | null, members: T[]): T | null {
  if (!patientName) return null;
  const want = normalizeName(patientName).split(' ').filter((w) => w.length > 1);
  let best: T | null = null;
  let bestScore = 0;
  for (const m of members) {
    const have = normalizeName(m.name).split(' ').filter((w) => w.length > 1);
    const score = have.filter((w) => want.includes(w)).length + (have[0] && have[0] === want[0] ? 1 : 0);
    if (score > bestScore) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}
