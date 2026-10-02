import { formatDate } from './format';
import { dateToMs } from './labAnalysis';
import { addDays } from './medSchedule';
import type { ScheduleAge, VaccineSchedule } from './vaccineSchedules';
import type { Vaccination } from './types';
import { t, tn } from '../i18n';

/** A vaccine counts as "due soon" this many days ahead. */
export const DUE_SOON_DAYS = 30;

export type VaccineStatus = 'given' | 'overdue' | 'due' | 'upcoming' | 'undated';

/** Calendar-correct month arithmetic: 31 Jan + 1 month = 28/29 Feb. */
export function addMonths(date: string, months: number) {
  const [y, m, d] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

export function dueDateFor(dob: string, age: ScheduleAge) {
  const withMonths = addMonths(dob, (age.years ?? 0) * 12 + (age.months ?? 0));
  return addDays(withMonths, (age.weeks ?? 0) * 7);
}

export function vaccineStatus(v: Pick<Vaccination, 'dueDate' | 'givenDate'>, today: string): VaccineStatus {
  if (v.givenDate) return 'given';
  if (!v.dueDate) return 'undated';
  if (v.dueDate < today) return 'overdue';
  if (v.dueDate <= addDays(today, DUE_SOON_DAYS)) return 'due';
  return 'upcoming';
}

/** Schedule doses as new vaccinations, skipping any already added from that schedule. */
export function planFromSchedule(
  schedule: VaccineSchedule,
  dob: string,
  existing: Pick<Vaccination, 'scheduleKey'>[],
): { scheduleKey: string; name: string; dose: string; dueDate: string; ageLabel: string }[] {
  const have = new Set(existing.map((v) => v.scheduleKey).filter(Boolean));
  return schedule.doses
    .map((dose) => ({
      scheduleKey: `${schedule.key}:${dose.id}`,
      name: dose.name,
      dose: dose.dose,
      dueDate: dueDateFor(dob, dose.age),
      ageLabel: dose.ageLabel,
    }))
    .filter((p) => !have.has(p.scheduleKey));
}

const STATUS_ORDER: Record<VaccineStatus, number> = { overdue: 0, due: 1, upcoming: 2, undated: 3, given: 4 };

/** Overdue first, then by due date; given ones last, newest first. */
export function sortVaccinations<T extends Pick<Vaccination, 'dueDate' | 'givenDate' | 'name'>>(list: T[], today: string) {
  return [...list].sort((a, b) => {
    const sa = vaccineStatus(a, today);
    const sb = vaccineStatus(b, today);
    if (sa !== sb) return STATUS_ORDER[sa] - STATUS_ORDER[sb];
    if (sa === 'given') return (b.givenDate ?? '').localeCompare(a.givenDate ?? '');
    return (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.name.localeCompare(b.name);
  });
}

export function vaccineSummary(list: Pick<Vaccination, 'dueDate' | 'givenDate'>[], today: string) {
  const counts = { given: 0, overdue: 0, due: 0, upcoming: 0, undated: 0 };
  for (const v of list) counts[vaccineStatus(v, today)]++;
  return { ...counts, total: list.length };
}

export const STATUS_STYLE: Record<VaccineStatus, { label: string; color: string; bg: string }> = {
  overdue: {
    get label() {
      return t('Overdue');
    },
    color: '#9A3412',
    bg: '#FFEDD5',
  },
  due: {
    get label() {
      return t('Due soon');
    },
    color: '#1E40AF',
    bg: '#DBEAFE',
  },
  upcoming: {
    get label() {
      return t('Upcoming');
    },
    color: '#475569',
    bg: '#F1F5F9',
  },
  undated: {
    get label() {
      return t('No date');
    },
    color: '#475569',
    bg: '#F1F5F9',
  },
  given: {
    get label() {
      return t('Given');
    },
    color: '#166534',
    bg: '#DCFCE7',
  },
};

function daysFromToday(date: string, today: string) {
  return Math.round((dateToMs(date) - dateToMs(today)) / 86400000);
}

export function vaccineDetail(v: Pick<Vaccination, 'dueDate' | 'givenDate' | 'facility'>, today: string) {
  const status = vaccineStatus(v, today);
  if (status === 'given') return `${t('Given {date}', { date: formatDate(v.givenDate) })}${v.facility ? ` · ${v.facility}` : ''}`;
  if (status === 'undated') return t('No due date set');
  const days = daysFromToday(v.dueDate!, today);
  if (status === 'overdue')
    return tn(-days, 'Was due {date} ({n} day ago)', 'Was due {date} ({n} days ago)').replace('{date}', formatDate(v.dueDate));
  if (days === 0) return t('Due {date} (today)', { date: formatDate(v.dueDate) });
  return tn(days, 'Due {date} (in {n} day)', 'Due {date} (in {n} days)').replace('{date}', formatDate(v.dueDate));
}
