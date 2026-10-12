// reminder-plan.ts
//
// The scheduling RULES for the on-device reminders in Pregnancy Settings:
// which reminders exist, when they fire, what they say, and which
// notification IDs they use. There is no Angular and no Capacitor in this
// file on purpose, so every rule can be tested on its own.

export interface ReminderPrefs {
  weeklyUpdates?: boolean;
  vitaminReminder?: boolean;
  kickAlerts?: boolean;
  hydrationReminders?: boolean;
}

export interface PlannedReminder {
  id: number;
  title: string;
  body: string;
  hour: number;
  minute: number;
  /** Capacitor's Weekday: 1 = Sunday ... 7 = Saturday. Omitted = every day. */
  weekday?: number;
  /** The patient picked this time herself, so OTHER reminders move away
   *  from it, never the other way round. */
  userChosen?: boolean;
}

// Notification ID ranges used in this app. Reminders here own 990000-990099.
// Daily Checklist reminders use 991100-991199 (the old single one was
// 991001; see checklist-reminder-plan.ts), and appointment
// reminders start at 992000, so none of the three can collide, and
// cancelling one family never touches another.
export const REMINDER_IDS = {
  vitamin: 990001,
  weekly: 990002,
  kick: 990003,
  hydration: [990011, 990012, 990013],
  test: 990099,
} as const;

export const ALL_REMINDER_IDS: number[] = [
  REMINDER_IDS.vitamin,
  REMINDER_IDS.weekly,
  REMINDER_IDS.kick,
  ...REMINDER_IDS.hydration,
];

export const REMINDER_CHANNEL_ID = 'momcare-reminders';
export const DEFAULT_KICK_TIME = '20:00';

// Android only lets an app fire one "allow while idle" notification per
// 9 minutes while the phone is in Doze, and silently drops the rest.
// Keeping reminders at least this far apart avoids losing one.
export const MIN_GAP_MINUTES = 10;
const SHIFT_MINUTES = 15;

const MONDAY = 2;

/** "07:45" -> { hour: 7, minute: 45 }. Anything invalid gives the fallback. */
export function parseTime(
  value: string | null | undefined,
  fallback: { hour: number; minute: number },
): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
  if (!m) return fallback;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return fallback;
  return { hour, minute };
}

const minutesOfDay = (r: PlannedReminder): number => r.hour * 60 + r.minute;

/** Two reminders can fire on the same day unless they are on different weekdays. */
const shareADay = (a: PlannedReminder, b: PlannedReminder): boolean =>
  a.weekday == null || b.weekday == null || a.weekday === b.weekday;

const tooClose = (a: PlannedReminder, b: PlannedReminder): boolean =>
  a !== b && shareADay(a, b) && Math.abs(minutesOfDay(a) - minutesOfDay(b)) < MIN_GAP_MINUTES;

/** Moves fixed-time reminders (never the patient's own kick time) until no
 *  two reminders on the same day are closer than MIN_GAP_MINUTES. */
function separate(plan: PlannedReminder[]): PlannedReminder[] {
  const out = plan.map(r => ({ ...r }));
  for (let pass = 0; pass < 24; pass++) {
    let moved = false;
    for (const r of out) {
      if (r.userChosen) continue;
      if (out.some(other => tooClose(r, other))) {
        const next = minutesOfDay(r) + SHIFT_MINUTES;
        r.hour = Math.floor(next / 60) % 24;
        r.minute = next % 60;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

/** Turns the patient's switches into the exact list of reminders to schedule. */
export function buildReminderPlan(
  prefs: ReminderPrefs | null | undefined,
  kickTime?: string | null,
): PlannedReminder[] {
  const p = prefs ?? {};
  const plan: PlannedReminder[] = [];

  if (p.weeklyUpdates) {
    plan.push({
      id: REMINDER_IDS.weekly,
      title: 'Your weekly update',
      body: "See what's new for you and your baby this week in MomCare.",
      weekday: MONDAY, hour: 8, minute: 0,
    });
  }

  if (p.vitaminReminder) {
    plan.push({
      id: REMINDER_IDS.vitamin,
      title: 'Vitamin reminder',
      body: 'Remember your daily prenatal vitamin, as advised by your provider.',
      hour: 9, minute: 0,
    });
  }

  if (p.hydrationReminders) {
    const times = [[11, 0], [14, 0], [17, 0]];
    times.forEach(([hour, minute], i) => {
      plan.push({
        id: REMINDER_IDS.hydration[i],
        title: 'Time for some water',
        body: 'A glass of water now helps you stay hydrated through the day.',
        hour, minute,
      });
    });
  }

  if (p.kickAlerts) {
    const fallback = parseTime(DEFAULT_KICK_TIME, { hour: 20, minute: 0 });
    const t = parseTime(kickTime, fallback);
    plan.push({
      id: REMINDER_IDS.kick,
      title: 'Kick count time',
      body: "Take a few minutes to count your baby's movements. Contact your provider if you notice a change.",
      hour: t.hour, minute: t.minute, userChosen: true,
    });
  }

  return separate(plan);
}