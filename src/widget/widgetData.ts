import { dosesOn, formatTime } from '../lib/medSchedule';
import type { DoseLog, Medication } from '../lib/types';

/** What the home-screen widget shows for one dose today. */
export type WidgetDose = {
  medicationId: string;
  time: string;
  timeText: string;
  /** "Amma · Metformin 500 mg" */
  title: string;
  status: 'taken' | 'skipped' | 'late' | 'due';
};

export type WidgetModel =
  | { kind: 'locked' }
  | { kind: 'empty' }
  | { kind: 'doses'; doses: WidgetDose[]; more: number; taken: number; total: number; allDone: boolean };

/** Doses past their time by more than this are shown as late. */
const LATE_AFTER_MIN = 30;

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * Today's doses for the widget: the late and upcoming ones first (what needs
 * doing), then the rest, limited to what fits. With app lock on, nothing
 * private is shown on the home screen.
 */
export function widgetModel(input: {
  locked: boolean;
  meds: (Medication & { memberName: string })[];
  logs: DoseLog[];
  today: string;
  now: string;
  maxRows: number;
}): WidgetModel {
  if (input.locked) return { kind: 'locked' };
  const doses = dosesOn(input.meds, input.logs, input.today);
  if (!doses.length) return { kind: 'empty' };
  const rows: WidgetDose[] = doses.map((d) => {
    const member = (d.med as Medication & { memberName: string }).memberName.split(' ')[0];
    const status =
      d.status === 'taken' || d.status === 'skipped' ? d.status : minutes(input.now) - minutes(d.time) > LATE_AFTER_MIN ? 'late' : 'due';
    return {
      medicationId: d.med.id,
      time: d.time,
      timeText: formatTime(d.time),
      title: `${member} · ${d.med.name}${d.med.dose ? ` ${d.med.dose}` : ''}`,
      status,
    };
  });
  const order = { late: 0, due: 1, taken: 2, skipped: 2 } as const;
  const sorted = [...rows].sort((a, b) => order[a.status] - order[b.status] || a.time.localeCompare(b.time));
  const taken = rows.filter((r) => r.status === 'taken').length;
  return {
    kind: 'doses',
    doses: sorted.slice(0, input.maxRows),
    more: Math.max(0, sorted.length - input.maxRows),
    taken,
    total: rows.length,
    allDone: rows.every((r) => r.status === 'taken' || r.status === 'skipped'),
  };
}

/** Rows that fit in a widget of this height (dp). */
export function rowsForHeight(heightDp: number) {
  return Math.max(1, Math.min(8, Math.floor((heightDp - 52) / 34)));
}
