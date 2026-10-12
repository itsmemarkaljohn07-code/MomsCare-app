// reminder-scheduler.service.ts
import { Injectable } from '@angular/core';
import type { UserProfile } from './auth.service';
import type { LocalNotificationsPlugin } from '@capacitor/local-notifications';
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
  /** 'off' = the patient turned the Reminders channel off in Android
   *  settings, so scheduled reminders won't show. */
  channel: 'on' | 'off' | 'unknown';
}

/** Result of the "Send a test reminder" button. 'delivered' is only
 *  reported once the phone lists the notification as shown. */
export type TestReminderResult =
  | 'delivered'
  | 'scheduled-not-seen'
  | 'denied'
  | 'channel-off'
  | 'unavailable';

/** Result of the "Test a scheduled reminder" button. 'scheduled' is only
 *  reported once the phone lists the reminder as pending. */
export type ScheduledTestResult =
  | 'scheduled'
  | 'not-scheduled'
  | 'denied'
  | 'channel-off'
  | 'unavailable';

/** One-off reminder for the scheduled test. Inside this service's own range
 *  (990000-990099, see reminder-plan.ts) but not in ALL_REMINDER_IDS, so
 *  saving settings while it is pending doesn't cancel it. */
const SCHEDULED_TEST_ID = 990098;
/** The scheduled test fires this long after the button is pressed. */
const SCHEDULED_TEST_DELAY_MS = 60000;

/** A plugin call or import that never answered. Names the step so the
 *  console shows where the phone got stuck; never treated as "denied". */
export class ReminderTimeoutError extends Error {
  constructor(readonly step: string, ms: number) {
    super(`Reminder step "${step}" did not finish within ${ms / 1000}s`);
    this.name = 'ReminderTimeoutError';
  }
}

/** requestPermissions waits on the patient answering the dialog. */
const REQUEST_PERMISSION_TIMEOUT_MS = 20000;
/** Every other plugin call and dynamic import. */
const STEP_TIMEOUT_MS = 8000;
/** The test reminder fires this long after scheduling... */
const TEST_DELAY_MS = 3000;
/** ...and we look for it in the delivered list for up to this long. */
const DELIVERY_POLL_MS = 8000;
const DELIVERY_POLL_INTERVAL_MS = 500;

/** The plugin, wrapped. A Capacitor plugin is a Proxy that answers every
 *  property name, including `then`, so returning it bare from an async
 *  function makes the await call a native `then()` that doesn't exist and
 *  never settles. That was why the Test button hung on "Sending...". */
interface NativeNotifications {
  plugin: LocalNotificationsPlugin;
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

  /** The one requestPermissions() call in flight, shared by every caller
   *  (this service, Home's checklist reminder, appointment reminders) so
   *  two permission dialogs never race. */
  private permissionRequest: Promise<string> | null = null;
  /** Set once the patient declines the dialog in this app run, so nothing
   *  keeps asking her again. */
  private declinedThisRun = false;

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
    const unavailable: ReminderSyncResult = { scheduled: 0, permission: 'unavailable', exactAlarms: 'unknown', channel: 'unknown' };
    if (!source) return unavailable;

    const native = await this.nativePlugin();
    if (!native) return unavailable;
    const LocalNotifications = native.plugin;

    const plan = buildReminderPlan(source.notificationPrefs, source.kickReminderTime);

    // Always clear first, so edits and switch-offs take effect.
    await this.cancelOwn(LocalNotifications);
    if (plan.length === 0) return { scheduled: 0, permission: 'not-needed', exactAlarms: 'unknown', channel: 'unknown' };

    if ((await this.permission(LocalNotifications, options.requestPermission)) !== 'granted') {
      return { scheduled: 0, permission: 'denied', exactAlarms: 'unknown', channel: 'unknown' };
    }

    const channel = await this.ensureChannel(LocalNotifications);
    const notifications: any[] = plan.map(r => ({
      id: r.id,
      title: r.title,
      body: r.body,
      ...(channel !== 'unknown' ? { channelId: REMINDER_CHANNEL_ID } : {}),
      schedule: {
        on: { hour: r.hour, minute: r.minute, ...(r.weekday ? { weekday: r.weekday } : {}) },
        allowWhileIdle: true,
      },
    }));
    await this.step('schedule-reminders', () => LocalNotifications.schedule({ notifications }));

