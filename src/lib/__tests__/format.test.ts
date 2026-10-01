/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dateToIso, formatDate, indianToIso, isoToDate, isoToIndian, maskIndianDate } from '../format';

test('ISO dates show in Indian day-first format', () => {
  assert.equal(isoToIndian('1988-04-23'), '23/04/1988');
  assert.equal(isoToIndian(null), '');
  assert.equal(isoToIndian('23/04/19'), '23/04/19'); // partial text passes through while typing
  assert.equal(formatDate('2026-09-12'), '12 Sep 2026');
});

test('typed Indian dates convert to ISO only when they are real dates', () => {
  assert.equal(indianToIso('23/04/1988'), '1988-04-23');
  assert.equal(indianToIso('3/4/1988'), '1988-04-03');
  assert.equal(indianToIso('23-04-1988'), '1988-04-23');
  assert.equal(indianToIso('31/02/2024'), null);
  assert.equal(indianToIso('29/02/2024'), '2024-02-29');
  assert.equal(indianToIso('29/02/2023'), null);
  assert.equal(indianToIso('23/04/88'), null);
});

test('slashes are inserted while typing digits', () => {
  assert.equal(maskIndianDate('2'), '2');
  assert.equal(maskIndianDate('23'), '23');
  assert.equal(maskIndianDate('230'), '23/0');
  assert.equal(maskIndianDate('23041988'), '23/04/1988');
  assert.equal(maskIndianDate('23/04/1988'), '23/04/1988');
  assert.equal(maskIndianDate('23/04/19889'), '23/04/1988');
  assert.equal(maskIndianDate('23/'), '23'); // backspace past a slash just works
});

test('picker dates round-trip without timezone drift', () => {
  assert.equal(dateToIso(isoToDate('2026-01-31')), '2026-01-31');
  assert.equal(dateToIso(new Date(1988, 3, 23)), '1988-04-23');
});
