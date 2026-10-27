import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftWeek, weekDates, weekId, weekLabel, weekMonth } from '../js/dates.js';

test('weekId follows ISO 8601', () => {
  assert.equal(weekId(new Date(2026, 9, 27)), '2026-W44');
  assert.equal(weekId(new Date(2021, 0, 3)), '2020-W53');
  assert.equal(weekId(new Date(2024, 11, 30)), '2025-W01');
  assert.equal(weekId(new Date(2026, 0, 1)), '2026-W01');
});

test('weekDates starts on Monday', () => {
  const dates = weekDates('2026-W44');
  assert.equal(dates[0].toISOString().slice(0, 10), '2026-10-26');
  assert.equal(dates[6].toISOString().slice(0, 10), '2026-11-01');
  assert.equal(weekLabel('2026-W44'), '26 oct. – 1 nov.');
});

test('shiftWeek crosses years', () => {
  assert.equal(shiftWeek('2026-W53', 1), '2027-W01');
  assert.equal(shiftWeek('2027-W01', -1), '2026-W53');
  assert.equal(shiftWeek('2026-W44', 10), '2027-W01');
});

test('weekMonth uses the Thursday of the week', () => {
  assert.equal(weekMonth('2026-W44'), 10);
  assert.equal(weekMonth('2026-W45'), 11);
});
