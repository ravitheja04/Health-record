/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addDays,
  daysOfSupply,
  dosesOn,
  formatTime,
  isDueOn,
  needsRefill,
  nextDose,
  scheduleText,
  slotOf,
  stockChange,
  weekdayOf,
} from '../medSchedule';
import type { DoseLog, Medication } from '../types';

const med = (o: Partial<Medication>): Medication => ({
  id: 'm1',
  memberId: 'p1',
  name: 'Metformin',
  dose: '500 mg',
  instructions: 'After food',
  times: ['08:00', '21:00'],
  frequency: 'daily',
  days: [],
  startDate: '2026-09-01',
  endDate: null,
  stock: null,
  perDose: 1,
  remindersOn: true,
  notes: '',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...o,
});

test('dates and weekdays', () => {
  assert.equal(weekdayOf('2026-10-01'), 4); // a Thursday
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
});

test('which days a medicine is due', () => {
  assert.equal(isDueOn(med({}), '2026-10-01'), true);
  assert.equal(isDueOn(med({}), '2026-08-31'), false); // before start
  assert.equal(isDueOn(med({ endDate: '2026-10-01' }), '2026-10-01'), true); // last day included
  assert.equal(isDueOn(med({ endDate: '2026-10-01' }), '2026-10-02'), false);
  assert.equal(isDueOn(med({ frequency: 'weekly', days: [3] }), '2026-09-30'), true); // Wednesday
  assert.equal(isDueOn(med({ frequency: 'weekly', days: [3] }), '2026-10-01'), false);
  assert.equal(isDueOn(med({ times: [] }), '2026-10-01'), false);
});

test("today's doses are listed in time order with their status", () => {
  const a = med({ id: 'a', name: 'Atorvastatin', times: ['21:00'] });
  const b = med({ id: 'b', name: 'Metformin', times: ['08:00', '21:00'] });
  const logs: DoseLog[] = [
    { id: 'l1', medicationId: 'b', date: '2026-10-01', time: '08:00', status: 'taken', loggedAt: '' },
    { id: 'l2', medicationId: 'b', date: '2026-09-30', time: '21:00', status: 'taken', loggedAt: '' },
  ];
  const doses = dosesOn([b, a], logs, '2026-10-01');
  assert.deepEqual(
    doses.map((d) => [d.med.id, d.time, d.status]),
    [
      ['b', '08:00', 'taken'],
      ['a', '21:00', 'pending'],
      ['b', '21:00', 'pending'],
    ]
  );
  assert.equal(nextDose(doses, '12:00')?.med.id, 'a');
  assert.equal(nextDose(doses, '22:00'), null);
});

test('stock, days of supply and refill warning', () => {
  assert.equal(daysOfSupply(med({ stock: null })), null);
  assert.equal(daysOfSupply(med({ stock: 20 })), 10); // 2 a day
  assert.equal(daysOfSupply(med({ stock: 20, perDose: 2 })), 5);
  assert.equal(daysOfSupply(med({ stock: 4, frequency: 'weekly', days: [3], times: ['08:00'] })), 28);
  assert.equal(needsRefill(med({ stock: 10 }), '2026-10-01'), true); // 5 days
  assert.equal(needsRefill(med({ stock: 12 }), '2026-10-01'), false); // 6 days
  assert.equal(needsRefill(med({ stock: 2, endDate: '2026-09-01' }), '2026-10-01'), false); // stopped
  assert.equal(stockChange('pending', 'taken', 1), -1);
  assert.equal(stockChange('taken', 'pending', 2), 2);
  assert.equal(stockChange('taken', 'skipped', 1), 1);
  assert.equal(stockChange('skipped', 'pending', 1), 0);
});

test('times and schedule text', () => {
  assert.equal(formatTime('08:00'), '8:00 AM');
  assert.equal(formatTime('00:30'), '12:30 AM');
  assert.equal(formatTime('12:05'), '12:05 PM');
  assert.equal(formatTime('21:00'), '9:00 PM');
  assert.equal(slotOf('08:00'), 'morning');
  assert.equal(slotOf('14:00'), 'afternoon');
  assert.equal(slotOf('18:30'), 'evening');
  assert.equal(slotOf('22:00'), 'night');
  assert.equal(slotOf('02:00'), 'night');
  assert.equal(scheduleText(med({})), 'Every day · 8:00 AM, 9:00 PM');
  assert.equal(scheduleText(med({ frequency: 'weekly', days: [0, 3], times: ['08:00'] })), 'Wed, Sun · 8:00 AM');
});
