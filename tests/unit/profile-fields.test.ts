// Run: node --import ./tests/unit/resolve-ts.mjs --test tests/unit/profile-fields.test.ts
// (under TZ=Asia/Manila and TZ=UTC: the answers must not change)
// Birthday, age and address rules (shared/profile-fields.ts), the profile
// written at registration (shared/registration-profile.ts) and what Profile
// Edit saves (shared/profile-changes.ts). Throwaway data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addressErrors, ageOn, birthdayError, emptyAddress, formatAddress, formatBirthday, isRealYmd,
  readAddress, readBirthday, todayLocalYmd, trimAddress, yearsBefore,
} from '../../src/app/shared/profile-fields.ts';
import { buildRegistrationProfile } from '../../src/app/shared/registration-profile.ts';
import { profileEditChanges } from '../../src/app/shared/profile-changes.ts';
import type { ProfileEditForm } from '../../src/app/shared/profile-changes.ts';

const TODAY = '2026-10-24';

test('age: the day before, the day of and the day after the birthday', () => {
  assert.equal(ageOn('2000-10-25', TODAY), 25); // birthday tomorrow
  assert.equal(ageOn('2000-10-24', TODAY), 26); // birthday today
  assert.equal(ageOn('2000-10-23', TODAY), 26); // birthday yesterday
});

test('age: 29 February counts from 1 March in other years', () => {
  assert.equal(ageOn('2004-02-29', '2025-02-28'), 20);
  assert.equal(ageOn('2004-02-29', '2025-03-01'), 21);
  assert.equal(ageOn('2004-02-29', '2028-02-28'), 23);
  assert.equal(ageOn('2004-02-29', '2028-02-29'), 24);
  assert.equal(isRealYmd('2004-02-29'), true);
  assert.equal(isRealYmd('2005-02-29'), false);
});

test('limits: 10 to 60 full years today', () => {
  assert.match(birthdayError('2016-10-25', TODAY), /between 10 and 60/); // 9
  assert.equal(birthdayError('2016-10-24', TODAY), '');                 // 10 today
  assert.equal(birthdayError('1966-10-24', TODAY), '');                 // 60 today
  assert.equal(birthdayError('1965-10-25', TODAY), '');                 // 60, turns 61 tomorrow
  assert.match(birthdayError('1965-10-24', TODAY), /between 10 and 60/); // 61 today
});

test('future, unreal and empty birthdays', () => {
  assert.match(birthdayError('2026-10-25', TODAY), /future/);
  assert.match(birthdayError('2001-02-30', TODAY), /real date/);
  assert.match(birthdayError('25/10/2001', TODAY), /real date/);
  assert.match(birthdayError('', TODAY), /enter your birthday/);
  assert.equal(birthdayError('', TODAY, false), '');
});

test('reading the stored dob: plain date, older ISO timestamp, empty', () => {
  assert.equal(readBirthday('1998-05-01'), '1998-05-01');
  // An ISO timestamp is read by its local date (here: local midnight 25 Oct 2001).
  assert.equal(readBirthday(new Date(2001, 9, 25).toISOString()), '2001-10-25');
  assert.equal(readBirthday(''), null);      // the dashboard's "removed"
  assert.equal(readBirthday(undefined), null);
  assert.equal(readBirthday('not a date'), null);
  assert.equal(readBirthday('2001-02-30'), null);
});

test('today is the device local date; display text', () => {
  assert.equal(todayLocalYmd(new Date(2026, 9, 24, 23, 59)), '2026-10-24');
  assert.equal(todayLocalYmd(new Date(2026, 9, 25, 0, 1)), '2026-10-25');
  assert.equal(formatBirthday('1998-05-01'), 'May 1, 1998');
  assert.equal(formatBirthday(''), '');
  assert.equal(yearsBefore(TODAY, 25), '2001-10-24');
  assert.equal(yearsBefore('2028-02-29', 1), '2027-02-28');
});

