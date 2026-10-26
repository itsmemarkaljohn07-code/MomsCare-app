// Run: node --import ./tests/unit/resolve-ts.mjs --test tests/unit/person-name.test.ts
// (under TZ=Asia/Manila and TZ=UTC: the answers must not change)
// The mother's name in three parts and the fullName built from them
// (shared/person-name.ts), what Profile Edit writes for it
// (shared/profile-changes.ts) and the registration profile. zz data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NAME_PART_MAX, buildFullName, nameError, normalizeNamePart, splitFullName,
} from '../../src/app/shared/person-name.ts';
import { profileEditChanges } from '../../src/app/shared/profile-changes.ts';
import type { ProfileEditForm } from '../../src/app/shared/profile-changes.ts';
import { buildRegistrationProfile } from '../../src/app/shared/registration-profile.ts';
import { emptyAddress } from '../../src/app/shared/profile-fields.ts';

test('fullName: with and without a middle name, single spaces', () => {
  assert.equal(buildFullName('Zz', 'Dela Cruz', 'Testmother'), 'Zz Dela Cruz Testmother');
  assert.equal(buildFullName('Zz', '', 'Testmother'), 'Zz Testmother');
  assert.equal(buildFullName('  Zz  Anna ', '   ', ' Testmother   Jr. '), 'Zz Anna Testmother Jr.');
  assert.equal(buildFullName('Zz-Ann', null, "O'Testmother"), "Zz-Ann O'Testmother");
  assert.equal(normalizeNamePart('  Ma.   Zz  '), 'Ma. Zz');
});

test('validation: required, length, allowed characters', () => {
  assert.match(nameError('', 'first name', true), /enter your first name/);
  assert.match(nameError('   ', 'last name', true), /enter your last name/);
  assert.equal(nameError('', 'middle name', false), '');          // middle may be empty
  assert.match(nameError('Z', 'first name', true), /2 to 40/);    // one letter
  assert.match(nameError('Zz4', 'first name', true), /letters/);  // digits
  assert.match(nameError('Zz 🙂', 'first name', true), /letters/); // emoji
  assert.match(nameError('Zz\u0007', 'first name', true), /letters/); // control character
  assert.match(nameError('Z'.repeat(NAME_PART_MAX + 1), 'last name', true), /2 to 40/); // 41
  assert.equal(nameError('Z'.repeat(NAME_PART_MAX), 'last name', true), '');
  for (const ok of ['Zz', 'Zz-Ann', "O'Testmother", 'O’Testmother', 'Testmother Jr.', 'Testmother III', 'Niño', 'Ma. Zz']) {
    assert.equal(nameError(ok, 'name', true), '', ok);
  }
});

test('an older account with only fullName: first word, then the rest', () => {
  assert.deepEqual(splitFullName('Zz Birthday Test'), { firstName: 'Zz', lastName: 'Birthday Test' });
  assert.deepEqual(splitFullName('  Zz  '), { firstName: 'Zz', lastName: '' });
  assert.deepEqual(splitFullName(''), { firstName: '', lastName: '' });
});

const form = (over: Partial<ProfileEditForm> = {}): ProfileEditForm => ({
  firstName: 'Zz', middleName: '', lastName: 'Birthday Test', email: 'zz@example.com', phone: '9000000000',
  birthday: '', address: emptyAddress(), dueDate: '', firstTimeMom: 'yes', bloodType: '',
  doctorName: '', clinic: '', emergencyContact: '', ...over,
});

test('Profile Edit: an older account (split from fullName) writes nothing until a name field changes', () => {
  const loaded = form();
  assert.deepEqual(profileEditChanges(loaded, form()).changes, {});
  // Other fields alone: no name keys.
  assert.deepEqual(profileEditChanges(loaded, form({ phone: '9000000001' })).changes, { mobile: '9000000001' });
  // Only extra spaces: not a change.
  assert.deepEqual(profileEditChanges(loaded, form({ firstName: ' Zz ' })).changes, {});
});

test('Profile Edit: a name change writes all three parts and the rebuilt fullName', () => {
  const { changes } = profileEditChanges(form(), form({ middleName: ' Dela  Cruz ' }));
  assert.deepEqual(changes, {
    firstName: 'Zz', middleName: 'Dela Cruz', lastName: 'Birthday Test', fullName: 'Zz Dela Cruz Birthday Test',
  });
  const removed = profileEditChanges(form({ middleName: 'Dela' }), form({ middleName: '' })).changes;
  assert.equal(removed.middleName, '');
  assert.equal(removed.fullName, 'Zz Birthday Test');
  // A saved first or last name can't be emptied.
  assert.deepEqual(profileEditChanges(form(), form({ lastName: '' })).clearedRequired, ['Last name']);
});

test('registration: the parts and fullName agree; middle only when given; retry writes the same', () => {
  const withMiddle = { firstName: ' Zz  Anna', middleName: 'Dela Cruz', lastName: 'Testmother Jr.', username: 'zztest' };
  const a = buildRegistrationProfile('uid1', 'zz@example.com', withMiddle, 'T');
  assert.deepEqual(a, buildRegistrationProfile('uid1', 'zz@example.com', withMiddle, 'T')); // retry: same builder
  assert.equal(a.firstName, 'Zz Anna');
  assert.equal(a.middleName, 'Dela Cruz');
  assert.equal(a.lastName, 'Testmother Jr.');
  assert.equal(a.fullName, 'Zz Anna Dela Cruz Testmother Jr.');
  const b = buildRegistrationProfile('uid1', 'zz@example.com', { firstName: 'Zz', middleName: '  ', lastName: 'Testmother' }, 'T');
  assert.ok(!('middleName' in b));
  assert.equal(b.fullName, 'Zz Testmother');
  // An older saved draft with only fullName keeps it as it was.
  const c = buildRegistrationProfile('uid1', 'zz@example.com', { fullName: 'Zz Old Draft' }, 'T');
  assert.equal(c.fullName, 'Zz Old Draft');
  assert.ok(!('firstName' in c) && !('lastName' in c));
});
