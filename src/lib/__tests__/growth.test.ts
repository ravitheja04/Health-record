/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ageDays, ageText, ageTicks, growthSeries, growthStatus, percentileText, referenceCurves, sexFor } from '../growth';
import type { Vital, VitalType } from '../types';

const v = (type: VitalType, measuredAt: string, value: number): Vital => ({
  id: `${type}-${measuredAt}`,
  memberId: 'kid',
  type,
  value,
  value2: null,
  context: '',
  measuredAt,
  notes: '',
  createdAt: measuredAt,
  updatedAt: measuredAt,
});

test('WHO reference lines match the published charts', () => {
  const [m3, m2, median, p2, p3] = referenceCurves('weight', 'male', 365).map((c) => c.points[0].value);
  // WHO weight-for-age, boys, at birth: -3 SD 2.1, -2 SD 2.5, median 3.3, +2 SD 4.4, +3 SD 5.0 kg.
  assert.deepEqual([m3, m2, median, p2, p3].map((x) => Math.round(x * 10) / 10), [2.1, 2.5, 3.3, 4.4, 5.0]);
  const girlsLength = referenceCurves('height', 'female', 30).find((c) => c.z === 0)!.points[0].value;
  assert.equal(Math.round(girlsLength * 10) / 10, 49.1);
});

test('a measurement on the median is the 50th percentile', () => {
  const series = growthSeries('weight', [v('weight', '2025-03-10T09:00', 9.646)], '2024-03-10', 'male');
  assert.equal(series[0].days, 365);
  assert.ok(Math.abs(series[0].z!) < 0.01);
  assert.equal(Math.round(series[0].percentile!), 50);
  assert.equal(growthStatus(series[0].z), 'usual');
});

test('outside the usual range, and past 5 years', () => {
  const low = growthSeries('weight', [v('weight', '2024-03-10T09:00', 2.3)], '2024-03-10', 'male')[0];
  assert.equal(growthStatus(low.z), 'below');
  const older = growthSeries('height', [v('height', '2031-01-01T09:00', 120)], '2024-03-10', 'female')[0];
  assert.equal(older.z, null);
  assert.equal(growthStatus(older.z), 'none');
  const unknownSex = growthSeries('height', [v('height', '2025-01-01T09:00', 70)], '2024-03-10', null)[0];
  assert.equal(unknownSex.percentile, null);
});

test('BMI pairs each weight with a recent height', () => {
  const series = growthSeries(
    'bmi',
    [v('height', '2025-03-01T09:00', 75), v('weight', '2025-03-10T09:00', 9.6), v('weight', '2025-06-20T09:00', 10.5)],
    '2024-03-10',
    'female'
  );
  assert.equal(series.length, 1); // the June weight has no height within 30 days
  assert.equal(series[0].value, 17.1); // 9.6 / 0.75²
  assert.notEqual(series[0].percentile, null);
});

test('ages, sex and wording', () => {
  assert.equal(ageDays('2024-03-10', '2024-03-10T08:00'), 0);
  assert.equal(ageDays('2024-02-28', '2024-03-01'), 2); // leap year
  assert.equal(ageText(5), '5 days');
  assert.equal(ageText(40), '6 weeks');
  assert.equal(ageText(200), '6 months');
  assert.equal(ageText(800), '2 y 2 m');
  assert.equal(ageText(1100), '3 years');
  assert.equal(sexFor('Female'), 'female');
  assert.equal(sexFor('Other'), null);
  assert.equal(percentileText(42.3), '42nd percentile');
  assert.equal(percentileText(11), '11th percentile');
  assert.equal(percentileText(3.2), '3rd percentile');
  assert.equal(percentileText(0.4), '<1 percentile');
});

test('chart age ticks sit on whole weeks, months or years', () => {
  assert.deepEqual(ageTicks(0, 930).map((t) => t.label), ['0y', '6m', '1y', '18m', '2y', '30m']);
  assert.deepEqual(ageTicks(0, 60).map((t) => t.label), ['0w', '2w', '4w', '6w', '8w']);
  assert.deepEqual(ageTicks(0, 1856).map((t) => t.label), ['0y', '1y', '2y', '3y', '4y', '5y']);
  for (const t of ageTicks(0, 400)) assert.equal(t.days % 30.4375 < 1e-9 || Math.abs((t.days % 30.4375) - 30.4375) < 1e-9, true);
});