    return {
      scheduled: notifications.length,
      permission: 'granted',
      exactAlarms: await this.exactAlarmStatus(LocalNotifications),
      channel,
    };
  }

  /** Cancels this service's reminders only. Used when the patient signs out,
   *  so the next person on a shared phone isn't buzzed by hers. */
  async cancelAll(): Promise<void> {
    const native = await this.nativePlugin();
    if (native) await this.cancelOwn(native.plugin);
  }

  /**
   * Notification permission for any caller in the app. Asks only when the
   * phone says it may (prompt / prompt-with-rationale) and `mayAsk` is
   * true, never once granted, and never again after she declined in this
   * run. Concurrent callers share one in-flight request.
   */
  async ensurePermission(mayAsk: boolean): Promise<'granted' | 'denied' | 'unavailable'> {
    const native = await this.nativePlugin();
    if (!native) return 'unavailable';
    return this.permission(native.plugin, mayAsk);
  }

  /** Shows a sample reminder in a few seconds and confirms the phone
   *  actually displayed it. Throws ReminderTimeoutError if a step hangs. */
  async sendTestReminder(): Promise<TestReminderResult> {
    console.log('[reminders] step test start');
    const native = await this.nativePlugin();
    if (!native) {
      console.log('[reminders] step test unavailable');
      return 'unavailable';
    }
    const LocalNotifications = native.plugin;

    if ((await this.permission(LocalNotifications, true)) !== 'granted') {
      console.log('[reminders] step test denied');
      return 'denied';
    }

    const channel = await this.ensureChannel(LocalNotifications);
    if (channel === 'off') {
      console.log('[reminders] step test channel-off');
      return 'channel-off';
    }

    // Clear an earlier test (pending or still shown) so the delivered
    // check below can only match this one.
    await this.optionalStep('clear-previous-test', async () => {
      await LocalNotifications.cancel({ notifications: [{ id: REMINDER_IDS.test }] });
      await LocalNotifications.removeDeliveredNotifications({
        notifications: [{ id: REMINDER_IDS.test, title: '', body: '' }],
      });
    });

    await this.step('schedule-test', () => LocalNotifications.schedule({
      notifications: [{
        id: REMINDER_IDS.test,
        title: 'MomCare test reminder',
        body: 'This is a test from MomCare. Your reminders will look like this.',
        ...(channel === 'on' ? { channelId: REMINDER_CHANNEL_ID } : {}),
        schedule: { at: new Date(Date.now() + TEST_DELAY_MS), allowWhileIdle: true },
      }],
    }));

    const delivered = await this.waitForDelivered(LocalNotifications, REMINDER_IDS.test);
    console.log(`[reminders] step test ${delivered ? 'delivered' : 'scheduled-not-seen'}`);
    return delivered ? 'delivered' : 'scheduled-not-seen';
  }

  /** Schedules one reminder a minute from now through the same path as the
   *  real ones (permission, Reminders channel, allowWhileIdle), then asks
   *  the phone whether it is really pending. Lets the patient lock the
   *  phone and see a scheduled reminder arrive. Throws ReminderTimeoutError
   *  if a step hangs. */
  async scheduleTestReminder(): Promise<ScheduledTestResult> {
    console.log('[reminders] step scheduled-test start');
    const native = await this.nativePlugin();
    if (!native) return 'unavailable';
    const LocalNotifications = native.plugin;

    if ((await this.permission(LocalNotifications, true)) !== 'granted') {
      console.log('[reminders] step scheduled-test denied');
      return 'denied';
    }

    const channel = await this.ensureChannel(LocalNotifications);
    if (channel === 'off') {
      console.log('[reminders] step scheduled-test channel-off');
      return 'channel-off';
    }

    await this.optionalStep('clear-previous-scheduled-test', () =>
      LocalNotifications.cancel({ notifications: [{ id: SCHEDULED_TEST_ID }] }));

    await this.step('schedule-scheduled-test', () => LocalNotifications.schedule({
      notifications: [{
        id: SCHEDULED_TEST_ID,
        title: 'MomCare scheduled test reminder',
        body: 'This reminder was scheduled a minute ago. Your daily reminders arrive the same way.',
        ...(channel !== 'unknown' ? { channelId: REMINDER_CHANNEL_ID } : {}),
        schedule: { at: new Date(Date.now() + SCHEDULED_TEST_DELAY_MS), allowWhileIdle: true },
      }],
    }));

    const { notifications } = await this.step('get-pending', () => LocalNotifications.getPending());
    const pending = notifications.some(n => n.id === SCHEDULED_TEST_ID);
    console.log(`[reminders] step scheduled-test ${pending ? 'pending' : 'not-pending'}`);
    return pending ? 'scheduled' : 'not-scheduled';
  }

  /** True if the Reminders channel already exists on this phone. Never
   *  creates it; for callers that only want to use it when it's there. */
  async reminderChannelExists(): Promise<boolean> {
    const native = await this.nativePlugin();
    if (!native) return false;
    try {
      const { channels } = await this.step('list-channels', () => native.plugin.listChannels());
      return (channels ?? []).some(c => c.id === REMINDER_CHANNEL_ID);
    } catch (err) {
      if (err instanceof ReminderTimeoutError) throw err;
      return false;
    }
  }

  // -- internals --------------------------------------------------------

  /** Runs one plugin call or import against a timer, logging the step. */
  private async step<T>(name: string, run: () => Promise<T>, ms = STEP_TIMEOUT_MS): Promise<T> {
    console.log(`[reminders] step ${name} start`);
    try {
      const result = await this.withTimeout(name, run(), ms);
      console.log(`[reminders] step ${name} ok`);
      return result;
    } catch (err) {
      console.log(`[reminders] step ${name} ${err instanceof ReminderTimeoutError ? 'timeout' : 'error'}`);
      throw err;
    }
  }

  /** A step whose failure doesn't stop the flow. A timeout still throws. */
  private async optionalStep(name: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await this.step(name, run);
    } catch (err) {
      if (err instanceof ReminderTimeoutError) throw err;
      console.warn(`[reminders] step ${name} skipped:`, err);
    }
  }

  private withTimeout<T>(name: string, promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ReminderTimeoutError(name, ms)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  /** The plugin on the phone app, or null in a browser. */
  private async nativePlugin(): Promise<NativeNotifications | null> {
    const { Capacitor } = await this.step('import-core', () => import('@capacitor/core'));
    if (!Capacitor.isNativePlatform()) return null;
    const mod = await this.step('import-plugin', () => import('@capacitor/local-notifications'));
    return { plugin: mod.LocalNotifications };
  }

  private async permission(LocalNotifications: LocalNotificationsPlugin, mayAsk: boolean): Promise<'granted' | 'denied'> {
    const { display } = await this.step('check-permission', () => LocalNotifications.checkPermissions());
    console.log(`[reminders] step check-permission state ${display}`);
    if (display === 'granted') return 'granted';
    if (display !== 'prompt' && display !== 'prompt-with-rationale') return 'denied';
    if (!mayAsk || this.declinedThisRun) return 'denied';

    if (!this.permissionRequest) {
      this.permissionRequest = LocalNotifications.requestPermissions()
        .then((r: { display: string }) => r.display)
        .finally(() => { this.permissionRequest = null; });
    }
    const shared = this.permissionRequest!;
    const result = await this.step('request-permission', () => shared, REQUEST_PERMISSION_TIMEOUT_MS);
    console.log(`[reminders] step request-permission state ${result}`);
    if (result === 'granted') return 'granted';
    this.declinedThisRun = true;
    return 'denied';
  }

  /** A notification sent to a channel that doesn't exist is silently
   *  dropped on Android 8+, so make sure ours exists first, then check the
   *  patient hasn't switched it off. 'unknown' = couldn't create it, so
   *  callers fall back to the default channel rather than lose reminders. */
  private async ensureChannel(LocalNotifications: LocalNotificationsPlugin): Promise<'on' | 'off' | 'unknown'> {
    let created = true;
    try {
      await this.step('create-channel', () => LocalNotifications.createChannel({
        id: REMINDER_CHANNEL_ID,
        name: 'Reminders',
        description: 'Vitamin, hydration, kick count and weekly update reminders',
        importance: 4,
        visibility: 1,
        vibration: true,
      }));
    } catch (err) {
      if (err instanceof ReminderTimeoutError) throw err;
      created = false;
    }

    try {
      const { channels } = await this.step('list-channels', () => LocalNotifications.listChannels());
      const ours = (channels ?? []).find((c: { id: string }) => c.id === REMINDER_CHANNEL_ID);
      console.log(`[reminders] step list-channels importance ${ours ? ours.importance : 'missing'}`);
      if (ours) return ours.importance === 0 ? 'off' : 'on';
    } catch (err) {
      if (err instanceof ReminderTimeoutError) throw err;
    }
    return created ? 'on' : 'unknown';
  }

  /** True once the phone lists the notification as shown. */
  private async waitForDelivered(LocalNotifications: LocalNotificationsPlugin, id: number): Promise<boolean> {
    console.log('[reminders] step wait-delivered start');
    const deadline = Date.now() + DELIVERY_POLL_MS;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, DELIVERY_POLL_INTERVAL_MS));
      const { notifications } = await this.withTimeout(
        'get-delivered',
        LocalNotifications.getDeliveredNotifications() as Promise<{ notifications: { id: number }[] }>,
        STEP_TIMEOUT_MS,
      );
      if ((notifications ?? []).some(n => n.id === id)) return true;
    }
    return false;
  }

  private async cancelOwn(LocalNotifications: LocalNotificationsPlugin): Promise<void> {
    // Nothing pending, or the plugin can't cancel: nothing more to do.
    await this.optionalStep('cancel-own', () =>
      LocalNotifications.cancel({ notifications: ALL_REMINDER_IDS.map(id => ({ id })) }));
  }

  private async exactAlarmStatus(LocalNotifications: LocalNotificationsPlugin): Promise<'granted' | 'denied' | 'unknown'> {
    try {
      if (typeof LocalNotifications.checkExactNotificationSetting !== 'function') return 'unknown';
      const status = await this.step('check-exact-alarm', () => LocalNotifications.checkExactNotificationSetting());
      if (status?.exact_alarm === 'granted') return 'granted';
      if (status?.exact_alarm === 'denied') return 'denied';
      return 'unknown';
    } catch {
      // Reminders are already scheduled; only the advice text depends on this.
      return 'unknown';
    }
  }
}