test('address: read a map or an older plain string; trim; format', () => {
  assert.deepEqual(readAddress('  Old Street 5 '), { province: '', city: '', barangay: '', street: 'Old Street 5' });
  assert.deepEqual(readAddress({ province: ' Samar ', city: 'Catbalogan City', barangay: 'Zz', street: '' }),
    { province: 'Samar', city: 'Catbalogan City', barangay: 'Zz', street: '' });
  assert.equal(readAddress(''), null);
  assert.equal(readAddress(undefined), null);
  assert.equal(readAddress({ province: '', city: '', barangay: '', street: '' }), null);
  assert.equal(formatAddress({ province: 'Samar', city: 'Catbalogan City', barangay: 'Zz', street: 'Purok 1' }),
    'Purok 1, Zz, Catbalogan City, Samar');
});

test('address checks: required at signup, optional until started, lengths', () => {
  const full = { province: 'Samar', city: 'Catbalogan City', barangay: 'Zz Test', street: '' };
  assert.deepEqual(addressErrors(full, true), {});
  assert.deepEqual(Object.keys(addressErrors(emptyAddress(), true)).sort(), ['barangay', 'city', 'province']);
  assert.deepEqual(addressErrors(emptyAddress(), false), {});
  assert.deepEqual(Object.keys(addressErrors({ ...emptyAddress(), city: 'X' }, false)).sort(), ['barangay', 'province']);
  assert.ok(addressErrors({ ...full, province: 'x'.repeat(61) }).province);
  assert.equal(addressErrors({ ...full, province: ' ' + 'x'.repeat(60) + ' ' }).province, undefined);
  assert.ok(addressErrors({ ...full, street: 'x'.repeat(101) }).street);
  assert.deepEqual(trimAddress({ province: ' a ', city: ' b', barangay: 'c ', street: '  ' }),
    { province: 'a', city: 'b', barangay: 'c', street: '' });
});

test('registration: dob as YYYY-MM-DD and the address map; never an age; retry writes the same', () => {
  const profile = { fullName: 'Zz Test Mother', username: 'zztest', dob: '1998-05-01',
    address: { province: ' Samar ', city: 'Catbalogan City', barangay: 'Zz', street: '' } };
  const a = buildRegistrationProfile('uid1', 'zz@example.com', profile, 'T');
  const b = buildRegistrationProfile('uid1', 'zz@example.com', profile, 'T'); // the retry uses the same builder
  assert.deepEqual(a, b);
  assert.equal(a.dob, '1998-05-01');
  assert.deepEqual(a.address, { province: 'Samar', city: 'Catbalogan City', barangay: 'Zz', street: '' });
  assert.ok(!('age' in a));
  // Nothing empty is written.
  const c = buildRegistrationProfile('uid1', 'zz@example.com', { dob: '', address: emptyAddress() }, 'T');
  assert.ok(!('dob' in c) && !('address' in c));
});

const form = (over: Partial<ProfileEditForm> = {}): ProfileEditForm => ({
  firstName: 'Zz', middleName: '', lastName: 'Test', email: 'zz@example.com', phone: '9000000000',
  birthday: '', address: emptyAddress(), dueDate: '', firstTimeMom: 'yes', bloodType: '',
  doctorName: '', clinic: '', emergencyContact: '', ...over,
});

test('Profile Edit: adds a birthday and address; untouched ones are not written', () => {
  const loaded = form();
  const addr = { province: 'Samar', city: 'Catbalogan City', barangay: 'Zz', street: 'Purok 1 ' };
  const { changes } = profileEditChanges(loaded, form({ birthday: '1998-05-01', address: addr }));
  assert.equal(changes.dob, '1998-05-01');
  assert.deepEqual(changes.address, { ...addr, street: 'Purok 1' });
  // An older plain-string address that wasn't touched stays as it is.
  const old = form({ address: readAddress('Old Street 5')! });
  assert.deepEqual(profileEditChanges(old, form({ address: readAddress('Old Street 5')! })).changes, {});
});

test('Profile Edit: a saved birthday or address cannot be emptied', () => {
  const loaded = form({ birthday: '1998-05-01', address: { ...emptyAddress(), province: 'Samar', city: 'X', barangay: 'Y' } });
  const r = profileEditChanges(loaded, form());
  assert.deepEqual(r.clearedRequired.sort(), ['Address', 'Birthday']);
  assert.ok(!('dob' in r.changes) && !('address' in r.changes));
});
