/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import te from '../../i18n/te';
import type { LabPoint } from '../labAnalysis';
import { LAB_TESTS } from '../labTests';
import { aboutTest, buildSmartReport, rangeBar } from '../smartReport';

let n = 0;
const mk = (o: Partial<LabPoint>): LabPoint => ({
  id: `p${n++}`,
  recordId: 'r1',
  testKey: 'hba1c',
  testName: 'HbA1c',
  value: 7,
  unit: '%',
  refLow: null,
  refHigh: 5.7,
  createdAt: '2026-01-01T00:00:00Z',
  date: '2025-01-10',
  recordTitle: 'Apollo',
  ...o,
});

test('consolidates every report into columns and body-system panels', () => {
  const points = [
    mk({ recordId: 'r2', date: '2025-06-01', recordTitle: '1mg', value: 6.4 }),
    mk({ recordId: 'r1', date: '2025-01-10', value: 7.2 }),
    mk({ recordId: 'r1', date: '2025-01-10', testKey: 'tsh', testName: 'TSH', value: 2.1, unit: 'µIU/mL', refLow: 0.4, refHigh: 4 }),
    mk({ recordId: 'r3', date: '2026-02-01', recordTitle: 'Apollo', value: 5.9 }),
    mk({ recordId: 'r3', date: '2026-02-01', testKey: 'custom:homocysteine', testName: 'Homocysteine', value: 12, unit: 'µmol/L', refLow: null, refHigh: null }),
  ];
  const r = buildSmartReport(points);
  assert.deepEqual(
    r.columns.map((c) => c.recordId),
    ['r1', 'r2', 'r3']
  );
  assert.equal(r.firstDate, '2025-01-10');
  assert.equal(r.latestDate, '2026-02-01');
  assert.equal(r.testCount, 3);
  assert.equal(r.outOfRange, 1);
  assert.deepEqual(
    r.panels.map((p) => p.key),
    ['diabetes', 'thyroid', 'other']
  );
  const diabetes = r.panels[0];
  assert.equal(diabetes.outOfRange, 1);
  const hba1c = diabetes.tests[0];
  assert.equal(hba1c.first.value, 7.2);
  assert.equal(hba1c.latest.value, 5.9);
  assert.equal(hba1c.overall.kind, 'toward');
  assert.ok(Math.abs((hba1c.overall.delta ?? 0) + 1.3) < 1e-9);
  assert.equal(hba1c.byRecord.r2.value, 6.4);
  assert.equal(r.panels[1].inRange, 1);
  assert.equal(r.panels[1].tests[0].overall.kind, 'unknown');
  assert.equal(r.panels[2].noRange, 1);
  assert.equal(r.panels[2].tests[0].bar, null);
});

test('range bar puts the normal range in the middle and pins far values', () => {
  const both = rangeBar(85, 70, 100)!;
  assert.equal(both.low, 0.25);
  assert.equal(both.high, 0.75);
  assert.equal(both.value, 0.5);
  assert.equal(rangeBar(500, 70, 100)!.value, 0.97);
  const upper = rangeBar(5.7, null, 5.7)!;
  assert.equal(upper.low, 0);
  assert.ok(Math.abs(upper.high - 2 / 3) < 1e-9);
  const lower = rangeBar(30, 30, null)!;
  assert.equal(lower.low, 0.5);
  assert.equal(lower.high, 1);
  assert.equal(rangeBar(5, null, null), null);
});

test('every catalog test has a plain explanation, translated to Telugu', () => {
  for (const def of LAB_TESTS) {
    const text = aboutTest(def.key, true);
    assert.ok(text, def.key);
    assert.ok(text in te, text);
  }
  assert.equal(aboutTest('custom:foo'), null);
});
