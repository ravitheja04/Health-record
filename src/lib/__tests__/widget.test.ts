/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DoseLog, Medication } from '../types';
import { rowsForHeight, widgetModel } from '../../widget/widgetData';

const med = (id: string, name: string, times: string[], memberName = 'Ravi Kumar'): Medication & { memberName: string } => ({
  id,
  memberId: 'm1',
  memberName,
  name,
  dose: '500 mg',
  instructions: '',
  times,
  frequency: 'daily',
  days: [],
  startDate: '2026-01-01',
  endDate: null,
  stock: null,
  perDose: 1,
  remindersOn: true,
  notes: '',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
});
const log = (medicationId: string, time: string, status: 'taken' | 'skipped'): DoseLog => ({
  id: `${medicationId}${time}`,
  medicationId,
  date: '2026-10-02',
  time,
  status,
  loggedAt: '2026-10-02T08:00:00Z',
});

const meds = [med('a', 'Metformin', ['08:00', '20:00']), med('b', 'Thyroxine', ['07:00'], 'Amma'), med('c', 'Vitamin D', ['13:00'])];

test('late and due doses come first, then taken ones', () => {
  const m = widgetModel({ locked: false, meds, logs: [log('b', '07:00', 'taken')], today: '2026-10-02', now: '12:00', maxRows: 5 });
  assert.equal(m.kind, 'doses');
  if (m.kind !== 'doses') return;
  assert.deepEqual(
    m.doses.map((d) => [d.time, d.status]),
    [['08:00', 'late'], ['13:00', 'due'], ['20:00', 'due'], ['07:00', 'taken']]
  );
  assert.equal(m.doses[0].title, 'Ravi · Metformin 500 mg');
  assert.equal(m.doses[3].title, 'Amma · Thyroxine 500 mg');
  assert.deepEqual([m.taken, m.total, m.allDone, m.more], [1, 4, false, 0]);
});

test('a dose is only late 30 minutes after its time', () => {
  const m = widgetModel({ locked: false, meds: [meds[0]], logs: [], today: '2026-10-02', now: '08:25', maxRows: 5 });
  assert.equal(m.kind === 'doses' && m.doses[0].status, 'due');
});

test('limits rows, counts the rest, and knows when everything is done', () => {
  const two = widgetModel({ locked: false, meds, logs: [], today: '2026-10-02', now: '06:00', maxRows: 2 });
  assert.equal(two.kind === 'doses' && two.more, 2);
  const done = widgetModel({
    locked: false,
    meds: [meds[1]],
    logs: [log('b', '07:00', 'skipped')],
    today: '2026-10-02',
    now: '22:00',
    maxRows: 3,
  });
  assert.equal(done.kind === 'doses' && done.allDone, true);
});

test('app lock hides everything; no medicines shows an empty state', () => {
  assert.deepEqual(widgetModel({ locked: true, meds, logs: [], today: '2026-10-02', now: '12:00', maxRows: 5 }), { kind: 'locked' });
  assert.deepEqual(widgetModel({ locked: false, meds: [], logs: [], today: '2026-10-02', now: '12:00', maxRows: 5 }), { kind: 'empty' });
});

test('rows that fit the widget height', () => {
  assert.equal(rowsForHeight(110), 1);
  assert.equal(rowsForHeight(200), 4);
  assert.equal(rowsForHeight(2000), 8);
});
