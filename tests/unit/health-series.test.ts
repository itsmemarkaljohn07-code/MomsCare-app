// Run: node --import ./tests/unit/resolve-ts.mjs --test tests/unit/health-series.test.ts
// (under TZ=Asia/Manila and TZ=UTC: the answers must not change)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths, buildHealthSeries, clinicPoints, latestValues, manilaDay, niceScale, pregnancyWeekOn,
  rangeStart, selfPoints, shortDayLabel, sortPoints, weekLabel,
} from '../../src/app/shared/health-series.ts';
import type { ClinicReadingInput, SelfLogInput } from '../../src/app/shared/health-series.ts';

// Instants written in Manila time (+08:00), so they mean the same thing in every zone.
const at = (iso: string) => new Date(`${iso}+08:00`);
const log = (iso: string, over: Partial<SelfLogInput> = {}): SelfLogInput =>
  ({ loggedAt: at(iso), weight: 62.4, bpSys: 112, bpDia: 72, kicks: 8, mood: 3, ...over });
const clinic = (measuredOn: string, over: Partial<ClinicReadingInput> = {}): ClinicReadingInput =>
  ({ measuredOn, weightKg: 63, bpSys: 118, bpDia: 76, note: '', ...over });
const DUE = '2027-02-01';
const TODAY = '2026-11-05';

test('Manila day: a log at 00:30 or 23:30 Manila time stays on that Manila day', () => {
  assert.equal(manilaDay(at('2026-11-05T00:30:00')), '2026-11-05');
  assert.equal(manilaDay(at('2026-11-05T23:30:00')), '2026-11-05');
  assert.equal(manilaDay(new Date('2026-11-04T16:30:00Z')), '2026-11-05');
});

test('merging both sources, sorted by date; the same day keeps both, own reading first', () => {
  const s = buildHealthSeries({
    logs: [log('2026-11-03T09:00:00'), log('2026-10-20T08:00:00')],
    clinic: [clinic('2026-11-03'), clinic('2026-10-27')],
    unit: 'kg', dueDate: DUE, range: 'all', today: TODAY,
  });
  assert.deepEqual(s.points.map(p => `${p.day} ${p.source}`), [
    '2026-10-20 self', '2026-10-27 clinic', '2026-11-03 self', '2026-11-03 clinic',
  ]);
  assert.equal(s.points[2].weight, 62.4);
  assert.equal(s.points[3].weight, 63);
});

test('own readings: the last log of a Manila day is kept', () => {
  const pts = selfPoints([
    log('2026-11-03T08:00:00', { weight: 60 }),
    log('2026-11-03T21:00:00', { weight: 61 }),
    log('2026-11-03T12:00:00', { weight: 62 }),
  ], 'kg');
  assert.equal(pts.length, 1);
  assert.equal(pts[0].weight, 61);
});

test('unit conversion: kg stays, lbs converts (both sources, 1 decimal)', () => {
  assert.equal(selfPoints([log('2026-11-03T09:00:00')], 'kg')[0].weight, 62.4);
  assert.equal(selfPoints([log('2026-11-03T09:00:00')], 'lbs')[0].weight, 137.6);
  assert.equal(clinicPoints([clinic('2026-11-03', { weightKg: 63 })], 'lbs')[0].weight, 138.9);
});

test('missing values are null, not zero; unreadable entries are skipped', () => {
  const [own] = selfPoints([log('2026-11-03T09:00:00', { weight: 0, bpSys: undefined, mood: 7, kicks: -1 })], 'kg');
  assert.equal(own.weight, null);
  assert.equal(own.bpSys, null);
  assert.equal(own.bpDia, 72);
  assert.equal(own.mood, null);
  assert.equal(own.kicks, null);
  const [c] = clinicPoints([clinic('2026-11-03', { weightKg: null, bpSys: null })], 'kg');
  assert.deepEqual([c.weight, c.bpSys, c.bpDia, c.kicks, c.mood], [null, null, 76, null, null]);
  assert.equal(clinicPoints([clinic('2026-11-03', { weightKg: null, bpSys: null, bpDia: null })], 'kg').length, 0);
  assert.equal(clinicPoints([clinic('11/03/2026'), clinic(undefined as any)], 'kg').length, 0);
  assert.equal(selfPoints([{ loggedAt: null, weight: 60 }], 'kg').length, 0);
});

