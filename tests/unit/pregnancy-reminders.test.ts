// Run: node --import ./tests/unit/resolve-ts.mjs --test tests/unit/pregnancy-reminders.test.ts
// (under TZ=Asia/Manila and TZ=UTC: the answers must not change)
// The pregnancy reminders stop REMINDERS_END_DAYS_AFTER_DUE days after the
// due date, at local midnight. Dates are built in local time, as the phone does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REMINDERS_END_DAYS_AFTER_DUE,
  pregnancyRemindersEndAt,
  pregnancyRemindersEnded,
} from '../../src/app/shared/pregnancy-status.ts';
import { parseStoredDate } from '../../src/app/shared/date-utils.ts';
import { buildReminderPlan } from '../../src/app/services/reminder-plan.ts';
import {
  ALL_UNCHECKED,
  buildChecklistReminderPlan,
  dueChecklistBellSlots,
} from '../../src/app/services/checklist-reminder-plan.ts';

const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0);
const ALL_ON = { weeklyUpdates: true, vitaminReminder: true, kickAlerts: true, hydrationReminders: true, checklistReminders: false };
const due = local(2026, 10, 1); // due 1 Oct 2026, so the end is 15 Oct 00:00

test('the end is 14 days after the due date, at local midnight', () => {
  assert.equal(REMINDERS_END_DAYS_AFTER_DUE, 14);
  assert.equal(pregnancyRemindersEndAt(due)?.getTime(), local(2026, 10, 15).getTime());
  // A due date saved with a time of day still ends at midnight of its day.
  assert.equal(pregnancyRemindersEndAt(local(2026, 10, 1, 18, 30))?.getTime(), local(2026, 10, 15).getTime());
});

test('day 13 after the due date: everything is still scheduled', () => {
  const now = local(2026, 10, 14, 7, 0);
  assert.equal(pregnancyRemindersEnded(due, now), false);
  assert.equal(buildReminderPlan(ALL_ON, '20:00', due, now).length, 6);
  // Nothing from the end onwards: only the rest of day 13.
  const checklist = buildChecklistReminderPlan(now, ALL_UNCHECKED, due);
  assert.ok(checklist.length > 0);
  assert.ok(checklist.every(r => r.at.getTime() < local(2026, 10, 15).getTime()));
  assert.ok(dueChecklistBellSlots(local(2026, 10, 14, 23, 0), ALL_UNCHECKED, true, null, due).length > 0);
});

test('one minute before the end: still on; at the end: off', () => {
  assert.equal(pregnancyRemindersEnded(due, local(2026, 10, 14, 23, 59)), false);
  assert.equal(pregnancyRemindersEnded(due, local(2026, 10, 15, 0, 0)), true);
});

test('day 14 and day 15 after the due date: nothing is scheduled', () => {
  for (const now of [local(2026, 10, 15, 7, 0), local(2026, 10, 16, 7, 0)]) {
    assert.equal(pregnancyRemindersEnded(due, now), true);
    assert.deepEqual(buildReminderPlan(ALL_ON, '20:00', due, now), []);
    assert.deepEqual(buildChecklistReminderPlan(now, ALL_UNCHECKED, due), []);
    assert.deepEqual(dueChecklistBellSlots(local(now.getFullYear(), now.getMonth() + 1, now.getDate(), 23, 0), ALL_UNCHECKED, true, null, due), []);
  }
});

test('a later due date brings the reminders back', () => {
  const now = local(2026, 10, 20, 7, 0);
  assert.deepEqual(buildReminderPlan(ALL_ON, '20:00', due, now), []);
  const later = local(2026, 11, 30);
  assert.equal(buildReminderPlan(ALL_ON, '20:00', later, now).length, 6);
  assert.ok(buildChecklistReminderPlan(now, ALL_UNCHECKED, later).length > 0);
});

test('a missing or unreadable due date never switches reminders off', () => {
  const now = local(2030, 1, 1, 7, 0);
  for (const d of [null, undefined, new Date('not a date'), parseStoredDate(''), parseStoredDate('garbage')]) {
    assert.equal(pregnancyRemindersEnded(d, now), false);
    assert.equal(buildReminderPlan(ALL_ON, '20:00', d, now).length, 6);
    assert.ok(buildChecklistReminderPlan(now, ALL_UNCHECKED, d).length > 0);
  }
  // Old callers that pass no due date at all are unchanged.
  assert.equal(buildReminderPlan(ALL_ON, '20:00').length, 6);
});

test('stored formats: plain yyyy-MM-dd and the ISO timestamp signup saves', () => {
  const now = local(2026, 10, 15, 7, 0);
  assert.equal(pregnancyRemindersEnded(parseStoredDate('2026-10-01'), now), true);
  assert.equal(pregnancyRemindersEnded(parseStoredDate('2026-10-02'), now), false);
  assert.equal(pregnancyRemindersEnded(parseStoredDate(local(2026, 10, 1, 9).toISOString()), now), true);
});
