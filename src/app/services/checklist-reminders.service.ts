// checklist-reminders.service.ts
import { Injectable, EnvironmentInjector, inject, runInInjectionContext } from '@angular/core';
import { Firestore, doc } from '@angular/fire/firestore';
import { readSettledDoc } from '../shared/firestore-read';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { REMINDER_CHANNEL_ID } from './reminder-plan';
import type { LocalNotificationsPlugin } from '@capacitor/local-notifications';
import {
  ALL_CHECKLIST_REMINDER_IDS,
  ALL_UNCHECKED,
  ChecklistState,
  LEGACY_CHECKLIST_REMINDER_ID,
  buildChecklistReminderPlan,
  localDateKey,
  uncheckedReminderItems,
} from './checklist-reminder-plan';

const STEP_TIMEOUT_MS = 8000;
/** Longest loadState waits for the server before giving up. */
const CHECKLIST_READ_TIMEOUT_MS = 15000;
/** The prenatal-vitamin item in the Home checklist. */
export const VITAMIN_CHECKLIST_ITEM_ID = 1;

/**
 * Daily Checklist reminders: one-off exact notifications at each activity's
 * own times, only while that item is unchecked (rules and Android limits in
 * checklist-reminder-plan.ts). Every sync first clears the whole ID range,
 * so repeated syncs never create duplicates, and one account's reminders
 * are always replaced (or cancelled at sign-out) before another account's
 * are scheduled. Calls are queued so Home and AppComponent can't interleave
 * a cancel with a schedule.
 */
@Injectable({ providedIn: 'root' })
export class ChecklistRemindersService {
  private firestore = inject(Firestore);
  private envInjector = inject(EnvironmentInjector);
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private reminderScheduler: ReminderSchedulerService) {}

  /**
   * Makes the phone match this user's checklist. `enabled: false` (the
   * Pregnancy Settings switch is off) cancels everything. With
   * `requestPermission: false` nothing is scheduled unless notifications
   * are already allowed, and no dialog is ever shown.
   */
  sync(
    state: ChecklistState,
    options: { enabled: boolean; requestPermission: boolean },
  ): Promise<number> {
    return this.enqueue(async () => {
      const native = await this.plugin();
      if (!native) return 0;
      const LocalNotifications = native.plugin;

      await this.cancelRange(LocalNotifications);
      if (!options.enabled) {
        console.log('[checklist-reminders] off: range cleared');
        return 0;
      }
      if ((await this.reminderScheduler.ensurePermission(options.requestPermission)) !== 'granted') {
        console.log('[checklist-reminders] no permission: nothing scheduled');
        return 0;
      }

      const plan = buildChecklistReminderPlan(new Date(), state);
      if (plan.length === 0) return 0;
      const useChannel = await this.reminderScheduler.reminderChannelExists();
      await this.withTimeout('schedule', LocalNotifications.schedule({
        notifications: plan.map(r => ({
          id: r.id,
          title: r.title,
          body: r.body,
          ...(useChannel ? { channelId: REMINDER_CHANNEL_ID } : {}),
          schedule: { at: r.at, allowWhileIdle: true },
        })),
      }));
      console.log(`[checklist-reminders] scheduled ${plan.length}, first at ${plan[0].at.toString()}`);
      return plan.length;
    });
  }

  /** Clears every checklist reminder (sign-out, or switched off). */
  cancelAll(): Promise<void> {
    return this.enqueue(async () => {
      const native = await this.plugin();
      if (native) await this.cancelRange(native.plugin);
    });
  }

  /** Today's checklist for a user, read once (app start / sign-in, before
   *  Home has loaded). A saved checklist from an earlier day counts as
   *  fully unchecked: it resets every day. Waits for the connection, and
   *  if the checklist can't be read it throws (ReadUnavailableError)
   *  rather than reporting "everything unchecked", so the caller leaves
   *  the reminders already scheduled as they are. */
  async loadState(uid: string): Promise<ChecklistState> {
    const snap = await runInInjectionContext(this.envInjector, () =>
      readSettledDoc(doc(this.firestore, `users/${uid}/checklist/current`), CHECKLIST_READ_TIMEOUT_MS));
    const data = snap.exists() ? (snap.data() as any) : null;
    if (!data || data.date !== localDateKey() || !Array.isArray(data.items)) return ALL_UNCHECKED;
    // Older records only have meal/rest parents; uncheckedReminderItems
    // reads a parent marked done as all its sub-items done.
    return { unchecked: uncheckedReminderItems(data.items) };
  }

  // -- internals --------------------------------------------------------

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** The plugin on the phone app, or null in a browser. Taken from the
   *  module object, never returned bare from an async function: a Capacitor
   *  plugin is a thenable Proxy (see reminder-scheduler.service.ts). */
  private async plugin(): Promise<{ plugin: LocalNotificationsPlugin } | null> {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return null;
    const mod = await import('@capacitor/local-notifications');
    return { plugin: mod.LocalNotifications };
  }

  private async cancelRange(LocalNotifications: LocalNotificationsPlugin): Promise<void> {
    await this.withTimeout('cancel', LocalNotifications.cancel({
      notifications: [...ALL_CHECKLIST_REMINDER_IDS, LEGACY_CHECKLIST_REMINDER_ID].map(id => ({ id })),
    }));
  }

  private withTimeout<T>(step: string, promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`[checklist-reminders] ${step} timed out`)), STEP_TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
}
