import { getTestDef, PANELS, panelOf, type PanelKey } from './labTests';
import type { LabResult } from './types';

/** A result together with the date of the report it came from. */
export type LabPoint = LabResult & { date: string; recordTitle: string };

export type LabStatus = 'high' | 'low' | 'normal' | 'unknown';

/**
 * How a value moved relative to the report's reference range. We never judge
 * "good" or "bad" ourselves: only whether it moved toward or away from the range.
 */
export type ChangeKind = 'toward' | 'away' | 'same' | 'unknown';

export type LabChange = { kind: ChangeKind; delta: number | null; unitChanged: boolean };

export type TestSeries = {
  testKey: string;
  testName: string;
  panel: PanelKey;
  unit: string;
  /** Oldest first. */
  points: LabPoint[];
  latest: LabPoint;
  previous: LabPoint | null;
  status: LabStatus;
  change: LabChange;
};

export function statusOf(value: number, refLow: number | null, refHigh: number | null): LabStatus {
  if (refLow === null && refHigh === null) return 'unknown';
  if (refHigh !== null && value > refHigh) return 'high';
  if (refLow !== null && value < refLow) return 'low';
  return 'normal';
}

function distanceFromRange(value: number, refLow: number | null, refHigh: number | null) {
  if (refHigh !== null && value > refHigh) return value - refHigh;
  if (refLow !== null && value < refLow) return refLow - value;
  return 0;
}

function sameUnit(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Compares two results of one test, judged against the newer report's range. */
export function changeBetween(previous: LabResult | null, current: LabResult): LabChange {
  if (!previous) return { kind: 'unknown', delta: null, unitChanged: false };
  if (!sameUnit(previous.unit, current.unit)) return { kind: 'unknown', delta: null, unitChanged: true };
  const delta = current.value - previous.value;
  if (current.refLow === null && current.refHigh === null) {
    return { kind: delta === 0 ? 'same' : 'unknown', delta, unitChanged: false };
  }
  const before = distanceFromRange(previous.value, current.refLow, current.refHigh);
  const after = distanceFromRange(current.value, current.refLow, current.refHigh);
  const eps = 1e-9;
  const kind: ChangeKind = after < before - eps ? 'toward' : after > before + eps ? 'away' : 'same';
  return { kind, delta, unitChanged: false };
}

function byDate(a: LabPoint, b: LabPoint) {
  return a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date);
}

/** Groups a member's results into one series per test, ordered by panel and name. */
export function buildSeries(points: LabPoint[]): TestSeries[] {
  const groups = new Map<string, LabPoint[]>();
  for (const p of points) {
    const list = groups.get(p.testKey);
    if (list) list.push(p);
    else groups.set(p.testKey, [p]);
  }
  const series: TestSeries[] = [];
  for (const [testKey, list] of groups) {
    list.sort(byDate);
    const latest = list[list.length - 1];
    const previous = list.length > 1 ? list[list.length - 2] : null;
    series.push({
      testKey,
      testName: getTestDef(testKey)?.name ?? latest.testName,
      panel: panelOf(testKey),
      unit: latest.unit,
      points: list,
      latest,
      previous,
      status: statusOf(latest.value, latest.refLow, latest.refHigh),
      change: changeBetween(previous, latest),
    });
  }
  const panelOrder = new Map(PANELS.map((p, i) => [p.key, i]));
  return series.sort(
    (a, b) => (panelOrder.get(a.panel) ?? 99) - (panelOrder.get(b.panel) ?? 99) || a.testName.localeCompare(b.testName)
  );
}

export type LabSummary = {
  testsTracked: number;
  outOfRange: number;
  movedToward: number;
  reportCount: number;
  latestDate: string | null;
  firstDate: string | null;
};

export function summarize(series: TestSeries[], points: LabPoint[]): LabSummary {
  const dates = points.map((p) => p.date).sort();
  return {
    testsTracked: series.length,
    outOfRange: series.filter((s) => s.status === 'high' || s.status === 'low').length,
    movedToward: series.filter((s) => s.change.kind === 'toward').length,
    reportCount: new Set(points.map((p) => p.recordId)).size,
    latestDate: dates.length ? dates[dates.length - 1] : null,
    firstDate: dates.length ? dates[0] : null,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function dateToMs(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function msToDate(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Typical gap between tests in whole months, and when the next one would fall.
 * Needs at least two tests on different dates.
 */
export function testCadence(points: LabPoint[]): { months: number; nextDate: string } | null {
  const dates = [...new Set(points.map((p) => p.date))].sort();
  if (dates.length < 2) return null;
  const first = dateToMs(dates[0]);
  const last = dateToMs(dates[dates.length - 1]);
  const avgDays = (last - first) / DAY_MS / (dates.length - 1);
  const months = Math.max(1, Math.round(avgDays / 30.44));
  return { months, nextDate: msToDate(last + months * 30.44 * DAY_MS) };
}

/** Formats a lab value without trailing zeros: 7.10 -> "7.1", 124.0 -> "124". */
export function formatValue(value: number) {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return String(Number(value.toFixed(decimals)));
}

export function formatRange(refLow: number | null, refHigh: number | null, unit = '') {
  const u = unit ? ` ${unit}` : '';
  if (refLow !== null && refHigh !== null) return `${formatValue(refLow)}–${formatValue(refHigh)}${u}`;
  if (refHigh !== null) return `below ${formatValue(refHigh)}${u}`;
  if (refLow !== null) return `above ${formatValue(refLow)}${u}`;
  return '';
}

export function formatDelta(delta: number) {
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '';
  return delta === 0 ? 'No change' : `${arrow} ${formatValue(Math.abs(delta))}`;
}

/** Parses what people type into a number field, accepting "7,1" as 7.1. */
export function parseNumber(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
