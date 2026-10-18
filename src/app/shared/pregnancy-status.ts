// pregnancy-status.ts
// The one place that turns a due date into the pregnancy week, days and
// countdown, so every page shows the same numbers. 280 days = 40 weeks,
// counted from the due date backwards; values are clamped to 0..280.

const TOTAL_PREGNANCY_DAYS = 280;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PregnancyStatus {
  /** Completed weeks, 0-40. */
  week: number;
  /** Days into the current week, 0-6. */
  days: number;
  /** Whole days left until the due date (0 once it has passed). */
  daysUntilDue: number;
  /** Calendar days since the due date (local days): 0 up to and including
   *  the due date, 1 the day after, and so on. The week stays capped at 40. */
  daysPastDue: number;
}

/** The pregnancy reminders (kick count, weekly update, Daily Checklist,
 *  vitamin, water) stop this many days after the due date: the end of
 *  week 42. Appointment reminders and care-team pushes never stop. */
export const REMINDERS_END_DAYS_AFTER_DUE = 14;

/** Local midnight REMINDERS_END_DAYS_AFTER_DUE days after the due date's
 *  local day, or null without a readable due date. Null means "no end":
 *  a missing or failed read must never switch reminders off. */
export function pregnancyRemindersEndAt(dueDate: Date | null | undefined): Date | null {
  if (!dueDate || isNaN(dueDate.getTime())) return null;
  return new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate() + REMINDERS_END_DAYS_AFTER_DUE);
}

/** True from the end above onwards; false without a readable due date. */
export function pregnancyRemindersEnded(dueDate: Date | null | undefined, now: Date = new Date()): boolean {
  const end = pregnancyRemindersEndAt(dueDate);
  return end !== null && now.getTime() >= end.getTime();
}

export function pregnancyStatus(dueDate: Date | null, now: Date = new Date()): PregnancyStatus {
  if (!dueDate || isNaN(dueDate.getTime())) return { week: 0, days: 0, daysUntilDue: 0, daysPastDue: 0 };
  const daysUntilDue = Math.round((dueDate.getTime() - now.getTime()) / MS_PER_DAY);
  const elapsed = Math.max(0, Math.min(TOTAL_PREGNANCY_DAYS, TOTAL_PREGNANCY_DAYS - daysUntilDue));
  return {
    week: Math.min(40, Math.floor(elapsed / 7)),
    days: elapsed % 7,
    daysUntilDue: Math.max(0, daysUntilDue),
    daysPastDue: Math.max(0, localDaysBetween(dueDate, now)),
  };
}

/** "Due 1 day ago", "Due 30 days ago" (the Home pill after the due date). */
export function pastDueLabel(daysPastDue: number): string {
  return `Due ${daysPastDue} ${daysPastDue === 1 ? 'day' : 'days'} ago`;
}

/** Whole local calendar days from `from`'s day to `to`'s day (negative if
 *  `to` is earlier). Rounded, so a daylight-saving hour doesn't matter. */
function localDaysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}
