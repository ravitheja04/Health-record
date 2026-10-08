import type { DoseLog, DoseStatus, Medication } from './types';
import { t } from '../i18n';

/** Warn about a refill when this many days or fewer of medicine are left. */
export const REFILL_DAYS = 5;

export const WEEKDAYS = [
  {
    day: 1,
    get short() {
      return t('Mon');
    },
  },
  {
    day: 2,
    get short() {
      return t('Tue');
    },
  },
  {
    day: 3,
    get short() {
      return t('Wed');
    },
  },
  {
    day: 4,
    get short() {
      return t('Thu');
    },
  },
  {
    day: 5,
    get short() {
      return t('Fri');
    },
  },
  {
    day: 6,
    get short() {
      return t('Sat');
    },
  },
  {
    day: 0,
    get short() {
      return t('Sun');
    },
  },
];

export const INSTRUCTIONS = ['Before food', 'After food', 'With food', 'Empty stomach', 'At bedtime'];

export function weekdayOf(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Still being taken (or not started yet) on this date. */
export function isCurrent(med: Medication, date: string) {
  return med.endDate === null || med.endDate >= date;
}

export function isDueOn(med: Medication, date: string) {
  if (date < med.startDate || !isCurrent(med, date) || med.times.length === 0) return false;
  return med.frequency === 'daily' || med.days.includes(weekdayOf(date));
}

export type DoseSlot = 'morning' | 'afternoon' | 'evening' | 'night';

export const SLOT_LABELS: Record<DoseSlot, string> = {
  get morning() {
    return t('Morning');
  },
  get afternoon() {
    return t('Afternoon');
  },
  get evening() {
    return t('Evening');
  },
  get night() {
    return t('Night');
  },
};

export function slotOf(time: string): DoseSlot {
  const h = Number(time.slice(0, 2));
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

/** "21:05" -> "9:05 PM" */
export function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function toTime(hours: number, minutes: number) {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export type Dose = {
  med: Medication;
  time: string;
  status: DoseStatus | 'pending';
};

/** Every dose due on a date, earliest first, with what was logged for it. */
export function dosesOn(meds: Medication[], logs: DoseLog[], date: string): Dose[] {
  const doses: Dose[] = [];
  for (const med of meds) {
    if (!isDueOn(med, date)) continue;
    for (const time of med.times) {
      const log = logs.find((l) => l.medicationId === med.id && l.date === date && l.time === time);
      doses.push({ med, time, status: log?.status ?? 'pending' });
    }
  }
  return doses.sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name));
}

/** The first dose still to take at or after `now` ("HH:MM"). */
export function nextDose(doses: Dose[], now: string) {
  return doses.find((d) => d.status === 'pending' && d.time >= now) ?? null;
}

export function dosesPerWeek(med: Medication) {
  return med.times.length * (med.frequency === 'daily' ? 7 : med.days.length);
}

/** Whole days the remaining stock lasts, or null when stock is not tracked. */
export function daysOfSupply(med: Medication) {
  if (med.stock === null) return null;
  const perDay = (dosesPerWeek(med) * med.perDose) / 7;
  if (perDay <= 0) return null;
  return Math.floor(med.stock / perDay);
}

export function needsRefill(med: Medication, today: string) {
  const days = daysOfSupply(med);
  return days !== null && days <= REFILL_DAYS && isCurrent(med, today);
}

/** "Every day · 8:00 AM, 9:00 PM" or "Mon, Thu · 8:00 AM" */
export function scheduleText(med: Medication) {
  const when =
    med.frequency === 'daily'
      ? 'Every day'
      : WEEKDAYS.filter((w) => med.days.includes(w.day))
          .map((w) => w.short)
          .join(', ') || 'No days chosen';
  const times = med.times.map(formatTime).join(', ');
  return times ? `${when} · ${times}` : when;
}

/**
 * Change in stock when a dose's status changes: marking it taken uses up one
 * dose; undoing a taken dose puts it back.
 */
export function stockChange(previous: DoseStatus | 'pending', next: DoseStatus | 'pending', perDose: number) {
  const wasTaken = previous === 'taken';
  const isTaken = next === 'taken';
  if (wasTaken === isTaken) return 0;
  return isTaken ? -perDose : perDose;
}