test('range cut-offs: 4 weeks, 3 months, whole pregnancy', () => {
  assert.equal(rangeStart('4w', TODAY), '2026-10-09');
  assert.equal(rangeStart('3m', TODAY), '2026-08-05');
  assert.equal(rangeStart('all', TODAY, DUE), '2026-04-27');
  assert.equal(rangeStart('all', TODAY, null), null);
  assert.equal(addMonths('2026-05-31', -3), '2026-02-28');
  assert.equal(addMonths('2026-01-15', -3), '2025-10-15');

  const logs = [log('2026-10-08T09:00:00'), log('2026-10-09T09:00:00'), log('2026-08-04T09:00:00'), log('2026-08-05T09:00:00')];
  const days = (range: '4w' | '3m' | 'all') =>
    buildHealthSeries({ logs, clinic: [], unit: 'kg', dueDate: DUE, range, today: TODAY }).points.map(p => p.day);
  assert.deepEqual(days('4w'), ['2026-10-09']);
  assert.deepEqual(days('3m'), ['2026-08-05', '2026-10-08', '2026-10-09']);
  assert.equal(days('all').length, 4);
});

test('axis: from the range start to today; without a due date "whole pregnancy" starts at the first reading', () => {
  const four = buildHealthSeries({ logs: [], clinic: [], unit: 'kg', dueDate: DUE, range: '4w', today: TODAY });
  assert.deepEqual([four.from, four.to], ['2026-10-09', TODAY]);
  const noDue = buildHealthSeries({ logs: [log('2026-09-01T09:00:00')], clinic: [], unit: 'kg', dueDate: null, range: 'all', today: TODAY });
  assert.deepEqual([noDue.from, noDue.to], ['2026-09-01', TODAY]);
  assert.equal(noDue.points[0].week, null);
});

test('week labels from the due date (280-day rule)', () => {
  assert.equal(pregnancyWeekOn('2026-04-27', DUE), 0);
  assert.equal(pregnancyWeekOn('2026-11-05', DUE), 27);
  assert.equal(pregnancyWeekOn(DUE, DUE), 40);
  assert.equal(pregnancyWeekOn('2027-03-01', DUE), 40);
  assert.equal(pregnancyWeekOn('2026-01-01', DUE), 0);
  assert.equal(pregnancyWeekOn('2026-11-05', null), null);
  assert.equal(weekLabel(27), 'Week 27');
  assert.equal(weekLabel(null), '');
  assert.equal(shortDayLabel('2026-11-05'), 'Nov 5');
});

test('latest values: newest across both sources; the clinic wins on the same day', () => {
  const pts = sortPoints([
    ...selfPoints([log('2026-11-03T09:00:00', { weight: 62 }), log('2026-11-04T09:00:00', { weight: 0 })], 'kg'),
    ...clinicPoints([clinic('2026-11-03', { weightKg: 63, bpSys: null })], 'kg'),
  ]);
  const latest = latestValues(pts);
  assert.deepEqual(latest.weight, { value: 63, day: '2026-11-03', source: 'clinic' });
  assert.deepEqual(latest.bp, { value: { sys: 112, dia: 72 }, day: '2026-11-04', source: 'self' });
  assert.equal(latest.kicks?.source, 'self');
  assert.deepEqual(latestValues([]), {
    weight: null, bp: null, kicks: null, mood: null,
    fundalHeightCm: null, fetalHeartRate: null, pulse: null, temperatureC: null,
  });
});

test('nice axis scale covers the data with round ticks', () => {
  const s = niceScale(61.2, 63.9);
  assert.ok(s.min <= 61.2 && s.max >= 63.9);
  assert.deepEqual(s.ticks, [61, 62, 63, 64]);
  const flat = niceScale(120, 120, 10);
  assert.ok(flat.min <= 115 && flat.max >= 125);
  assert.ok(flat.ticks.length >= 3 && flat.ticks.length <= 6);
});

// ── Clinic-only measures: fundal height, fetal heart rate, pulse, temperature ──

const full = (measuredOn: string, over: Partial<ClinicReadingInput> = {}): ClinicReadingInput => clinic(measuredOn, {
  fundalHeightCm: 27, fetalHeartRate: 142, pulse: 84, temperatureC: 36.7, ...over,
});

test('new measures: read for clinic readings, null for her own', () => {
  const [c] = clinicPoints([full('2026-11-03')], 'kg');
  assert.deepEqual([c.fundalHeightCm, c.fetalHeartRate, c.pulse, c.temperatureC], [27, 142, 84, 36.7]);
  const [own] = selfPoints([log('2026-11-03T09:00:00')], 'kg');
  assert.deepEqual([own.fundalHeightCm, own.fetalHeartRate, own.pulse, own.temperatureC], [null, null, null, null]);
});

test('no conversion for the new measures, even in lbs', () => {
  const [c] = clinicPoints([full('2026-11-03', { weightKg: 63 })], 'lbs');
  assert.equal(c.weight, 138.9);
  assert.deepEqual([c.fundalHeightCm, c.fetalHeartRate, c.pulse, c.temperatureC], [27, 142, 84, 36.7]);
});

