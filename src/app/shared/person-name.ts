// person-name.ts
// The mother's name in three parts (first, optional middle, last) and the
// fullName built from them. fullName stays on the profile because the
// dashboard, notifications and other screens read it; signup, the retry
// after a failed save and Profile Edit all build it here, so they agree.
// No Angular, no Firebase, so every rule can be tested on its own.

export const NAME_PART_MIN = 2;
export const NAME_PART_MAX = 40;

/** Letters (any language, with accents), spaces, hyphen, apostrophe
 *  (straight or curly) and period. No digits, emoji or control characters. */
const NAME_CHARS = /^[\p{L}\p{M} .'’-]+$/u;

/** Trimmed, with runs of spaces collapsed to one. */
export function normalizeNamePart(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/** '' when fine; otherwise the message shown by the field. An optional part
 *  (the middle name) may be empty; when given it follows the same rules. */
export function nameError(value: string | null | undefined, label: string, required: boolean): string {
  const v = normalizeNamePart(value);
  if (!v) return required ? `Please enter your ${label}.` : '';
  if (!NAME_CHARS.test(v)) return "Use letters, spaces, hyphens (-), apostrophes (') and periods (.) only.";
  if (v.length < NAME_PART_MIN || v.length > NAME_PART_MAX) {
    return `Use ${NAME_PART_MIN} to ${NAME_PART_MAX} characters.`;
  }
  return '';
}

/** "First Middle Last", single spaces, the middle name left out when empty. */
export function buildFullName(first: string | null | undefined, middle: string | null | undefined, last: string | null | undefined): string {
  return [first, middle, last].map(normalizeNamePart).filter(Boolean).join(' ');
}

/** For an account that only has fullName: first word, then the rest as the
 *  last name (how Profile Edit has always prefilled it). Middle stays empty. */
export function splitFullName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  const parts = normalizeNamePart(fullName).split(' ').filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}
