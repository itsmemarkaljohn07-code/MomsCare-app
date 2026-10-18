// Run: node --import ./tests/unit/resolve-ts.mjs --test tests/unit/pregnancy-status.test.ts
// (under TZ=Asia/Manila and TZ=UTC: the answers must not change)
// Dates are built in local time, as the phone does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pastDueLabel, pregnancyStatus } from '../../src/app/shared/pregnancy-status.ts';
import { parseStoredDate } from '../../src/app/shared/date-utils.ts';

const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0);
const due = local(2026, 10, 15); // due 15 Oct 2026

test('due date 3 days ago: 3 days past due, week stays 40', () => {
  for (const h of [0, 8, 23]) {
    const s = pregnancyStatus(due, local(2026, 10, 18, h, 30));
    assert.equal(s.daysPastDue, 3, `at ${h}:30`);
    assert.equal(s.week, 40);
    assert.equal(s.daysUntilDue, 0);
  }
});

test('due date 30 days ago', () => {
  const s = pregnancyStatus(due, local(2026, 11, 14, 12));
  assert.equal(s.daysPastDue, 30);
  assert.equal(s.week, 40);
});

test('due today: not past due, all day', () => {
  for (const h of [0, 9, 23]) assert.equal(pregnancyStatus(due, local(2026, 10, 15, h, 59)).daysPastDue, 0, `at ${h}:59`);
});

test('due tomorrow: not past due, still counting down', () => {
  const s = pregnancyStatus(due, local(2026, 10, 14, 10));
  assert.equal(s.daysPastDue, 0);
  assert.ok(s.daysUntilDue >= 1);
});

test('the day after the due date is 1 day past, from midnight', () => {
  assert.equal(pregnancyStatus(due, local(2026, 10, 16, 0, 0)).daysPastDue, 1);
});

test('a due date saved as an ISO time of day (signup) counts by its local day', () => {
  const stored = parseStoredDate(local(2026, 10, 15, 18, 45).toISOString());
  assert.equal(pregnancyStatus(stored, local(2026, 10, 18, 7)).daysPastDue, 3);
  assert.equal(pregnancyStatus(stored, local(2026, 10, 15, 7)).daysPastDue, 0);
});

test('no or unreadable due date: never past due', () => {
  assert.equal(pregnancyStatus(null).daysPastDue, 0);
  assert.equal(pregnancyStatus(new Date('nope')).daysPastDue, 0);
});

test('pill wording, singular for 1', () => {
  assert.equal(pastDueLabel(1), 'Due 1 day ago');
  assert.equal(pastDueLabel(3), 'Due 3 days ago');
  assert.equal(pastDueLabel(30), 'Due 30 days ago');
});
