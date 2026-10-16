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
  if (!dueDate || isNaN(dueDate.getTime())) return { week: 0, days: 0, daysUntilDue: 0 };
  const daysUntilDue = Math.round((dueDate.getTime() - now.getTime()) / MS_PER_DAY);
  const elapsed = Math.max(0, Math.min(TOTAL_PREGNANCY_DAYS, TOTAL_PREGNANCY_DAYS - daysUntilDue));
  return {
    week: Math.min(40, Math.floor(elapsed / 7)),
    days: elapsed % 7,
    daysUntilDue: Math.max(0, daysUntilDue),
  };
}