test('a reading with only a new measure is a valid point; one with no measure at all is left out', () => {
  const pts = clinicPoints([
    { measuredOn: '2026-11-03', pulse: 88 },
    { measuredOn: '2026-11-04', weightKg: null, bpSys: null, bpDia: null, note: 'Nothing measured' },
  ], 'kg');
  assert.equal(pts.length, 1);
  assert.deepEqual([pts[0].pulse, pts[0].weight, pts[0].bpSys, pts[0].fundalHeightCm], [88, null, null, null]);
});

test('older documents without the new fields still work', () => {
  const [c] = clinicPoints([{ measuredOn: '2026-10-12', weightKg: 62.9, bpSys: 118, bpDia: 76, note: '' }], 'kg');
  assert.deepEqual([c.weight, c.bpSys, c.bpDia], [62.9, 118, 76]);
  assert.deepEqual([c.fundalHeightCm, c.fetalHeartRate, c.pulse, c.temperatureC], [null, null, null, null]);
});

test('garbage values are null: strings, zero, negative, NaN, Infinity, objects', () => {
  for (const bad of ['140', 0, -3, NaN, Infinity, { v: 1 }, true, null, undefined]) {
    const pts = clinicPoints([{ measuredOn: '2026-11-03', weightKg: 60, fundalHeightCm: bad, fetalHeartRate: bad, pulse: bad, temperatureC: bad }], 'kg');
    assert.deepEqual([pts[0].fundalHeightCm, pts[0].fetalHeartRate, pts[0].pulse, pts[0].temperatureC], [null, null, null, null], String(bad));
  }
});

test('same-day mix: her reading and the clinic reading stay separate; the clinic wins latest values', () => {
  const s = buildHealthSeries({
    logs: [log('2026-11-03T23:30:00', { weight: 62 })],
    clinic: [full('2026-11-03', { weightKg: 63 })],
    unit: 'kg', dueDate: DUE, range: '4w', today: TODAY,
  });
  assert.deepEqual(s.points.map(p => p.source), ['self', 'clinic']);
  assert.equal(s.latest.weight?.source, 'clinic');
  assert.deepEqual(s.latest.pulse, { value: 84, day: '2026-11-03', source: 'clinic' });
});

test('range cut-offs apply to the new measures', () => {
  const clinicList = [full('2026-10-08', { pulse: 80 }), full('2026-10-09', { pulse: 81 }), { measuredOn: '2026-08-05', temperatureC: 36.5 }];
  const pick = (range: '4w' | '3m' | 'all') => buildHealthSeries({ logs: [], clinic: clinicList, unit: 'kg', dueDate: DUE, range, today: TODAY }).points;
  assert.deepEqual(pick('4w').map(p => p.pulse), [81]);
  assert.deepEqual(pick('3m').map(p => p.temperatureC), [36.5, 36.7, 36.7]);
  assert.equal(pick('all').length, 3);
});

test('latest values: newest per measure, each with its own day', () => {
  const latest = latestValues(sortPoints(clinicPoints([
    full('2026-10-01'),
    { measuredOn: '2026-10-20', pulse: 90 },
    { measuredOn: '2026-10-25', temperatureC: 37.1, fetalHeartRate: 'n/a' },
  ], 'kg')));
  assert.deepEqual(latest.pulse, { value: 90, day: '2026-10-20', source: 'clinic' });
  assert.deepEqual(latest.temperatureC, { value: 37.1, day: '2026-10-25', source: 'clinic' });
  assert.deepEqual(latest.fetalHeartRate, { value: 142, day: '2026-10-01', source: 'clinic' });
  assert.deepEqual(latest.fundalHeightCm, { value: 27, day: '2026-10-01', source: 'clinic' });
  const none = latestValues([]);
  assert.deepEqual([none.fundalHeightCm, none.fetalHeartRate, none.pulse, none.temperatureC], [null, null, null, null]);
});

test('Manila day boundary: her logs at 23:30 and 00:30 Manila land on their own Manila days', () => {
  const pts = selfPoints([log('2026-11-03T23:30:00', { weight: 61 }), log('2026-11-04T00:30:00', { weight: 62 })], 'kg');
  assert.deepEqual(pts.map(p => [p.day, p.weight]), [['2026-11-03', 61], ['2026-11-04', 62]]);
  // 4 weeks back from today: a log at 00:30 Manila on the first day is in, 23:30 the day before is out.
  const s = buildHealthSeries({
    logs: [log('2026-10-08T23:30:00'), log('2026-10-09T00:30:00')], clinic: [], unit: 'kg', dueDate: DUE, range: '4w', today: TODAY,
  });
  assert.deepEqual(s.points.map(p => p.day), ['2026-10-09']);
});
