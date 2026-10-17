// Run: node --import ./tests/unit/resolve-ts.mjs --test tests/unit/appointment-request.test.ts
// (under TZ=Asia/Manila and TZ=UTC: the answers must not change)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REQUEST_COLORS, REQUEST_ICONS, REQUEST_TYPES,
  buildRequestDoc, formatSlot, fromSlots, halfHourSlots, toSlots, validateRequestForm,
} from '../../src/app/shared/appointment-request.ts';
import type { RequestForm } from '../../src/app/shared/appointment-request.ts';

const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0);
const now = local(2026, 10, 17, 10, 15);
const form = (over: Partial<RequestForm> = {}): RequestForm => ({
  type: 'Prenatal Checkup',
  options: [{ date: '2026-10-20', from: '09:00', to: '10:30' }],
  reason: 'Routine checkup',
  notes: '',
  icon: '🩺',
  accentColor: 'purple',
  ...over,
});

test('half-hour slots from 07:00 to 19:00; end times after the start', () => {
  const all = halfHourSlots();
  assert.equal(all[0], '07:00');
  assert.equal(all.at(-1), '19:00');
  assert.ok(all.every(t => /^\d\d:(00|30)$/.test(t)));
  assert.equal(fromSlots().at(-1), '18:30');
  assert.deepEqual(toSlots('18:00'), ['18:30', '19:00']);
  assert.ok(toSlots('09:00').every(t => t > '09:00'));
  assert.equal(formatSlot('13:30'), '1:30 PM');
  assert.equal(formatSlot('07:00'), '7:00 AM');
  assert.equal(formatSlot('12:00'), '12:00 PM');
});

test('a complete form is valid', () => {
  assert.deepEqual(validateRequestForm(form(), now), {});
});

test('every required field is checked', () => {
  const e = validateRequestForm(form({
    type: '', reason: '   ', icon: '🚀', accentColor: 'red',
    options: [{ date: '', from: '', to: '' }],
  }), now);
  assert.deepEqual(Object.keys(e).sort(), ['accentColor', 'icon', 'option0', 'reason', 'type']);
});

test('dates and times: no past day, no passed time today, end after start', () => {
  const opt = (date: string, from: string, to: string) => validateRequestForm(form({ options: [{ date, from, to }] }), now).option0;
  assert.ok(opt('2026-10-16', '09:00', '10:00'));          // yesterday
  assert.ok(opt('2026-10-17', '10:00', '11:00'));          // today, already passed
  assert.equal(opt('2026-10-17', '10:30', '11:00'), undefined); // today, still ahead
  assert.ok(opt('2026-10-20', '10:00', '10:00'));          // end = start
  assert.ok(opt('2026-10-20', '10:00', '09:30'));          // end before start
  assert.ok(opt('2026-10-20', '09:15', '10:00'));          // not a half hour
  assert.ok(opt('2026-10-20', '06:30', '07:00'));          // outside the offered times
});

test('the second option is optional, but must be complete once started', () => {
  const first = { date: '2026-10-20', from: '09:00', to: '10:30' };
  assert.deepEqual(validateRequestForm(form({ options: [first, { date: '', from: '', to: '' }] }), now), {});
  assert.ok(validateRequestForm(form({ options: [first, { date: '2026-10-21', from: '', to: '' }] }), now).option1);
  assert.deepEqual(validateRequestForm(form({ options: [first, { date: '2026-10-21', from: '14:00', to: '14:30' }] }), now), {});
});

test('reason and notes limits (after trimming)', () => {
  assert.ok(validateRequestForm(form({ reason: 'x'.repeat(301) }), now).reason);
  assert.equal(validateRequestForm(form({ reason: ' ' + 'x'.repeat(300) + ' ' }), now).reason, undefined);
  assert.ok(validateRequestForm(form({ notes: 'x'.repeat(501) }), now).notes);
});

test('the written document has exactly the allowed fields', () => {
  const d = buildRequestDoc('uid1', form({
    reason: '  Check  ', notes: '  ',
    options: [{ date: '2026-10-20', from: '09:00', to: '10:30' }, { date: '', from: '', to: '' }],
  }));
  assert.deepEqual(d, {
    userId: 'uid1', type: 'Prenatal Checkup',
    options: [{ date: '2026-10-20', from: '09:00', to: '10:30' }],
    reason: 'Check', icon: '🩺', accentColor: 'purple', status: 'pending',
  });
  assert.equal(buildRequestDoc('uid1', form({ notes: ' Mornings ' })).notes, 'Mornings');
});

test('the app lists match firestore.rules exactly', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const listAfter = (marker: string) => {
    const start = rules.indexOf('[', rules.indexOf(marker));
    const body = rules.slice(start + 1, rules.indexOf(']', start));
    return [...body.matchAll(/'([^']*)'/g)].map(m => m[1]);
  };
  assert.deepEqual(listAfter('d.type in'), [...REQUEST_TYPES]);
  assert.deepEqual(listAfter('d.icon in'), REQUEST_ICONS.map(i => i.value));
  assert.deepEqual(listAfter('d.accentColor in'), [...REQUEST_COLORS]);
});
