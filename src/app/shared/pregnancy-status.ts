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
