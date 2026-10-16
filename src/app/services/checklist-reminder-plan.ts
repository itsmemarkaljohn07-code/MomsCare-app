// checklist-reminder-plan.ts
// Pure scheduling rules for the Daily Checklist reminders: no Capacitor, no
// Angular, so every rule can be checked on its own.
//
// Each checklist activity has its own reminder times (device local time),
// and its reminders exist only while THAT item is unchecked today. Meals
// and rest are split into sub-items (breakfast/lunch/dinner, morning and
// afternoon rest), each with its own reminder; their parent rows have no
// reminder and count as done only when all their sub-items are.
//
// LIMITS (Android) -- do not promise guaranteed delivery:
//  - Reminders are local alarms scheduled ahead of time. No app code runs
//    when one fires, so a reminder can't check the checklist at that
//    moment; the plan is rebuilt whenever the app starts, the patient signs
//    in or an item is ticked/unticked.
//  - The plan covers CHECKLIST_REMINDER_HORIZON_DAYS days. If the app isn't
//    opened in that time, the reminders run out.
//  - Battery saving (and the exact-alarm permission) can delay alarms; while
//    the phone is idle Android delivers at most one such alarm per ~9
//    minutes, which is why reminders at the same time are 10 minutes apart.
//  - "Force stop" in Android settings cancels all of the app's alarms until
//    the app is opened again.
//  - Nothing is planned from REMINDERS_END_DAYS_AFTER_DUE after the due date
//    on (see shared/pregnancy-status.ts); a missing due date changes nothing.

import { pregnancyRemindersEndAt } from '../shared/pregnancy-status';

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

/** Home checklist items that are split into sub-items (parent id -> sub ids).
 *  A parent counts as done only when all its sub-items are. */
export const CHECKLIST_SUB_ITEMS: Readonly<Record<number, readonly number[]>> = {
  4: [41, 42, 43], // veggie-rich meal: breakfast, lunch, dinner
  5: [51, 52],     // rest: morning, afternoon
};

const VITAMIN_BODY = "Hi, Mommy! 💙 Don't forget your prenatal vitamins today. Taking them as recommended helps support your pregnancy.";
// Completion only: never implies the app knows how much she has drunk.
const WATER_BODY = 'A little hydration reminder, Mommy! Remember to drink water regularly throughout the day.';

export interface ChecklistReminderSlot {
  hour: number;
  minute: number;
  body: string;
}

/** The items that have reminders (ids 1, 2, 3 and the sub-items), with
 *  their times and texts. Same-time slots are 10 minutes apart (see LIMITS). */
export const CHECKLIST_REMINDER_ITEMS: readonly { id: number; slots: readonly ChecklistReminderSlot[] }[] = [
  { id: 1, slots: [ // prenatal vitamins
    { hour: 9, minute: 0, body: VITAMIN_BODY },
    { hour: 12, minute: 0, body: VITAMIN_BODY },
    { hour: 20, minute: 0, body: VITAMIN_BODY },
  ] },
  { id: 2, slots: [ // water: every 2 h, and 20:10 (after the 20:00 vitamin reminder)
    { hour: 9, minute: 30, body: WATER_BODY },
    { hour: 11, minute: 30, body: WATER_BODY },
    { hour: 13, minute: 30, body: WATER_BODY },
    { hour: 15, minute: 30, body: WATER_BODY },
    { hour: 17, minute: 30, body: WATER_BODY },
    { hour: 20, minute: 10, body: WATER_BODY },
  ] },
  { id: 3, slots: [ // light walk or stretching
    { hour: 7, minute: 0, body: "Good morning, Mommy! If it's comfortable and appropriate for you, take a little time for gentle movement today." },
    { hour: 17, minute: 0, body: "Good afternoon, Mommy! If it's comfortable and appropriate for you, a little gentle movement or stretching can feel good." },
  ] },
  { id: 41, slots: [{ hour: 8, minute: 0, body: 'Good morning, Mommy! 🍳 Time for a nourishing breakfast. Adding some vegetables or fruit is a lovely start to the day.' }] },
  { id: 42, slots: [{ hour: 11, minute: 0, body: "It's almost lunchtime, Mommy! 🥗 A balanced lunch with some vegetables helps keep you and your baby going." }] },
  { id: 43, slots: [{ hour: 19, minute: 0, body: 'Dinner time, Mommy! 🥦 If you can, include some vegetables in a warm, balanced dinner tonight.' }] },
  { id: 51, slots: [{ hour: 11, minute: 10, body: 'Mommy, remember to take a little time to rest. A short break can help you recharge.' }] },
  { id: 52, slots: [{ hour: 17, minute: 10, body: "It's time to slow down for a while, Mommy. If you can, take a relaxing break." }] },
];

/** Every item id that has reminders. */
export const CHECKLIST_REMINDER_ITEM_IDS: readonly number[] = CHECKLIST_REMINDER_ITEMS.map(i => i.id);

/** Minutes after midnight of every checklist reminder slot (for keeping the
 *  other reminders clear of them, see reminder-plan.ts). */
