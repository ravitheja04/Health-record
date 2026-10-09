import { buildSeries, changeBetween, statusOf, type LabChange, type LabPoint, type LabStatus, type TestSeries } from './labAnalysis';
import { PANELS, type PanelKey } from './labTests';
import { t } from '../i18n';

/**
 * A consolidated "smart report" in the style of the ones Indian labs send:
 * every test a member has had, from the first report to the latest, grouped by
 * body system. Like the rest of the app it only places values against the
 * report's own range; it never diagnoses.
 */

/** One lab report (record) that contributed results; oldest first. */
export type ReportColumn = { recordId: string; date: string; title: string };

/** Where a value sits on a bar whose middle part is the normal range; all positions are 0–1. */
export type RangeBar = { value: number; low: number; high: number };

export type SmartTest = TestSeries & {
  /** Result in each report, keyed by record id. */
  byRecord: Record<string, LabPoint>;
  first: LabPoint;
  /** First report to latest, judged against the latest report's range. Unknown with a single result. */
  overall: LabChange;
  bar: RangeBar | null;
};

export type SmartPanel = {
  key: PanelKey;
  label: string;
  tests: SmartTest[];
  outOfRange: number;
  inRange: number;
  noRange: number;
};

export type SmartReport = {
  /** Reports included (up to the chosen one), oldest first. */
  columns: ReportColumn[];
  /** Every report with results, oldest first, for choosing which one to view as of. */
  allColumns: ReportColumn[];
  panels: SmartPanel[];
  firstDate: string | null;
  latestDate: string | null;
  testCount: number;
  outOfRange: number;
};

/**
 * Lays out a bar with the normal range in the middle. Values far outside are
 * pinned near the ends so the dot stays visible.
 */
export function rangeBar(value: number, refLow: number | null, refHigh: number | null): RangeBar | null {
  let min: number;
  let max: number;
  if (refLow !== null && refHigh !== null && refHigh > refLow) {
    const w = refHigh - refLow;
    min = refLow - w / 2;
    max = refHigh + w / 2;
  } else if (refHigh !== null && refLow === null && refHigh > 0) {
    min = 0;
    max = refHigh * 1.5;
  } else if (refLow !== null && refHigh === null && refLow > 0) {
    min = 0;
    max = refLow * 2;
  } else {
    return null;
  }
  const pos = (v: number) => (v - min) / (max - min);
  const clamp = (v: number) => Math.min(0.97, Math.max(0.03, v));
  return {
    value: clamp(pos(value)),
    low: refLow === null ? 0 : pos(refLow),
    high: refHigh === null ? 1 : pos(refHigh),
  };
}

function isOut(status: LabStatus) {
  return status === 'high' || status === 'low';
}

/**
 * Builds the report from every result, or as it stood at one earlier report
 * (`asOfRecordId`): only that report and the ones before it count.
 */
export function buildSmartReport(allPoints: LabPoint[], asOfRecordId?: string | null): SmartReport {
  const columns = new Map<string, ReportColumn>();
  for (const p of allPoints) if (!columns.has(p.recordId)) columns.set(p.recordId, { recordId: p.recordId, date: p.date, title: p.recordTitle });
  const allColumns = [...columns.values()].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  const cut = asOfRecordId ? allColumns.findIndex((c) => c.recordId === asOfRecordId) : -1;
  const sortedColumns = cut >= 0 ? allColumns.slice(0, cut + 1) : allColumns;
  const included = new Set(sortedColumns.map((c) => c.recordId));
  const points = cut >= 0 ? allPoints.filter((p) => included.has(p.recordId)) : allPoints;
  const series = buildSeries(points);

  const tests: SmartTest[] = series.map((s) => {
    const byRecord: Record<string, LabPoint> = {};
    // Points are oldest first, so a test repeated within one report keeps its last value.
    for (const p of s.points) byRecord[p.recordId] = p;
    const first = s.points[0];
    return {
      ...s,
      byRecord,
      first,
      overall: s.points.length > 1 ? changeBetween(first, s.latest) : { kind: 'unknown', delta: null, unitChanged: false },
      bar: rangeBar(s.latest.value, s.latest.refLow, s.latest.refHigh),
    };
  });

  const panels: SmartPanel[] = PANELS.map((p) => {
    const list = tests.filter((x) => x.panel === p.key);
    return {
      key: p.key,
      label: p.label,
      tests: list,
      outOfRange: list.filter((x) => isOut(x.status)).length,
      inRange: list.filter((x) => x.status === 'normal').length,
      noRange: list.filter((x) => x.status === 'unknown').length,
    };
  }).filter((p) => p.tests.length);

  return {
    columns: sortedColumns,
    allColumns,
    panels,
    firstDate: sortedColumns[0]?.date ?? null,
    latestDate: sortedColumns[sortedColumns.length - 1]?.date ?? null,
    testCount: tests.length,
    outOfRange: tests.filter((x) => isOut(x.status)).length,
  };
}

/** Status of a value in one report against that report's own range. */
export function cellStatus(p: LabPoint): LabStatus {
  return statusOf(p.value, p.refLow, p.refHigh);
}

/** A plain one-line note on what a catalog test measures (not what a result means). */
export function aboutTest(testKey: string, english = false): string | null {
  const text = ABOUT[testKey];
  if (!text) return null;
  return english ? text : t(text);
}

const ABOUT: Record<string, string> = {
  hba1c: 'Average blood sugar over the past 2–3 months.',
  glucose_fasting: 'Blood sugar after not eating for 8–10 hours.',
  glucose_pp: 'Blood sugar about 2 hours after a meal.',
  glucose_random: 'Blood sugar at any time of day, whatever was eaten.',
  chol_total: 'All the cholesterol carried in the blood.',
  ldl: 'The cholesterol that can build up in blood vessel walls.',
  hdl: 'The cholesterol that helps carry extra cholesterol away.',
  triglycerides: 'A type of fat in the blood, affected by recent meals.',
  vldl: 'Cholesterol carried with triglycerides.',
  tsh: 'The hormone that tells the thyroid gland how much to work.',
  t3_total: 'One of the two main thyroid hormones.',
  t4_total: 'The main hormone made by the thyroid gland.',
  t4_free: 'The part of T4 that is free to act in the body.',
  creatinine: 'A waste product the kidneys filter out of the blood.',
  urea: 'A waste product from protein that the kidneys remove.',
  bun: 'The nitrogen part of urea, another kidney filtering measure.',
  uric_acid: 'A waste product from the breakdown of purines in food and cells.',
  egfr: 'An estimate of how much blood the kidneys filter each minute.',
  ast: 'An enzyme found in the liver and muscles.',
  alt: 'An enzyme found mainly in the liver.',
  alp: 'An enzyme found in the liver and bones.',
  bilirubin_total: 'A yellow pigment made when old red blood cells break down.',
  albumin: 'The main protein in blood, made by the liver.',
  hemoglobin: 'The protein in red blood cells that carries oxygen.',
  wbc: 'White blood cells, which help fight infections.',
  platelets: 'Cell fragments that help blood clot.',
  rbc: 'Red blood cells, which carry oxygen around the body.',
  vitamin_d: 'Vitamin D stored in the body, needed for bones and muscles.',
  vitamin_b12: 'A vitamin needed for nerves and making blood cells.',
  ferritin: 'A protein that stores iron; shows the body’s iron stores.',
};
