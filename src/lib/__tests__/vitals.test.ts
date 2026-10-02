/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkVital, formatVital, latestByType, measuredMs, nowMeasuredAt, rangeText, typicalRange, vitalStatus } from '../vitalsAnalysis';

const bp = (value: number, value2: number) => ({ type: 'bp' as const, value, value2, context: '' });

test('blood pressure status uses both numbers', () => {
  assert.equal(vitalStatus(bp(118, 76)), 'in');
  assert.equal(vitalStatus(bp(132, 78)), 'above');
  assert.equal(vitalStatus(bp(115, 88)), 'above');
  assert.equal(vitalStatus(bp(85, 55)), 'below');
  // A high top number outweighs a low bottom number.
  assert.equal(vitalStatus(bp(135, 55)), 'above');
});

test('blood sugar range depends on when it was taken', () => {
  assert.deepEqual(typicalRange('sugar', 'fasting'), { low: 70, high: 100 });
  assert.deepEqual(typicalRange('sugar', 'after_meal'), { low: 70, high: 140 });
  assert.equal(vitalStatus({ type: 'sugar', value: 120, value2: null, context: 'fasting' }), 'above');
  assert.equal(vitalStatus({ type: 'sugar', value: 120, value2: null, context: 'after_meal' }), 'in');
  assert.equal(vitalStatus({ type: 'sugar', value: 60, value2: null, context: 'random' }), 'below');
});

test('one-sided and missing ranges', () => {
  assert.equal(vitalStatus({ type: 'spo2', value: 99, value2: null, context: '' }), 'in');
  assert.equal(vitalStatus({ type: 'spo2', value: 92, value2: null, context: '' }), 'below');
  assert.equal(vitalStatus({ type: 'weight', value: 72, value2: null, context: '' }), 'none');
  assert.equal(rangeText('spo2'), 'Typical: 95 % or more');
  assert.equal(rangeText('weight'), '');
  assert.equal(rangeText('temp'), 'Typical: 97–99 °F');
});

test('formatVital rounds to the vital’s precision', () => {
  assert.equal(formatVital(bp(132.4, 86)), '132/86');
  assert.equal(formatVital({ type: 'weight', value: 74.25, value2: null }), '74.3');
  assert.equal(formatVital({ type: 'weight', value: 74, value2: null }), '74');
  assert.equal(formatVital({ type: 'temp', value: 98.6, value2: null }), '98.6');
});

test('checkVital catches typos and swapped BP numbers', () => {
  assert.equal(checkVital('bp', 120, 80), null);
  assert.match(checkVital('bp', null, 80)!, /top/);
  assert.match(checkVital('bp', 120, null)!, /bottom/);
  assert.match(checkVital('bp', 80, 120)!, /higher/);
  assert.match(checkVital('bp', 1200, 80)!, /typo/);
  assert.match(checkVital('pulse', 7, null)!, /between/);
  assert.equal(checkVital('temp', 101.2, null), null);
});

test('latestByType picks the newest reading of each type', () => {
  const list = [
    { id: 'a', type: 'bp' as const, measuredAt: '2026-09-01T08:00' },
    { id: 'b', type: 'bp' as const, measuredAt: '2026-09-03T08:00' },
    { id: 'c', type: 'weight' as const, measuredAt: '2026-08-01T07:00' },
    { id: 'd', type: 'bp' as const, measuredAt: '2026-09-02T21:00' },
  ];
  const latest = latestByType(list);
  assert.equal(latest.get('bp')?.id, 'b');
  assert.equal(latest.get('weight')?.id, 'c');
  assert.equal(latest.get('sugar'), undefined);
});

test('measuredAt round-trips through local time', () => {
  const d = new Date(2026, 9, 2, 8, 5);
  assert.equal(nowMeasuredAt(d), '2026-10-02T08:05');
  assert.equal(measuredMs('2026-10-02T08:05'), d.getTime());
  assert.ok(measuredMs('2026-10-02T08:05') < measuredMs('2026-10-02T21:00'));
});
