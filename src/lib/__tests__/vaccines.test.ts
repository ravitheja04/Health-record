/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addMonths, dueDateFor, planFromSchedule, sortVaccinations, vaccineDetail, vaccineStatus, vaccineSummary } from '../vaccineAnalysis';
import { getSchedule, SCHEDULES } from '../vaccineSchedules';

const today = '2026-10-01';
const v = (dueDate: string | null, givenDate: string | null = null, name = 'X') => ({ dueDate, givenDate, name, facility: '' });

test('month arithmetic stays on real calendar dates', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2026-11-15', 2), '2027-01-15');
  assert.equal(addMonths('2020-02-29', 12), '2021-02-28');
});

test('due dates are counted from the date of birth', () => {
  assert.equal(dueDateFor('2026-01-01', {}), '2026-01-01');
  assert.equal(dueDateFor('2026-01-01', { weeks: 6 }), '2026-02-12');
  assert.equal(dueDateFor('2026-01-01', { months: 9 }), '2026-10-01');
  assert.equal(dueDateFor('2018-03-10', { years: 9, months: 6 }), '2027-09-10');
});

test('status of a vaccination', () => {
  assert.equal(vaccineStatus(v('2026-09-01', '2026-09-02'), today), 'given');
  assert.equal(vaccineStatus(v('2026-09-30'), today), 'overdue');
  assert.equal(vaccineStatus(v('2026-10-01'), today), 'due');
  assert.equal(vaccineStatus(v('2026-10-31'), today), 'due');
  assert.equal(vaccineStatus(v('2026-11-01'), today), 'upcoming');
  assert.equal(vaccineStatus(v(null), today), 'undated');
  assert.equal(vaccineDetail(v('2026-10-15'), today), 'Due 15 Oct 2026 (in 14 days)');
  assert.equal(vaccineDetail(v('2026-09-29'), today), 'Was due 29 Sep 2026 (2 days ago)');
  assert.equal(vaccineDetail(v('2026-10-01'), today), 'Due 1 Oct 2026 (today)');
});

test('overdue first, then by date, given last', () => {
  const list = [v('2026-12-01', null, 'C'), v('2026-08-01', '2026-08-02', 'G'), v('2026-09-01', null, 'A'), v('2026-10-10', null, 'B')];
  assert.deepEqual(sortVaccinations(list, today).map((x) => x.name), ['A', 'B', 'C', 'G']);
  assert.deepEqual(vaccineSummary(list, today), { given: 1, overdue: 1, due: 1, upcoming: 1, undated: 0, total: 4 });
});

test('schedules generate due dates and never add a dose twice', () => {
  for (const s of SCHEDULES) {
    const ids = s.doses.map((d) => d.id);
    assert.equal(new Set(ids).size, ids.length, `${s.key} has duplicate dose ids`);
  }
  const iap = getSchedule('iap')!;
  const plan = planFromSchedule(iap, '2026-01-01', []);
  assert.equal(plan.length, iap.doses.length);
  const mmr1 = plan.find((p) => p.scheduleKey === 'iap:mmr-1')!;
  assert.equal(mmr1.dueDate, '2026-10-01');
  const again = planFromSchedule(iap, '2026-01-01', [{ scheduleKey: 'iap:mmr-1' }, { scheduleKey: 'iap:bcg' }]);
  assert.equal(again.length, iap.doses.length - 2);
});
