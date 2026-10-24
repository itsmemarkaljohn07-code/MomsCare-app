// profile-fields.ts
// The mother's Birthday (and the age shown from it) and her Address: how
// they are read from her profile, checked, shown and written. No Angular,
// no Firebase, so every rule can be tested on its own.
//
// Birthday: stored as a plain "YYYY-MM-DD" string in users/{uid}.dob, the
// format the admin dashboard writes and reads. Older values may be ISO
// timestamps; '' (the dashboard's "removed") means no birthday. The age is
// never stored: it is worked out from the birthday and today's LOCAL date
// whenever it is shown. Limits match the dashboard: 10 to 60, full years.
//
// Address: one map in users/{uid}.address, { province, city, barangay,
// street }, all strings. An older plain-string address is read as the
// street line.

export const BIRTHDAY_MIN_AGE = 10;
export const BIRTHDAY_MAX_AGE = 60;

export const ADDRESS_PART_MAX = 60;
export const STREET_MAX = 100;

export interface ProfileAddress {
  province: string;
  city: string;
  barangay: string;
  street: string;
}

export type AddressErrors = Partial<Record<keyof ProfileAddress, string>>;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Today's date on the device, local time, as "YYYY-MM-DD". */
export function todayLocalYmd(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** True for a "YYYY-MM-DD" that is a real calendar date (no 30 February). */
export function isRealYmd(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = YMD.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/** The stored dob as "YYYY-MM-DD", or null when there is none. Reads plain
 *  dates and older ISO timestamps (by their local date); '' and anything
 *  unreadable mean "no birthday". */
export function readBirthday(stored: unknown): string | null {
  if (typeof stored !== 'string' || !stored.trim()) return null;
  const v = stored.trim();
  if (YMD.test(v)) return isRealYmd(v) ? v : null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : todayLocalYmd(d);
}

/** Full years from a birthday to a date (both "YYYY-MM-DD"), the same rule
 *  as the dashboard: a 29 February birthday counts from 1 March in other
 *  years. Null if either date isn't real. */
export function ageOn(birthday: string, on: string): number | null {
  if (!isRealYmd(birthday) || !isRealYmd(on)) return null;
  const [by, bm, bd] = birthday.split('-').map(Number);
  const [oy, om, od] = on.split('-').map(Number);
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age--;
  return age;
}

/** '' when the birthday is fine; otherwise the message shown by the field.
 *  An empty value is refused only when \`required\`. */
export function birthdayError(value: string, today: string, required = true): string {
  const v = (value ?? '').trim();
  if (!v) return required ? 'Please enter your birthday.' : '';
  if (!isRealYmd(v)) return 'Please choose a real date.';
  if (v > today) return "Your birthday can't be in the future.";
  const age = ageOn(v, today);
  if (age === null || age < BIRTHDAY_MIN_AGE || age > BIRTHDAY_MAX_AGE) {
    return `Your age must be between ${BIRTHDAY_MIN_AGE} and ${BIRTHDAY_MAX_AGE}.`;
  }
  return '';
}

/** "May 1, 1998" (same in every time zone: the date is read as written). */
export function formatBirthday(birthday: string): string {
  if (!isRealYmd(birthday)) return '';
  const [y, m, d] = birthday.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "YYYY-MM-DD" exactly \`years\` before today (local); 28 Feb for 29 Feb. */
export function yearsBefore(today: string, years: number): string {
  const [y, m, d] = today.split('-').map(Number);
  const target = new Date(y - years, m - 1, 1);
  const lastDay = new Date(target.getFullYear(), m, 0).getDate();
  return `${target.getFullYear()}-${pad(m)}-${pad(Math.min(d, lastDay))}`;
}

// -- Address ----------------------------------------------------------------

export function emptyAddress(): ProfileAddress {
  return { province: '', city: '', barangay: '', street: '' };
}

/** The stored address as the four parts, or null when there is none. An
 *  older plain-string address becomes the street line. */
export function readAddress(stored: unknown): ProfileAddress | null {
  if (typeof stored === 'string') {
    return stored.trim() ? { ...emptyAddress(), street: stored.trim() } : null;
  }
  if (!stored || typeof stored !== 'object') return null;
  const s = stored as Record<string, unknown>;
  const part = (k: keyof ProfileAddress) => (typeof s[k] === 'string' ? (s[k] as string).trim() : '');
  const a = { province: part('province'), city: part('city'), barangay: part('barangay'), street: part('street') };
  return isAddressEmpty(a) ? null : a;
}

/** Every part trimmed (what is saved). */
export function trimAddress(a: ProfileAddress): ProfileAddress {
  return {
    province: (a.province ?? '').trim(),
    city: (a.city ?? '').trim(),
    barangay: (a.barangay ?? '').trim(),
    street: (a.street ?? '').trim(),
  };
}

export function isAddressEmpty(a: ProfileAddress | null | undefined): boolean {
  if (!a) return true;
  const t = trimAddress(a);
  return !t.province && !t.city && !t.barangay && !t.street;
}

/** Messages by field. Province, City/Municipality and Barangay are needed
 *  when \`required\` (signup) or once any part is filled in; Purok/Street is
 *  optional. Lengths are checked after trimming. */
export function addressErrors(a: ProfileAddress, required = true): AddressErrors {
  const t = trimAddress(a);
  const needed = required || !isAddressEmpty(t);
  const e: AddressErrors = {};
  const part = (k: 'province' | 'city' | 'barangay', label: string) => {
    if (!t[k]) { if (needed) e[k] = `Please enter your ${label}.`; }
    else if (t[k].length > ADDRESS_PART_MAX) e[k] = `Keep it under ${ADDRESS_PART_MAX} characters.`;
  };
  part('province', 'province');
  part('city', 'city or municipality');
  part('barangay', 'barangay');
  if (t.street.length > STREET_MAX) e.street = `Keep it under ${STREET_MAX} characters.`;
  return e;
}

/** "Purok 3, Rizal St., Barangay, City, Province": the parts that are filled in. */
export function formatAddress(a: ProfileAddress | null | undefined): string {
  if (!a) return '';
  const t = trimAddress(a);
  return [t.street, t.barangay, t.city, t.province].filter(Boolean).join(', ');
}

export function sameAddress(a: ProfileAddress | null, b: ProfileAddress | null): boolean {
  const x = trimAddress(a ?? emptyAddress());
  const y = trimAddress(b ?? emptyAddress());
  return x.province === y.province && x.city === y.city && x.barangay === y.barangay && x.street === y.street;
}
