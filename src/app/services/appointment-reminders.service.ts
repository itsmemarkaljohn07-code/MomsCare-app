import { Injectable } from '@angular/core';
import { NotificationsService } from './notifications.service';
import { AppointmentRecord } from './appointments.service';

// Distinct numeric range from CHECKLIST_REMINDER_ID (991001), so the
// two reminder systems never collide on the same native notification ID.
const REMINDER_ID_BASE = 992000;

function hashToOffset(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 100000;
}

/** Same 12-hour time parsing already proven in the admin dashboard's
 *  appointment form — turns "9:30 AM" + "2026-09-15" into a real Date. */
function parseApptDateTime(date: string, time: string): Date | null {
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

@Injectable({ providedIn: 'root' })
export class AppointmentRemindersService {
  private scheduledIds: number[] = [];
  private currentUid: string | null = null;

  constructor(private notificationsService: NotificationsService) {}

  setUid(uid: string | null): void {
    this.currentUid = uid;
  }

  /** Recomputes reminders for the current set of upcoming appointments.
   *  Cancels everything this service previously scheduled, then
   *  schedules fresh reminders — the simplest way to stay correct when
   *  an appointment is rescheduled or cancelled elsewhere (e.g. from
   *  the admin dashboard), without needing to diff old vs new state. */
  async syncReminders(appointments: AppointmentRecord[]): Promise<void> {
    await this.cancelAll();
    const upcoming = appointments.filter(a => a.status === 'upcoming' && a.id);
    for (const appt of upcoming) {
      await this.scheduleForAppointment(appt);
    }
  }

  private async scheduleForAppointment(appt: AppointmentRecord): Promise<void> {
    const apptDateTime = parseApptDateTime(appt.date, appt.time);
    if (!apptDateTime) return;

    const now = new Date();
    const offset = hashToOffset(appt.id!);
    const dayBeforeId = REMINDER_ID_BASE + offset * 2;
    const sameDayId   = REMINDER_ID_BASE + offset * 2 + 1;

    const dayBefore = new Date(apptDateTime);
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setHours(9, 0, 0, 0);

    const sameDay = new Date(apptDateTime.getTime() - 2 * 60 * 60 * 1000); // 2h before

    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
          const req = await LocalNotifications.requestPermissions();
          if (req.display !== 'granted') return;
        }

        const notifications: any[] = [];
        if (dayBefore > now) {
          notifications.push({
            id: dayBeforeId,
            title: 'Appointment Tomorrow',
            body: `${appt.label} with ${appt.doctor} tomorrow at ${appt.time}`,
            schedule: { at: dayBefore },
          });
        }
        if (sameDay > now) {
          notifications.push({
            id: sameDayId,
            title: 'Appointment Today',
            body: `${appt.label} with ${appt.doctor} today at ${appt.time}`,
            schedule: { at: sameDay },
          });
        }
        if (notifications.length > 0) {
          await LocalNotifications.schedule({ notifications });
          this.scheduledIds.push(...notifications.map(n => n.id));
        }
        return;
      }
    } catch {
      // Plugin not available — fall through to the in-app fallback below.
    }

    // Web fallback: create an in-app notification once per day if the
    // appointment is today or tomorrow, deduped via localStorage so it
    // doesn't repeat every time the app reloads on the same day.
    if (!this.currentUid) return;

    const todayIso    = now.toISOString().slice(0, 10);
    const tomorrowIso = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
    const isToday    = appt.date === todayIso;
    const isTomorrow = appt.date === tomorrowIso;

    if (isToday || isTomorrow) {
      const flagKey = `momscare_appt_reminder_${appt.id}_${todayIso}`;
      if (localStorage.getItem(flagKey)) return;
      try {
        await this.notificationsService.createNotification(this.currentUid, {
          icon: '📅',
          title: isToday ? 'Appointment Today' : 'Appointment Tomorrow',
          message: `${appt.label} with ${appt.doctor} ${isToday ? 'today' : 'tomorrow'} at ${appt.time}`,
          route: '/appointments',
        });
        localStorage.setItem(flagKey, '1');
      } catch (err) {
        console.error('Failed to send appointment reminder notification:', err);
      }
    }
  }

  private async cancelAll(): Promise<void> {
    if (this.scheduledIds.length === 0) return;
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        await LocalNotifications.cancel({
          notifications: this.scheduledIds.map(id => ({ id })),
        });
      }
    } catch {
      // Plugin not installed — nothing to cancel.
    } finally {
      this.scheduledIds = [];
    }
  }
}