// Run: node --test tests/unit/appointment-status.test.ts
// The app reads appointment times in the phone's own time zone, so these
// tests build "now" in local time too; they give the same answers under
// TZ=Asia/Manila and TZ=UTC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSED_AFTER_MS, isMissedAppointment } from '../../src/app/shared/appointment-status.ts';

const local = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi, 0, 0);
const appt = (date: string, time: string, status = 'upcoming') => ({ date, time, status });

test('threshold is 3 hours', () => {
  assert.equal(MISSED_AFTER_MS, 3 * 60 * 60 * 1000);
});

test('2h59m after start: not missed', () => {
  assert.equal(isMissedAppointment(appt('2026-10-14', '9:00 AM'), local(2026, 10, 14, 11, 59)), false);
});

test('3h00m after start: missed', () => {
  assert.equal(isMissedAppointment(appt('2026-10-14', '9:00 AM'), local(2026, 10, 14, 12, 0)), true);
});

test('30 minutes after start: no longer missed (old rule)', () => {
  assert.equal(isMissedAppointment(appt('2026-10-14', '9:00 AM'), local(2026, 10, 14, 9, 31)), false);
});

test('across midnight: 11:00 PM start is missed at 2:00 AM next day', () => {
  const late = appt('2026-10-14', '11:00 PM');
  assert.equal(isMissedAppointment(late, local(2026, 10, 15, 1, 59)), false);
  assert.equal(isMissedAppointment(late, local(2026, 10, 15, 2, 0)), true);
});

test('cancelled and completed are never missed; stored missed stays missed', () => {
  const later = local(2026, 10, 20, 0, 0);
  assert.equal(isMissedAppointment(appt('2026-10-14', '9:00 AM', 'cancelled'), later), false);
  assert.equal(isMissedAppointment(appt('2026-10-14', '9:00 AM', 'completed'), later), false);
  assert.equal(isMissedAppointment(appt('2026-10-14', '9:00 AM', 'missed'), local(2026, 10, 14, 9, 1)), true);
});

test('unreadable time: missed only once its day has passed', () => {
  const noTime = appt('2026-10-14', '');
  assert.equal(isMissedAppointment(noTime, local(2026, 10, 14, 23, 59)), false);
  assert.equal(isMissedAppointment(noTime, local(2026, 10, 15, 0, 0)), true);
});