export const CHECKLIST_REMINDER_SLOT_MINUTES: readonly number[] =
  ([] as number[]).concat(...CHECKLIST_REMINDER_ITEMS.map(i => i.slots.map(s => s.hour * 60 + s.minute)));

/** Skip a slot that is about to pass, so it isn't fired immediately. */
const MIN_LEAD_MS = 60 * 1000;

export interface ChecklistState {
  /** Ids of the reminder items (1, 2, 3, 41-43, 51, 52) still unchecked today. */
  unchecked: readonly number[];
}

/** Every reminder item unchecked: a new day, or no checklist saved yet. */
export const ALL_UNCHECKED: ChecklistState = { unchecked: CHECKLIST_REMINDER_ITEM_IDS };

/**
 * Which reminder items are unchecked in a saved checklist (its `items`).
 * A sub-item is done if it is marked done, or if its parent is: older
 * records only have parents 4 and 5, so a parent marked done there counts
 * as all its sub-items done. Never rewrites the record.
 */
export function uncheckedReminderItems(items: readonly { id: number; done?: boolean }[] | null | undefined): number[] {
  if (!items) return [...CHECKLIST_REMINDER_ITEM_IDS];
  const done = (id: number) => items.some(i => i.id === id && i.done === true);
  const parentOf = (id: number) =>
    Number(Object.keys(CHECKLIST_SUB_ITEMS).find(p => CHECKLIST_SUB_ITEMS[Number(p)].includes(id)));
  return CHECKLIST_REMINDER_ITEM_IDS.filter(id => {
    const parent = parentOf(id);
    return !(done(id) || (!isNaN(parent) && done(parent)));
  });
}

export interface ChecklistReminder {
  id: number;
  /** The checklist item it is for. */
  itemId: number;
  at: Date;
  title: string;
  body: string;
}

/**
 * Every reminder to schedule from `now`: today's slots of the items still
 * unchecked, then the next days' slots of every item (the checklist resets
 * daily). Slots less than a minute away are skipped, so nothing fires at
 * once, and so is every slot from the end of the pregnancy reminders
 * (after `dueDate`) on. Sorted by time; ids are numbered from
 * CHECKLIST_REMINDER_ID_BASE.
 */
export function buildChecklistReminderPlan(now: Date, state: ChecklistState, dueDate?: Date | null): ChecklistReminder[] {
  const end = pregnancyRemindersEndAt(dueDate);
  const planned: Omit<ChecklistReminder, 'id'>[] = [];
  for (let day = 0; day < CHECKLIST_REMINDER_HORIZON_DAYS; day++) {
    for (const item of CHECKLIST_REMINDER_ITEMS) {
      if (day === 0 && !state.unchecked.includes(item.id)) continue;
      for (const slot of item.slots) {
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, slot.hour, slot.minute, 0, 0);
        if (at.getTime() < now.getTime() + MIN_LEAD_MS) continue;
        if (end && at.getTime() >= end.getTime()) continue;
        planned.push({ itemId: item.id, at, title: CHECKLIST_REMINDER_TITLE, body: slot.body });
      }
    }
  }
  planned.sort((a, b) => a.at.getTime() - b.at.getTime());
  return planned
    .slice(0, ALL_CHECKLIST_REMINDER_IDS.length)
    .map((r, i) => ({ id: CHECKLIST_REMINDER_ID_BASE + i, ...r }));
}

export interface ChecklistBellSlot {
  /** checklist-YYYY-MM-DD-<item>-HH: one bell entry per slot, never duplicated. */
  id: string;
  itemId: number;
  at: Date;
  title: string;
  body: string;
}

/**
 * The phone reminders run no app code when they fire, so they never reach
 * the in-app bell. This lists today's reminder slots that have already
 * passed for items still unchecked, for the bell to catch up on when the
 * app opens: the same times (local), title and text as the phone reminders.
 * Nothing when reminders are off, never a slot from an earlier day, none
 * from before `notBefore` (when the account was created), and none from
 * the end of the pregnancy reminders (after `dueDate`) on.
 */
export function dueChecklistBellSlots(
  now: Date,
  state: ChecklistState,
  enabled: boolean,
  notBefore?: Date | null,
  dueDate?: Date | null,
): ChecklistBellSlot[] {
  if (!enabled) return [];
  const end = pregnancyRemindersEndAt(dueDate);
  const slots: ChecklistBellSlot[] = [];
  for (const item of CHECKLIST_REMINDER_ITEMS) {
    if (!state.unchecked.includes(item.id)) continue;
    for (const slot of item.slots) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), slot.hour, slot.minute, 0, 0);
      if (at.getTime() > now.getTime()) continue;
      if (notBefore && !isNaN(notBefore.getTime()) && at.getTime() < notBefore.getTime()) continue;
      if (end && at.getTime() >= end.getTime()) continue;
      slots.push({
        id: `checklist-${localDateKey(at)}-${item.id}-${String(slot.hour).padStart(2, '0')}`,
        itemId: item.id,
        at,
        title: CHECKLIST_REMINDER_TITLE,
        body: slot.body,
      });
    }
  }
  return slots.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The phone's local calendar date as YYYY-MM-DD. The checklist resets at
 *  local midnight, so "today" must be the local date, not the UTC one. */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
