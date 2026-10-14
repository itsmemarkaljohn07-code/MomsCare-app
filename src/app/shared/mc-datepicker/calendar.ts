// calendar.ts
//
// Date arithmetic for mc-datepicker, on the same yyyy-MM-dd strings the date
// fields use. LOCAL time only: new Date(y, m, d) and formatLocalDate, never
// toISOString, so a picked date can't shift by a day in UTC+8.
import { formatLocalDate } from '../date-utils';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface CalendarDay {
  /** yyyy-MM-dd */
  value: string;
  day: number;
  /** Belongs to the previous or next month (shown dimmed). */
  outside: boolean;
  /** Outside [min, max]: shown, can't be picked. */
  disabled: boolean;
  /** "Monday, March 1, 2027" for screen readers. */
  label: string;
}

/** yyyy-MM-dd -> its parts (month 0-11), or null if it isn't a real date. */
export function parseYmd(value: string | null | undefined): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const y = Number(match[1]), m = Number(match[2]) - 1, d = Number(match[3]);
  const date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return { y, m, d };
}

/** Local date parts -> yyyy-MM-dd (overflowing days/months roll over). */
export function ymd(y: number, m: number, d: number): string {
  return formatLocalDate(new Date(y, m, d));
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

/** The month n months after (y, m). */
export function shiftMonth(y: number, m: number, n: number): { y: number; m: number } {
  const date = new Date(y, m + n, 1);
  return { y: date.getFullYear(), m: date.getMonth() };
}

/** value + n days. */
export function addDays(value: string, n: number): string {
  const p = parseYmd(value);
  return p ? ymd(p.y, p.m, p.d + n) : value;
}

/** value + n months, keeping the day where it exists (Jan 31 + 1 -> Feb 28/29). */
export function addMonths(value: string, n: number): string {
  const p = parseYmd(value);
  if (!p) return value;
  const t = shiftMonth(p.y, p.m, n);
  return ymd(t.y, t.m, Math.min(p.d, daysInMonth(t.y, t.m)));
}

/** True if value is before min or after max (either may be empty). */
export function outOfRange(value: string, min?: string | null, max?: string | null): boolean {
  return (!!parseYmd(min) && value < min!) || (!!parseYmd(max) && value > max!);
}

/** The 6 x 7 grid for a month, Sunday first, padded with the neighbouring
 *  months' days. */
export function monthGrid(y: number, m: number, min?: string | null, max?: string | null): CalendarDay[][] {
  const first = new Date(y, m, 1);
  const start = 1 - first.getDay();
  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(y, m, start + w * 7 + i);
      const value = formatLocalDate(date);
      week.push({
        value,
        day: date.getDate(),
        outside: date.getMonth() !== m,
        disabled: outOfRange(value, min, max),
        label: `${WEEKDAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`,
      });
    }
    weeks.push(week);
  }
  return weeks;
}

/** yyyy-MM-dd -> MM/DD/YYYY, as the native date input showed it; '' if invalid. */
export function formatDisplay(value: string | null | undefined): string {
  const p = parseYmd(value);
  if (!p) return '';
  return `${String(p.m + 1).padStart(2, '0')}/${String(p.d).padStart(2, '0')}/${p.y}`;
}

/** Day of the week (0 = Sunday) of a yyyy-MM-dd. */
export function weekday(value: string): number {
  const p = parseYmd(value);
  return p ? new Date(p.y, p.m, p.d).getDay() : 0;
}
