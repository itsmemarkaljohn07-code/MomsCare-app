import { Injectable } from '@angular/core';
import { NotificationsService } from './notifications.service';
import { AppointmentRecord } from './appointments.service';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { parseApptDateTime } from '../shared/appointment-status';

// Distinct numeric range from the checklist reminders (991100-991199), so the
// two reminder systems never collide on the same native notification ID.
const REMINDER_ID_BASE = 992000;

function hashToOffset(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 100000;
}


@Injectable({ providedIn: 'root' })
export class AppointmentRemindersService {
  private currentUid: string | null = null;

  constructor(
    private notificationsService: NotificationsService,
    private reminderScheduler: ReminderSchedulerService,
  ) {}

  setUid(uid: string | null): void {
    this.currentUid = uid;
  }

  /** Recomputes reminders for the current set of upcoming appointments.
   *  Cancels everything this service previously scheduled, then
   *  schedules fresh reminders — the simplest way to stay correct when
   *  an appointment is rescheduled or cancelled elsewhere (e.g. from
   *  the admin dashboard), without needing to diff old vs new state. */
  async syncReminders(
    appointments: AppointmentRecord[],
    options: { requestPermission: boolean } = { requestPermission: true },
  ): Promise<void> {
    // Clear every appointment reminder pending on the phone, not just the
    // ones scheduled in this session, so an appointment cancelled while the
    // app was closed doesn't keep its reminders. Only 'upcoming' ones are
    // rescheduled below; a pending cancellation request keeps the status
    // 'upcoming', so it keeps its reminders until the clinic approves.
    await this.cancelAllReminders();
    const upcoming = appointments.filter(a => a.status === 'upcoming' && a.id);
    for (const appt of upcoming) {
      await this.scheduleForAppointment(appt, options.requestPermission);
    }
  }

  /** `mayAskPermission: false` (app start) schedules only if notifications
   *  are already allowed and never shows the permission dialog. */
  private async scheduleForAppointment(appt: AppointmentRecord, mayAskPermission: boolean): Promise<void> {
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
        // Shared with every other caller, so two permission dialogs never race.
        if ((await this.reminderScheduler.ensurePermission(mayAskPermission)) !== 'granted') return;

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

  /** Cancels every appointment reminder pending on this device, including
   *  ones scheduled in an earlier session, by reading the phone's pending
   *  list. Used when the user switches appointment reminders off and before
   *  every re-sync. Only IDs at or above REMINDER_ID_BASE are touched, so
   *  the Daily Checklist reminders (991100-991199) are left alone. */
  async cancelAllReminders(): Promise<void> {
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const { notifications } = await LocalNotifications.getPending();
      const mine = notifications.filter(n => n.id >= REMINDER_ID_BASE);
      if (mine.length > 0) {
        await LocalNotifications.cancel({ notifications: mine.map(n => ({ id: n.id })) });
      }
    } catch {
      // Plugin not available -- nothing scheduled to cancel.
    }
  }
}