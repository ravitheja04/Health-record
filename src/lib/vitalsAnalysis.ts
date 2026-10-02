import { formatDate } from './format';
import { formatTime } from './medSchedule';
import type { Vital, VitalType } from './types';

/**
 * Typical adult ranges are a neutral guide only: readings are labelled "above"
 * or "below" the typical range, never diagnosed, and screens remind people that
 * their doctor may set different targets.
 */
export type VitalDef = {
  type: VitalType;
  label: string;
  short: string;
  unit: string;
  icon: string;
  color: string;
  /** Allowed input, to catch typos such as 1200 instead of 120. */
  min: number;
  max: number;
  /** Second value (diastolic) limits for blood pressure. */
  min2?: number;
  max2?: number;
  decimals: number;
  typical: { low: number | null; high: number | null } | null;
  typical2?: { low: number | null; high: number | null };
};

export const VITALS: VitalDef[] = [
  {
    type: 'bp',
    label: 'Blood pressure',
    short: 'BP',
    unit: 'mmHg',
    icon: 'heart-outline',
    color: '#DC2626',
    min: 50,
    max: 260,
    min2: 30,
    max2: 160,
    decimals: 0,
    typical: { low: 90, high: 120 },
    typical2: { low: 60, high: 80 },
  },
  { type: 'sugar', label: 'Blood sugar', short: 'Sugar', unit: 'mg/dL', icon: 'water-outline', color: '#7C3AED', min: 20, max: 700, decimals: 0, typical: { low: 70, high: 100 } },
  { type: 'weight', label: 'Weight', short: 'Weight', unit: 'kg', icon: 'barbell-outline', color: '#0891B2', min: 1, max: 300, decimals: 1, typical: null },
  { type: 'pulse', label: 'Heart rate', short: 'Pulse', unit: 'bpm', icon: 'pulse-outline', color: '#DB2777', min: 25, max: 250, decimals: 0, typical: { low: 60, high: 100 } },
  { type: 'spo2', label: 'Oxygen (SpO₂)', short: 'SpO₂', unit: '%', icon: 'fitness-outline', color: '#2563EB', min: 50, max: 100, decimals: 0, typical: { low: 95, high: null } },
  { type: 'temp', label: 'Temperature', short: 'Temp', unit: '°F', icon: 'thermometer-outline', color: '#EA580C', min: 90, max: 110, decimals: 1, typical: { low: 97, high: 99 } },
  // Height and head size mostly matter for children's growth (see lib/growth.ts); head size only under 5.
  { type: 'height', label: 'Height', short: 'Height', unit: 'cm', icon: 'resize-outline', color: '#4F46E5', min: 30, max: 250, decimals: 1, typical: null },
  { type: 'head', label: 'Head size', short: 'Head', unit: 'cm', icon: 'happy-outline', color: '#CA8A04', min: 25, max: 60, decimals: 1, typical: null },
];

/** Vitals worth offering for a person of this age (years, or null when unknown). */
export function vitalsForAge(age: number | null) {
  return VITALS.filter((v) => v.type !== 'head' || (age !== null && age < 5));
}

export const SUGAR_CONTEXTS = [
  { key: 'fasting', label: 'Fasting' },
  { key: 'after_meal', label: 'After meal (2 hr)' },
  { key: 'random', label: 'Random' },
];

export function vitalDef(type: VitalType) {
  return VITALS.find((v) => v.type === type)!;
}

/** The typical range for a reading; blood sugar depends on when it was taken. */
export function typicalRange(type: VitalType, context = '') {
  if (type === 'sugar') return context === 'fasting' ? { low: 70, high: 100 } : { low: 70, high: 140 };
  return vitalDef(type).typical;
}

export type VitalStatus = 'above' | 'below' | 'in' | 'none';

function compare(value: number, range: { low: number | null; high: number | null } | null | undefined): VitalStatus {
  if (!range) return 'none';
  if (range.high !== null && value > range.high) return 'above';
  if (range.low !== null && value < range.low) return 'below';
  return 'in';
}

export function vitalStatus(v: Pick<Vital, 'type' | 'value' | 'value2' | 'context'>): VitalStatus {
  if (v.type === 'bp') {
    const def = vitalDef('bp');
    const a = compare(v.value, def.typical);
    const b = v.value2 === null ? 'none' : compare(v.value2, def.typical2);
    if (a === 'above' || b === 'above') return 'above';
    if (a === 'below' || b === 'below') return 'below';
    return 'in';
  }
  return compare(v.value, typicalRange(v.type, v.context));
}

function round(value: number, decimals: number) {
  return String(Number(value.toFixed(decimals)));
}

/** "132/86", "118", "74.2" */
export function formatVital(v: Pick<Vital, 'type' | 'value' | 'value2'>) {
  const def = vitalDef(v.type);
  if (v.type === 'bp') return `${round(v.value, 0)}/${v.value2 === null ? '?' : round(v.value2, 0)}`;
  return round(v.value, def.decimals);
}

export function rangeText(type: VitalType, context = '') {
  if (type === 'bp') return 'Typical: 90/60 to 120/80 mmHg';
  const r = typicalRange(type, context);
  const unit = vitalDef(type).unit;
  if (!r) return '';
  if (r.low !== null && r.high !== null) return `Typical: ${r.low}–${r.high} ${unit}`;
  if (r.low !== null) return `Typical: ${r.low} ${unit} or more`;
  return `Typical: up to ${r.high} ${unit}`;
}

/** Validates typed values; returns an error message, or null when fine. */
export function checkVital(type: VitalType, value: number | null, value2: number | null): string | null {
  const def = vitalDef(type);
  if (value === null) return `Enter the ${type === 'bp' ? 'top (systolic) number' : def.label.toLowerCase()}.`;
  if (value < def.min || value > def.max) return `${def.label} should be between ${def.min} and ${def.max} ${def.unit}. Check for a typo.`;
  if (type === 'bp') {
    if (value2 === null) return 'Enter the bottom (diastolic) number.';
    if (value2 < def.min2! || value2 > def.max2!) return `The bottom number should be between ${def.min2} and ${def.max2}.`;
    if (value2 >= value) return 'The top number should be higher than the bottom number.';
  }
  return null;
}

/** Latest reading of each type, keyed by type. */
export function latestByType<T extends Pick<Vital, 'type' | 'measuredAt'>>(list: T[]) {
  const latest = new Map<VitalType, T>();
  for (const v of list) {
    const cur = latest.get(v.type);
    if (!cur || v.measuredAt > cur.measuredAt) latest.set(v.type, v);
  }
  return latest;
}

/** "YYYY-MM-DDTHH:MM" as milliseconds in local time. */
export function measuredMs(measuredAt: string) {
  const [date, time = '00:00'] = measuredAt.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
}

export function nowMeasuredAt(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** "2 Oct 2026, 8:40 AM" */
export function whenText(measuredAt: string) {
  const [date, time = '00:00'] = measuredAt.split('T');
  return `${formatDate(date)}, ${formatTime(time)}`;
}
