import { bmi, evaluate, valueAtZScore, type Indicator, type Sex } from 'who-growth-standards';

import type { Vital } from './types';

/**
 * Children's growth against the WHO Child Growth Standards (birth to 5 years),
 * which Indian paediatric guidelines (IAP) use for under-fives. Values are only
 * placed relative to the reference population ("usual range", percentile);
 * nothing here is a diagnosis.
 */

export type GrowthKind = 'weight' | 'height' | 'head' | 'bmi';

export const GROWTH_KINDS: { kind: GrowthKind; label: string; unit: string; indicator: Indicator }[] = [
  { kind: 'weight', label: 'Weight', unit: 'kg', indicator: 'wfa' },
  { kind: 'height', label: 'Height', unit: 'cm', indicator: 'lhfa' },
  { kind: 'head', label: 'Head size', unit: 'cm', indicator: 'hcfa' },
  { kind: 'bmi', label: 'BMI', unit: 'kg/m²', indicator: 'bfa' },
];

/** WHO publishes these tables to 1856 days (5 years and a bit). */
export const WHO_MAX_DAYS = 1856;
/** The lines WHO growth charts draw: the median and 2 and 3 SD either side. */
export const Z_LINES = [-3, -2, 0, 2, 3] as const;

export function sexFor(gender: string | null): Sex | null {
  if (gender === 'Male') return 'male';
  if (gender === 'Female') return 'female';
  return null;
}

/** Whole days between two dates ("YYYY-MM-DD" or "YYYY-MM-DDTHH:MM"), e.g. birth to a measurement. */
export function ageDays(dob: string, on: string) {
  const [y, m, d] = dob.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = on.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y, m - 1, d)) / 86_400_000);
}

/** "3 days", "5 weeks", "7 months", "2 y 4 m" */
export function ageText(days: number) {
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 90) return `${Math.round(days / 7)} weeks`;
  const months = Math.floor(days / 30.4375);
  if (months < 24) return `${months} months`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} y ${rest} m` : `${years} years`;
}

export type GrowthPoint = {
  days: number;
  value: number;
  measuredAt: string;
  /** WHO z-score and percentile; null past 5 years or without a known sex. */
  z: number | null;
  percentile: number | null;
};

/**
 * One kind of measurement over time. BMI pairs each weight with the height
 * measured within the 30 days before it.
 */
export function growthSeries(kind: GrowthKind, vitals: Vital[], dob: string, sex: Sex | null): GrowthPoint[] {
  const def = GROWTH_KINDS.find((k) => k.kind === kind)!;
  const byTime = [...vitals].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  let raw: { measuredAt: string; value: number }[];
  if (kind === 'bmi') {
    const heights = byTime.filter((v) => v.type === 'height');
    raw = byTime
      .filter((v) => v.type === 'weight')
      .flatMap((w) => {
        const h = [...heights].reverse().find((x) => x.measuredAt <= w.measuredAt && ageDays(x.measuredAt, w.measuredAt) <= 30);
        return h ? [{ measuredAt: w.measuredAt, value: Math.round(bmi(w.value, h.value) * 10) / 10 }] : [];
      });
  } else {
    raw = byTime.filter((v) => v.type === kind).map((v) => ({ measuredAt: v.measuredAt, value: v.value }));
  }
  return raw
    .map(({ measuredAt, value }) => {
      const days = ageDays(dob, measuredAt);
      let z: number | null = null;
      let percentile: number | null = null;
      if (sex && days >= 0 && days <= WHO_MAX_DAYS) {
        const r = evaluate(def.indicator, sex, value, days);
        z = r.zScore;
        percentile = r.percentile;
      }
      return { days, value, measuredAt, z, percentile };
    })
    .filter((p) => p.days >= 0);
}

/** WHO reference curves for drawing, sampled about every two weeks up to `maxDays`. */
export function referenceCurves(kind: GrowthKind, sex: Sex, maxDays: number) {
  const def = GROWTH_KINDS.find((k) => k.kind === kind)!;
  const end = Math.min(WHO_MAX_DAYS, Math.max(30, maxDays));
  const step = Math.max(1, Math.round(end / 60));
  const days: number[] = [];
  for (let d = 0; d < end; d += step) days.push(d);
  days.push(end);
  return Z_LINES.map((z) => ({ z, points: days.map((d) => ({ days: d, value: valueAtZScore(def.indicator, sex, z, d) })) }));
}

export type GrowthStatus = 'usual' | 'below' | 'above' | 'none';

/** WHO charts treat −2 to +2 SD as the usual range. */
export function growthStatus(z: number | null): GrowthStatus {
  if (z === null) return 'none';
  if (z < -2) return 'below';
  if (z > 2) return 'above';
  return 'usual';
}

/** "42nd percentile" */
export function percentileText(p: number) {
  const n = p < 1 ? '<1' : p > 99 ? '>99' : String(Math.round(p));
  if (n.startsWith('<') || n.startsWith('>')) return `${n} percentile`;
  const last = Number(n) % 100;
  const suffix = last >= 11 && last <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][Number(n) % 10] ?? 'th';
  return `${n}${suffix} percentile`;
}

const WEEK = 7;
const MONTH = 30.4375;
const YEAR = 365.25;

/** Ticks at whole weeks, months or years (at most ~6), labelled exactly where they sit. */
export function ageTicks(minDays: number, maxDays: number) {
  const span = Math.max(1, maxDays - minDays);
  const options: [number, (d: number) => string][] = [
    [WEEK, (d) => `${Math.round(d / WEEK)}w`],
    [2 * WEEK, (d) => `${Math.round(d / WEEK)}w`],
    [MONTH, (d) => `${Math.round(d / MONTH)}m`],
    [2 * MONTH, (d) => `${Math.round(d / MONTH)}m`],
    [3 * MONTH, (d) => `${Math.round(d / MONTH)}m`],
    [6 * MONTH, (d) => (Math.round(d / MONTH) % 12 === 0 ? `${Math.round(d / YEAR)}y` : `${Math.round(d / MONTH)}m`)],
    [YEAR, (d) => `${Math.round(d / YEAR)}y`],
    [2 * YEAR, (d) => `${Math.round(d / YEAR)}y`],
    [5 * YEAR, (d) => `${Math.round(d / YEAR)}y`],
  ];
  const [step, label] = options.find(([st]) => span / st <= 6) ?? options[options.length - 1];
  const ticks: { days: number; label: string }[] = [];
  for (let d = Math.ceil(minDays / step) * step; d <= maxDays + 0.5; d += step) ticks.push({ days: d, label: label(d) });
  return ticks;
}
