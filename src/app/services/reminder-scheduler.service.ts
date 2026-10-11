// reminder-scheduler.service.ts
import { Injectable } from '@angular/core';
import type { UserProfile } from './auth.service';
import {
  ALL_REMINDER_IDS,
  REMINDER_CHANNEL_ID,
  REMINDER_IDS,
  buildReminderPlan,
} from './reminder-plan';

/** Just the two profile fields the reminders depend on. */
export type ReminderSource = Pick<UserProfile, 'notificationPrefs' | 'kickReminderTime'>;

export interface ReminderSyncResult {
  /** How many reminders are now scheduled on this phone. */
  scheduled: number;
  /** 'unavailable' = not running as the phone app (e.g. in a browser).
   *  'not-needed' = every reminder is switched off. */
  permission: 'granted' | 'denied' | 'unavailable' | 'not-needed';
  /** Android 12+ delivers scheduled reminders late unless the
   *  "Alarms & reminders" setting is allowed for the app. */
  exactAlarms: 'granted' | 'denied' | 'unknown';
}

/**
 * Schedules the vitamin, hydration, kick-count and weekly-update reminders
 * from the patient's saved switches, using on-device local notifications
 * (no server, so it works on the Spark plan). The Home checklist reminder
 * and appointment reminders are separate and are never touched here: the
 * ID ranges don't overlap (see reminder-plan.ts).
 */
@Injectable({ providedIn: 'root' })
export class ReminderSchedulerService {

  /**
   * Makes the phone match the patient's saved switches: clears this
   * service's reminders, then schedules whatever is switched on.
   *
   * Pass `requestPermission: false` for background re-syncs (app start), so
   * the permission dialog only ever appears when the patient just asked
   * for reminders. A missing profile does NOTHING: it must never be read as
   * "everything is off" and wipe reminders she set up.
   */
  async sync(
    source: ReminderSource | null | undefined,
    options: { requestPermission: boolean },
  ): Promise<ReminderSyncResult> {
    const unavailable: ReminderSyncResult = { scheduled: 0, permission: 'unavailable', exactAlarms: 'unknown' };
    if (!source) return unavailable;

    const LocalNotifications = await this.nativePlugin();
    if (!LocalNotifications) return unavailable;

    const plan = buildReminderPlan(source.notificationPrefs, source.kickReminderTime);

    // Always clear first, so edits and switch-offs take effect.
    await this.cancelOwn(LocalNotifications);
    if (plan.length === 0) return { scheduled: 0, permission: 'not-needed', exactAlarms: 'unknown' };

    if (!(await this.hasPermission(LocalNotifications, options.requestPermission))) {
      return { scheduled: 0, permission: 'denied', exactAlarms: 'unknown' };
    }

    const channelOk = await this.ensureChannel(LocalNotifications);
    const notifications: any[] = plan.map(r => ({
      id: r.id,
      title: r.title,
      body: r.body,
      ...(channelOk ? { channelId: REMINDER_CHANNEL_ID } : {}),
      schedule: {
        on: { hour: r.hour, minute: r.minute, ...(r.weekday ? { weekday: r.weekday } : {}) },
        allowWhileIdle: true,
      },
    }));
    await LocalNotifications.schedule({ notifications });

    return {
      scheduled: notifications.length,
      permission: 'granted',
      exactAlarms: await this.exactAlarmStatus(LocalNotifications),
    };
  }

  /** Cancels this service's reminders only. Used when the patient signs out,
   *  so the next person on a shared phone isn't buzzed by hers. */
  async cancelAll(): Promise<void> {
    const LocalNotifications = await this.nativePlugin();
    if (LocalNotifications) await this.cancelOwn(LocalNotifications);
  }

  /** Shows a sample reminder in a few seconds, to confirm permission, the
   *  notification channel and the icon all work on this phone. */
  async sendTestReminder(): Promise<'sent' | 'denied' | 'unavailable'> {
    const LocalNotifications = await this.nativePlugin();
    if (!LocalNotifications) return 'unavailable';
    if (!(await this.hasPermission(LocalNotifications, true))) return 'denied';

    const channelOk = await this.ensureChannel(LocalNotifications);
    await LocalNotifications.schedule({
      notifications: [{
        id: REMINDER_IDS.test,
        title: 'MomCare reminders are on',
        body: 'This is a test. Your reminders will look like this.',
        ...(channelOk ? { channelId: REMINDER_CHANNEL_ID } : {}),
        schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true },
      }],
    });
    return 'sent';
  }

  // -- internals --------------------------------------------------------

  /** The plugin on the phone app, or null in a browser / if it's missing. */
  private async nativePlugin(): Promise<any | null> {
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return null;
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      return LocalNotifications;
    } catch {
      return null;
    }
  }

  private async hasPermission(LocalNotifications: any, mayAsk: boolean): Promise<boolean> {
    try {
      let perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted' && mayAsk) {
        perm = await LocalNotifications.requestPermissions();
      }
      return perm.display === 'granted';
    } catch {
      return false;
    }
  }

  /** A notification sent to a channel that doesn't exist is silently
   *  dropped on Android 8+, so make sure ours exists first. If creating it
   *  fails we fall back to the default channel rather than lose reminders. */
  private async ensureChannel(LocalNotifications: any): Promise<boolean> {
    try {
      await LocalNotifications.createChannel({
        id: REMINDER_CHANNEL_ID,
        name: 'Reminders',
        description: 'Vitamin, hydration, kick count and weekly update reminders',
        importance: 4,
        visibility: 1,
        vibration: true,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async cancelOwn(LocalNotifications: any): Promise<void> {
    try {
      await LocalNotifications.cancel({ notifications: ALL_REMINDER_IDS.map(id => ({ id })) });
    } catch {
      // Nothing pending, or the plugin can't cancel: nothing more to do.
    }
  }

  private async exactAlarmStatus(LocalNotifications: any): Promise<'granted' | 'denied' | 'unknown'> {
    try {
      if (typeof LocalNotifications.checkExactNotificationSetting !== 'function') return 'unknown';
      const status = await LocalNotifications.checkExactNotificationSetting();
      if (status?.exact_alarm === 'granted') return 'granted';
      if (status?.exact_alarm === 'denied') return 'denied';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }
}