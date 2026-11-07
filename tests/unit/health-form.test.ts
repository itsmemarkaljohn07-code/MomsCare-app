// Run: node --import ./tests/unit/resolve-ts.mjs --test tests/unit/health-form.test.ts
// (under TZ=Asia/Manila and TZ=UTC: the answers must not change)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthEntry, realValue, validateHealthForm } from '../../src/app/shared/health-form.ts';
import type { HealthFormDraft } from '../../src/app/shared/health-form.ts';

const opened = { kicks: 3, mood: 2 };
const draft = (over: Partial<HealthFormDraft> = {}): HealthFormDraft =>
  ({ weight: null, bpSys: null, bpDia: null, kicks: 3, mood: 2, ...over });

test('a blank form with kicks and mood unchanged is refused', () => {
  const e = validateHealthForm(draft(), 'kg', opened);
  assert.ok(e.form);
  assert.equal(validateHealthForm(draft({ weight: '', bpSys: '  ', bpDia: '' }), 'kg', opened).form !== undefined, true);
});

test('changing only kicks or mood is a valid save, with no weight or blood pressure stored', () => {
  assert.deepEqual(validateHealthForm(draft({ kicks: 4 }), 'kg', opened), {});
  assert.deepEqual(validateHealthForm(draft({ mood: 3 }), 'kg', opened), {});
  assert.deepEqual(buildHealthEntry(draft({ kicks: 4 }), 'kg'), { kicks: 4, mood: 2 });
});

test('only weight: saved in kg, no bpSys or bpDia', () => {
  assert.deepEqual(validateHealthForm(draft({ weight: 62.4 }), 'kg', opened), {});
  const entry = buildHealthEntry(draft({ weight: 62.4 }), 'kg');
  assert.deepEqual(entry, { weight: 62.4, kicks: 3, mood: 2 });
  assert.ok(!('bpSys' in entry) && !('bpDia' in entry));
  assert.equal(buildHealthEntry(draft({ weight: 137.6 }), 'lbs').weight, 62.41);
});

test('weight range 30-250 kg, converted for lbs', () => {
  for (const w of [29.9, 250.1, -5, 0]) assert.ok(validateHealthForm(draft({ weight: w }), 'kg', opened).weight, String(w));
  for (const w of [30, 250, 62.4]) assert.equal(validateHealthForm(draft({ weight: w }), 'kg', opened).weight, undefined);
  assert.match(validateHealthForm(draft({ weight: 20 }), 'kg', opened).weight!, /30 and 250 kg/);
  assert.match(validateHealthForm(draft({ weight: 60 }), 'lbs', opened).weight!, /66\.1 and 551\.2 lbs/);
  assert.equal(validateHealthForm(draft({ weight: 66.2 }), 'lbs', opened).weight, undefined);
  assert.ok(validateHealthForm(draft({ weight: 552 }), 'lbs', opened).weight);
  assert.ok(validateHealthForm(draft({ weight: 'abc' }), 'kg', opened).weight);
});

test('blood pressure: both numbers or neither', () => {
  assert.match(validateHealthForm(draft({ bpSys: 120 }), 'kg', opened).bp!, /both/);
  assert.match(validateHealthForm(draft({ bpDia: 80 }), 'kg', opened).bp!, /both/);
  assert.deepEqual(validateHealthForm(draft({ bpSys: 120, bpDia: 80 }), 'kg', opened), {});
  assert.deepEqual(buildHealthEntry(draft({ bpSys: 120, bpDia: 80 }), 'kg'), { bpSys: 120, bpDia: 80, kicks: 3, mood: 2 });
});

test('blood pressure ranges and systolic above diastolic', () => {
  const bp = (bpSys: number, bpDia: number) => validateHealthForm(draft({ bpSys, bpDia }), 'kg', opened).bp;
  assert.match(bp(59, 40)!, /Systolic.*60 and 260/);
  assert.match(bp(261, 80)!, /Systolic.*60 and 260/);
  assert.match(bp(120, 29)!, /Diastolic.*30 and 160/);
  assert.match(bp(200, 161)!, /Diastolic.*30 and 160/);
  assert.match(bp(90, 90)!, /higher than diastolic/);
  assert.match(bp(80, 90)!, /higher than diastolic/);
  assert.equal(bp(60, 30), undefined);
  assert.equal(bp(260, 160), undefined);
});

test('stored values worth showing: finite positive numbers only', () => {
  assert.equal(realValue(62.4), 62.4);
  for (const v of [0, -1, NaN, Infinity, null, undefined, '120']) assert.equal(realValue(v), null);
});
