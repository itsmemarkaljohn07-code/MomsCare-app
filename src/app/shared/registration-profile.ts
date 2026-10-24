// registration-profile.ts
// The users/{uid} document written at registration. register() and
// retryProfileSave() both build it here, so a retry after a failed save
// writes exactly the same fields (including the birthday and address).
// No Angular, no Firebase, so it can be tested on its own.

import type { UserProfile } from '../services/auth.service';
import { isAddressEmpty, isRealYmd, trimAddress } from './profile-fields';

export function buildRegistrationProfile(
  uid: string,
  email: string,
  profile: Partial<UserProfile>,
  createdAt: string,
): UserProfile {
  const address = profile.address && typeof profile.address === 'object' ? trimAddress(profile.address) : null;
  return {
    uid,
    fullName:      profile.fullName      ?? '',
    username:      profile.username      ?? '',
    email,
    mobile:        profile.mobile        ?? '',
    dueDate:       profile.dueDate       ?? '',
    weeksPregnant: profile.weeksPregnant ?? 0,
    lmpDate:       profile.lmpDate       ?? '',
    firstTimeMom:  profile.firstTimeMom  ?? true,
    clinicName:    profile.clinicName    ?? '',
    createdAt,
    setupComplete: true,
    // Only real values: never an empty birthday or address (and never an age).
    ...(isRealYmd(profile.dob) ? { dob: profile.dob } : {}),
    ...(address && !isAddressEmpty(address) ? { address } : {}),
  };
}
