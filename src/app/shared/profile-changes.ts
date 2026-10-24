// profile-changes.ts
import type { UserProfile } from '../services/auth.service';
import { fromDateInputValue } from './date-utils';
import { emptyAddress, isAddressEmpty, sameAddress, trimAddress } from './profile-fields';
import type { ProfileAddress } from './profile-fields';

/**
 * What Profile Edit and Pregnancy Settings save: only the fields whose value
 * differs from what the page loaded on this visit. A field the patient
 * didn't touch is never written, so an unloaded or stale form can't blank
 * or reset saved data.
 */

/** Profile Edit's form, as strings (yyyy-MM-dd for dates). */
export interface ProfileEditForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Birthday, yyyy-MM-dd ('' when none). */
  birthday: string;
  address: ProfileAddress;
  dueDate: string;
  firstTimeMom: string;
  bloodType: string;
  doctorName: string;
  clinic: string;
  emergencyContact: string;
}

/** Fields that must not be cleared once they have a value. */
const REQUIRED_FIELDS: { key: 'firstName' | 'lastName' | 'phone'; label: string }[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'phone', label: 'Phone number' },
];

export interface ProfileEditChanges {
  changes: Partial<UserProfile>;
  /** Labels of required fields that had a value and were emptied. */
  clearedRequired: string[];
}

export function profileEditChanges(loaded: ProfileEditForm, current: ProfileEditForm): ProfileEditChanges {
  const changed = (k: keyof ProfileEditForm) => current[k] !== loaded[k];
  const clearedRequired = REQUIRED_FIELDS
    .filter(f => loaded[f.key].trim() !== '' && current[f.key].trim() === '')
    .map(f => f.label);

  // email (the login identity) and doctorName (set by the clinic) are
  // shown read-only and never written from here.
  const changes: Partial<UserProfile> = {};
  if (changed('firstName')) changes.firstName = current.firstName;
  if (changed('lastName')) changes.lastName = current.lastName;
  if (changed('firstName') || changed('lastName')) {
    changes.fullName = `${current.firstName} ${current.lastName}`.trim();
  }
  if (changed('phone')) changes.mobile = current.phone;
  // Birthday and address are optional for older accounts, but once saved
  // they can't be emptied (nothing blank is written over a saved value).
  if (loaded.birthday && !current.birthday) clearedRequired.push('Birthday');
  else if (current.birthday !== loaded.birthday && current.birthday) changes.dob = current.birthday;
  const loadedAddress = loaded.address ?? emptyAddress();
  const currentAddress = current.address ?? emptyAddress();
  if (!isAddressEmpty(loadedAddress) && isAddressEmpty(currentAddress)) clearedRequired.push('Address');
  else if (!sameAddress(loadedAddress, currentAddress) && !isAddressEmpty(currentAddress)) {
    changes.address = trimAddress(currentAddress);
  }
  if (changed('dueDate')) changes.dueDate = fromDateInputValue(current.dueDate);
  if (changed('firstTimeMom')) changes.firstTimeMom = current.firstTimeMom === 'yes';
  if (changed('bloodType')) changes.bloodType = current.bloodType;
  if (changed('clinic')) changes.clinicName = current.clinic;
  if (changed('emergencyContact')) changes.emergencyContact = current.emergencyContact;
  return { changes, clearedRequired };
}

/** Pregnancy Settings' form (yyyy-MM-dd for dates). */
export interface PregnancySettingsForm {
  dueDate: string;
  lmpDate: string;
  calcMethod: string;
  weightUnit: string;
  kickReminderTime: string;
  highRisk: string;
  notificationPrefs: Record<string, boolean>;
}

export function pregnancySettingsChanges(loaded: PregnancySettingsForm, current: PregnancySettingsForm): Partial<UserProfile> {
  const changes: Partial<UserProfile> = {};
  if (current.dueDate !== loaded.dueDate) changes.dueDate = fromDateInputValue(current.dueDate);
  if (current.lmpDate !== loaded.lmpDate) changes.lmpDate = fromDateInputValue(current.lmpDate);
  if (current.calcMethod !== loaded.calcMethod) changes.calcMethod = current.calcMethod as UserProfile['calcMethod'];
  if (current.weightUnit !== loaded.weightUnit) changes.weightUnit = current.weightUnit as UserProfile['weightUnit'];
  if (current.kickReminderTime !== loaded.kickReminderTime) changes.kickReminderTime = current.kickReminderTime;
  if (current.highRisk !== loaded.highRisk) changes.highRisk = current.highRisk === 'yes';
  // The switches are one map in Firestore: written whole, only if one changed.
  const prefKeys = new Set([...Object.keys(loaded.notificationPrefs), ...Object.keys(current.notificationPrefs)]);
  if ([...prefKeys].some(k => current.notificationPrefs[k] !== loaded.notificationPrefs[k])) {
    changes.notificationPrefs = { ...current.notificationPrefs } as UserProfile['notificationPrefs'];
  }
  return changes;
}
