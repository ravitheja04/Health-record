/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSeries, changeBetween, formatDelta, formatRange, formatValue, parseNumber, statusOf, summarize, testCadence, type LabPoint } from '../labAnalysis';
import { keyForName, matchTest } from '../labTests';

const mk = (o: Partial<LabPoint>): LabPoint => ({ id: Math.random().toString(), recordId: 'r', testKey: 'hba1c', testName: 'HbA1c', value: 7, unit: '%', refLow: null, refHigh: 5.7, createdAt: '2026-01-01T00:00:00Z', date: '2026-01-01', recordTitle: 't', ...o });

test('status of a value against the report range', () => {
  assert.equal(statusOf(7.1, null, 5.7), 'high');
  assert.equal(statusOf(30, 30, 100), 'normal');
  assert.equal(statusOf(28, 30, 100), 'low');
  assert.equal(statusOf(5, null, null), 'unknown');
});

test('change toward or away from the range', () => {
  // HbA1c 7.3 -> 7.1, range below 5.7: moved toward range
  assert.deepEqual(changeBetween(mk({ value: 7.3 }), mk({ value: 7.1 })).kind, 'toward');
  // HDL 40 -> 44 with range above 40: both in range -> same
  assert.equal(changeBetween(mk({ value: 40, refLow: 40, refHigh: null }), mk({ value: 44, refLow: 40, refHigh: null })).kind, 'same');
  // HDL 38 -> 36: away
  assert.equal(changeBetween(mk({ value: 38, refLow: 40, refHigh: null }), mk({ value: 36, refLow: 40, refHigh: null })).kind, 'away');
  // unit change
  assert.equal(changeBetween(mk({ unit: 'mg/dL' }), mk({ unit: 'mmol/L' })).unitChanged, true);
  // no range
  assert.equal(changeBetween(mk({ value: 1, refHigh: null }), mk({ value: 2, refHigh: null })).kind, 'unknown');
  assert.equal(changeBetween(null, mk({})).delta, null);
});

test('formatting and parsing numbers', () => {
  assert.equal(formatValue(7.1), '7.1');
  assert.equal(formatValue(124), '124');
  assert.equal(formatValue(0.456), '0.46');
  assert.equal(formatValue(148.4), '148');
  assert.equal(formatRange(null, 5.7, '%'), 'below 5.7 %');
  assert.equal(formatRange(70, 100), '70–100');
  assert.equal(formatDelta(-0.2000000001), '▼ 0.2');
  assert.equal(formatDelta(0), 'No change');
  assert.equal(parseNumber('7,1'), 7.1);
  assert.equal(parseNumber(' 124 '), 124);
  assert.equal(parseNumber('.5'), 0.5);
  assert.equal(parseNumber('<0.5'), null);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber(''), null);
});

test('series, summary and test cadence', () => {
  const pts = [
    mk({ date: '2024-03-10', value: 7.8, recordId: 'a' }),
    mk({ date: '2024-09-12', value: 7.4, recordId: 'b' }),
    mk({ date: '2025-03-08', value: 7.2, recordId: 'c' }),
    mk({ date: '2025-09-20', value: 6.9, recordId: 'd' }),
    mk({ date: '2026-03-14', value: 7.3, recordId: 'e' }),
    mk({ date: '2026-09-12', value: 7.1, recordId: 'f' }),
    mk({ date: '2026-09-12', value: 112, recordId: 'f', testKey: 'ldl', testName: 'LDL', unit: 'mg/dL', refHigh: 100 }),
    mk({ date: '2026-03-14', value: 135, recordId: 'e', testKey: 'ldl', testName: 'LDL', unit: 'mg/dL', refHigh: 100 }),
  ];
  const series = buildSeries(pts);
  assert.equal(series.length, 2);
  assert.equal(series[0].testKey, 'hba1c'); // diabetes panel before lipid
  assert.equal(series[0].latest.value, 7.1);
  assert.equal(series[0].previous?.value, 7.3);
  assert.equal(series[1].points[0].value, 135); // sorted by date
  const sum = summarize(series, pts);
  assert.deepEqual([sum.testsTracked, sum.outOfRange, sum.movedToward, sum.reportCount, sum.latestDate, sum.firstDate], [2, 2, 2, 6, '2026-09-12', '2024-03-10']);
  const cad = testCadence(series[0].points)!;
  assert.equal(cad.months, 6);
  assert.ok(cad.nextDate.startsWith('2027-03'), cad.nextDate);
  assert.equal(testCadence([mk({})]), null);
});

test('matching test names to the catalog', () => {
  assert.equal(matchTest('Glycosylated Haemoglobin')?.key, 'hba1c');
  assert.equal(matchTest('FBS')?.key, 'glucose_fasting');
  assert.equal(keyForName('S. Creatinine'), 'creatinine');
  assert.equal(keyForName('Homocysteine'), 'custom:homocysteine');
});
