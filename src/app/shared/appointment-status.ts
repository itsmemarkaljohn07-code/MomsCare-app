// appointment-status.ts
//
// When an appointment counts as Missed in the patient app. The stored
// status stays as the clinic set it; the app only shows "Missed" for an
// appointment still marked upcoming whose start time passed more than
// MISSED_GRACE_MINUTES ago (the clinic marks attended ones Completed).

/** How long after the start time an appointment still counts as upcoming. */
export const MISSED_GRACE_MINUTES = 30;

/** Same 12-hour time parsing already proven in the admin dashboard's
 *  appointment form — turns "9:30 AM" + "2026-09-15" into a real Date. */
export function parseApptDateTime(date: string, time: string): Date | null {
  const match = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  const [, hStr, mStr, suffix] = match;
  let hour = parseInt(hStr, 10);
  const minute = parseInt(mStr, 10);
  if (suffix.toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (suffix.toUpperCase() === 'AM' && hour === 12) hour = 0;
  const d = new Date(date + 'T00:00:00');
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** True when the appointment is Missed: stored as missed, or still
 *  upcoming more than MISSED_GRACE_MINUTES after it started. Without a
 *  readable time, it is missed once its day has passed. */
export function isMissedAppointment(appt: { status: string; date: string; time?: string | null }, now: Date): boolean {
  if (appt.status === 'missed') return true;
  if (appt.status !== 'upcoming') return false;
  const start = parseApptDateTime(appt.date, appt.time ?? '');
  if (start && !isNaN(start.getTime())) {
    return now.getTime() > start.getTime() + MISSED_GRACE_MINUTES * 60 * 1000;
  }
  const dayEnd = new Date(appt.date + 'T00:00:00');
  if (isNaN(dayEnd.getTime())) return false;
  dayEnd.setDate(dayEnd.getDate() + 1);
  return now.getTime() >= dayEnd.getTime();
}
