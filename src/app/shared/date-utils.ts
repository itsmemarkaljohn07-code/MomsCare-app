// date-utils.ts
//
// Why this exists: registration stores dates (dueDate, lmpDate) as full ISO
// timestamps, e.g. "2026-12-14T16:00:00.000Z" -- which is local midnight on
// Dec 15 in the Philippines (UTC+8). A native <input type="date"> only
// accepts "yyyy-MM-dd", so when it is handed an ISO timestamp it silently
// shows an empty box even though the date is saved. These helpers convert
// between the two using LOCAL time, so the date shown is the date the user
// actually picked. (Simply slicing the ISO string would show Dec 14.)

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Formats a Date as yyyy-MM-dd in the device's local time. */
export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Stored value (ISO timestamp or plain yyyy-MM-dd) -> the yyyy-MM-dd a
 *  date input needs. Empty or unparseable input gives an empty string. */
export function toDateInputValue(stored?: string | null): string {
  if (!stored) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  const d = new Date(stored);
  return isNaN(d.getTime()) ? '' : formatLocalDate(d);
}

/** yyyy-MM-dd from a date input -> the same representation registration
 *  stores: an ISO timestamp of LOCAL midnight. Empty or invalid input
 *  gives an empty string. */
export function fromDateInputValue(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!m) return '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toISOString();
}