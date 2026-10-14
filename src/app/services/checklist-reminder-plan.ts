// checklist-reminder-plan.ts
// Pure scheduling rules for the Daily Checklist reminders: no Capacitor, no
// Angular, so every rule can be checked on its own.
//
// LIMITS (Android): local notifications are scheduled ahead of time and no
// app code runs when one fires, so a reminder can't look at the checklist
// at that moment. That's why the text is generic, and why the plan covers a
// fixed horizon: it is rebuilt whenever the app starts, the patient signs
// in or a checklist item changes. If the app isn't opened for
// CHECKLIST_REMINDER_HORIZON_DAYS days, the reminders simply run out.
// On-time delivery also depends on the exact-alarm permission and the
// phone's battery settings (some phones delay alarms in power saving).

/** Hours between reminders while items are unchecked. */
export const CHECKLIST_REMINDER_INTERVAL_HOURS = 2;
/** Reminders only inside this waking window (local time, inclusive). */
export const CHECKLIST_REMINDER_WINDOW_START_HOUR = 9;
export const CHECKLIST_REMINDER_WINDOW_END_HOUR = 21;
/** Today plus the next two days. */
export const CHECKLIST_REMINDER_HORIZON_DAYS = 3;

/** Dedicated ID range. The scheduler owns 990000-990099, appointments start
 *  at 992000, so this can't collide with either (see reminder-plan.ts). */
export const CHECKLIST_REMINDER_ID_BASE = 991100;
export const CHECKLIST_REMINDER_ID_MAX = 991199;
export const ALL_CHECKLIST_REMINDER_IDS: number[] = Array.from(
  { length: CHECKLIST_REMINDER_ID_MAX - CHECKLIST_REMINDER_ID_BASE + 1 },
  (_, i) => CHECKLIST_REMINDER_ID_BASE + i,
);
/** The old single repeating checklist reminder, cancelled on every sync. */
export const LEGACY_CHECKLIST_REMINDER_ID = 991001;

export const CHECKLIST_REMINDER_TITLE = 'A Little Reminder for Mommy 💗';
export const CHECKLIST_REMINDER_VITAMIN_BODY = 'Take your prenatal vitamins every day, Mommy! 💊';
export const CHECKLIST_REMINDER_GENERAL_BODY =
  "You still have a few things left on today's checklist. One small step at a time! ✨";

/** The reminder text for each Home checklist item (by item id, in checklist
 *  order), with the same emoji the checklist shows. A reminder names the
 *  first item still unchecked today. */
export const CHECKLIST_ITEM_REMINDER_BODIES: Record<number, string> = {
  1: CHECKLIST_REMINDER_VITAMIN_BODY,
  2: "Don't forget to drink your 8 glasses of water today, Mommy! 💧",
  3: 'Time for a light walk or some gentle stretching, Mommy! 🚶',
  4: 'Have you had a veggie-rich meal today, Mommy? 🥗',
  5: 'Remember to rest for 30 minutes today, Mommy! 😴',
};

/** Today's reminder text: the first unchecked item's, or (if that isn't
 *  known) the vitamin or general text. */
export function checklistReminderBody(state: ChecklistState): string {
  const forItem = state.nextUnchecked !== undefined ? CHECKLIST_ITEM_REMINDER_BODIES[state.nextUnchecked] : undefined;
  if (forItem) return forItem;
  return state.vitaminUnchecked ? CHECKLIST_REMINDER_VITAMIN_BODY : CHECKLIST_REMINDER_GENERAL_BODY;
}

/** Skip a slot that is about to pass, so it isn't fired immediately. */
const MIN_LEAD_MS = 60 * 1000;

export interface ChecklistState {
  /** At least one item is unchecked today. */
  anyUnchecked: boolean;
  /** The prenatal-vitamin item is unchecked today. */
  vitaminUnchecked: boolean;
  /** Id of the first unchecked item today, in checklist order. */
  nextUnchecked?: number;
}

export interface ChecklistReminder {
  id: number;
  at: Date;
  title: string;
  body: string;
}

/**
 * Every reminder to schedule from `now`: each interval inside the waking
 * window, for today's remaining slots (only while something is unchecked)
 * and for the next days. The checklist resets every day, so on those days
 * everything, the vitamin included, will be unchecked: they always get the
 * vitamin text. Today's text names today's first unchecked item.
 */
export function buildChecklistReminderPlan(
  now: Date,
  state: ChecklistState,
  intervalMinutes = CHECKLIST_REMINDER_INTERVAL_HOURS * 60,
): ChecklistReminder[] {
  const reminders: ChecklistReminder[] = [];
  const step = Math.max(1, Math.round(intervalMinutes));
  const capacity = ALL_CHECKLIST_REMINDER_IDS.length;

  for (let day = 0; day < CHECKLIST_REMINDER_HORIZON_DAYS; day++) {
    if (day === 0 && !state.anyUnchecked) continue;
    const body = day === 0 ? checklistReminderBody(state) : CHECKLIST_REMINDER_VITAMIN_BODY;

    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day,
      CHECKLIST_REMINDER_WINDOW_START_HOUR, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day,
      CHECKLIST_REMINDER_WINDOW_END_HOUR, 0, 0, 0);

    for (let t = start.getTime(); t <= end.getTime(); t += step * 60 * 1000) {
      if (t < now.getTime() + MIN_LEAD_MS) continue;
      if (reminders.length >= capacity) return reminders;
      reminders.push({
        id: CHECKLIST_REMINDER_ID_BASE + reminders.length,
        at: new Date(t),
        title: CHECKLIST_REMINDER_TITLE,
        body,
      });
    }
  }
  return reminders;
}

export interface ChecklistBellSlot {
  /** checklist-YYYY-MM-DD-HH: one bell entry per slot, never duplicated. */
  id: string;
  at: Date;
  title: string;
  body: string;
}

/**
 * The phone reminders run no app code when they fire, so they never reach
 * the in-app bell. This lists today's reminder slots that have already
 * passed, for the bell to catch up on when the app opens: the same times
 * (local), title and text as the phone reminders. Nothing when reminders
 * are off or every item is done, never a slot from an earlier day, and
 * none from before `notBefore` (when the account was created), since no
 * reminder could have been sent then.
 */
export function dueChecklistBellSlots(
  now: Date,
  state: ChecklistState,
  enabled: boolean,
  notBefore?: Date | null,
): ChecklistBellSlot[] {
  if (!enabled || !state.anyUnchecked) return [];
  const body = checklistReminderBody(state);
  const slots: ChecklistBellSlot[] = [];
  for (let hour = CHECKLIST_REMINDER_WINDOW_START_HOUR; hour <= CHECKLIST_REMINDER_WINDOW_END_HOUR;
    hour += CHECKLIST_REMINDER_INTERVAL_HOURS) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
    if (at.getTime() > now.getTime()) break;
    if (notBefore && !isNaN(notBefore.getTime()) && at.getTime() < notBefore.getTime()) continue;
    slots.push({
      id: `checklist-${localDateKey(at)}-${String(hour).padStart(2, '0')}`,
      at,
      title: CHECKLIST_REMINDER_TITLE,
      body,
    });
  }
  return slots;
}

/** The phone's local calendar date as YYYY-MM-DD. The checklist resets at
 *  local midnight, so "today" must be the local date, not the UTC one. */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
