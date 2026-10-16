// pregnancy-settings.page.ts
import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Location } from '@angular/common';
import { IonicModule, ViewWillEnter, ViewWillLeave } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme';
import { AuthService, UserProfile } from '../../services/auth.service';
import { SaveFeedbackService } from '../../services/save-feedback.service';
import { ProfileStoreService } from '../../services/profile-store.service';
import { McDropdownComponent, McDropdownOption } from '../../shared/mc-dropdown/mc-dropdown.component';
import { McDatepickerComponent } from '../../shared/mc-datepicker/mc-datepicker.component';
import { toDateInputValue, fromDateInputValue, formatLocalDate, parseStoredDate } from '../../shared/date-utils';
import { pregnancyStatus } from '../../shared/pregnancy-status';
import { PregnancySettingsForm, pregnancySettingsChanges } from '../../shared/profile-changes';
import {
  ReminderSchedulerService,
  ReminderSyncResult,
  ReminderTimeoutError,
  ScheduledTestResult,
  TestReminderResult,
} from '../../services/reminder-scheduler.service';
import { DEFAULT_KICK_TIME } from '../../services/reminder-plan';
import { ChecklistRemindersService } from '../../services/checklist-reminders.service';
import { PushNotificationsService } from '../../services/push-notifications.service';
import { Subscription } from 'rxjs';

/** What the note under the reminders card says after "Test". */
const TEST_MESSAGES: Record<TestReminderResult, string> = {
  'delivered': 'Test reminder delivered. You should see it in your notifications.',
  'scheduled-not-seen': "The reminder was scheduled but hasn't appeared yet. Check that notifications and the Reminders channel are on and Do Not Disturb is off, then try again.",
  'denied': 'Notifications are turned off for MomCare. Open Settings > Apps > MomCare > Notifications and turn them on.',
  'channel-off': 'The Reminders notification channel is turned off. Open Settings > Apps > MomCare > Notifications > Reminders and turn it on.',
  'unavailable': 'Test reminders work in the MomCare phone app, not in the browser.',
};
/** What the note says after "Test a scheduled reminder". */
const SCHEDULED_TEST_MESSAGES: Record<ScheduledTestResult, string> = {
  'scheduled': 'Scheduled. It should arrive in about a minute. You can lock your phone.',
  'not-scheduled': 'The reminder was not scheduled on this phone. Please try again.',
  'denied': TEST_MESSAGES['denied'],
  'channel-off': TEST_MESSAGES['channel-off'],
  'unavailable': TEST_MESSAGES['unavailable'],
};
const TEST_TIMEOUT_MESSAGE = "Your phone didn't respond in time. Please try again. If it keeps happening, restart the app.";
const PUSH_DENIED_MESSAGE = "Updates from your care team can't reach this phone because notifications are turned off for MomCare. Turn them on in Settings > Apps > MomCare > Notifications, then save again.";
const PUSH_ERROR_MESSAGE = "We couldn't set up updates from your care team on this phone. Please check your connection and save again.";
const TEST_ERROR_MESSAGE = 'Something went wrong sending the test reminder. Please try again.';

@Component({
  selector: 'app-pregnancy-settings',
  templateUrl: './pregnancy-settings.page.html',
  styleUrls: ['./pregnancy-settings.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, McDropdownComponent, McDatepickerComponent],
})
export class PregnancySettingsPage implements OnInit, OnDestroy, ViewWillEnter, ViewWillLeave {

  darkMode = false;
  private themeSub!: Subscription;
  animReady = false;
  isSaving  = false;
  readonly calcMethodOptions: McDropdownOption[] = [
    { value: 'lmp', label: 'Last Menstrual Period (LMP)' },
    { value: 'ultrasound', label: 'Ultrasound Dating' },
    { value: 'ivf', label: 'IVF / Transfer Date' },
  ];
  readonly highRiskOptions: McDropdownOption[] = [
    { value: 'no', label: 'No' },
    { value: 'yes', label: 'Yes — monitoring closely' },
  ];
  readonly weightUnitOptions: McDropdownOption[] = [
    { value: 'kg', label: 'Kilograms (kg)' },
    { value: 'lbs', label: 'Pounds (lbs)' },
  ];
  saveError = '';
  isTesting = false;
  isTestingScheduled = false;
  // Plain-language result of setting up reminders on this phone, shown
  // under the Notifications card (blocked permission, how many were set...).
  reminderNote = '';

  // Blank until the real profile loads in ionViewWillEnter -- not
  // another hardcoded "20 weeks, due Sep 2025" placeholder. clinic was
  // removed from here entirely: My Profile already owns that exact
  // field (clinicName on the same users/{uid} document), so editing it
  // in two separate settings pages would just be two UIs for one
  // value -- still confusing to edit from two places even though it's
  // the same underlying data.
  // The dropdowns start empty (not LMP / kg / No), so nothing on screen
  // looks like saved data before the profile has loaded.
  settings = {
    dueDate: '', lmpDate: '',
    calcMethod: '', weightUnit: '', kickReminderTime: DEFAULT_KICK_TIME,
    highRisk: '',
  };

  /** 'ready' once the saved profile filled the form; only then can it be
   *  edited and saved. 'failed' after PROFILE_LOAD_TIMEOUT_MS, with Retry;
   *  'missing' if the server says there is no profile. */
  loadState: 'loading' | 'ready' | 'failed' | 'missing' = 'loading';
  get isLoaded(): boolean { return this.loadState === 'ready'; }
  /** Bumped on every load and when the page is left. */
  private visit = 0;

  // The form as it was loaded on this visit. Save sends only the fields
  // that differ from it, so an untouched field (e.g. a date stored at
  // registration) is never rewritten, shifted or reset.
  private loaded: PregnancySettingsForm = { ...this.settings, notificationPrefs: {} };
  /** The week stepper, due date, LMP and calculation method are locked
   *  until Edit Settings (like Edit Profile). Weight unit, high-risk, kick
   *  time and the notification switches are always editable. */
  editMode = false;

  notifToggles = [
    // Descriptions state when each one really fires. Weekly and vitamin
    // start OFF: reminders are opt-in, so nothing is scheduled (and no
    // permission asked for) until the patient switches one on and saves.
    { key: 'weeklyUpdates',        label: 'Weekly Pregnancy Updates', desc: 'Every Monday morning',                          on: false },
    { key: 'appointmentReminders', label: 'Appointment Reminders',    desc: 'The day before and 2 hours before each visit',  on: true },
    { key: 'vitaminReminder',      label: 'Daily Vitamin Reminder',   desc: 'Every morning, around 9:00 AM',                 on: false },
    { key: 'kickAlerts',           label: 'Kick Count Alerts',        desc: 'Every day at the time you choose below',        on: false },
    { key: 'hydrationReminders',   label: 'Hydration Reminders',      desc: 'Three a day, around 11 AM, 2 PM and 5 PM',      on: false },
    { key: 'checklistReminders',   label: 'Daily Checklist Reminders', desc: 'Every 2 hours, 9 AM to 9 PM, while items are unchecked', on: true },
    { key: 'clinicUpdates',        label: 'Updates from my care team', desc: 'Messages from your doctor or clinic, sent to this phone', on: true },
  ];

  /** Same 280-day formula every other page uses -- computed from
   *  dueDate, never stored as its own independently-adjustable number.
   *  The previous adjustWeek() let the week and the due date drift out
   *  of sync with each other, which is exactly the conflicting
   *  pregnancy data the app is required to avoid. */
  get pregnancyWeek(): number {
    // The shared formula, so this preview matches Home exactly.
    return pregnancyStatus(parseStoredDate(fromDateInputValue(this.settings.dueDate))).week;
  }

  get trimester(): string {
    if (this.pregnancyWeek <= 13) return '1st';
    if (this.pregnancyWeek <= 26) return '2nd';
    return '3rd';
  }
  get pregnancyProgress(): number {
    return Math.min(100, Math.round((this.pregnancyWeek / 40) * 100));
  }

  /** Repurposed: the stepper used to nudge a raw, independently-stored
   *  week number. Now it nudges the due date by a week in the opposite
   *  direction instead (one week further along = due date one week
   *  sooner), so the displayed week still moves the way the +/- button
   *  visually suggests, without ever creating a second stored value
   *  that could disagree with the due date. */
  adjustWeek(d: number): void {
    const iso = fromDateInputValue(this.settings.dueDate);
    if (!iso) return;
    const date = new Date(iso);
    date.setDate(date.getDate() - d * 7);
    this.settings.dueDate = formatLocalDate(date);
  }

  constructor(
    private location: Location,
    private theme: ThemeService,
    private authService: AuthService,
    private reminders: ReminderSchedulerService,
    private checklistReminders: ChecklistRemindersService,
    private push: PushNotificationsService,
    private zone: NgZone,
    private feedback: SaveFeedbackService,
    private profileStore: ProfileStoreService,
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }

  /** Ionic keeps this page's instance alive when navigating away and
   *  back, so OnInit alone wouldn't re-fire -- same reasoning as
   *  profile.page.ts and profile-edit.page.ts. */
  ionViewWillEnter(): void {
    // Every visit starts locked (see editMode).
    this.editMode = false;
    void this.loadProfile();
  }

  /** Edit Settings unlocks the dates and calculation method; Cancel Editing
   *  locks them again and puts back the last loaded/saved values. */
  toggleEdit(): void {
    if (!this.isLoaded) return;
    if (this.editMode) {
      this.settings.dueDate = this.loaded.dueDate;
      this.settings.lmpDate = this.loaded.lmpDate;
      this.settings.calcMethod = this.loaded.calcMethod;
    }
    this.editMode = !this.editMode;
  }

  /** A load still running when the page is left is ignored. */
  ionViewWillLeave(): void {
    this.visit++;
  }

  retryLoad(): void {
    this.profileStore.retry();
    void this.loadProfile();
  }

  /** Fills the form from the saved profile once per visit, so a live update
   *  never overwrites what is being edited. Waits for the profile to really
   *  load (ProfileStoreService.whenLoaded): until then the form is locked
   *  and Save is disabled, so defaults can never be saved over real data. */
  private async loadProfile(): Promise<void> {
    const visit = ++this.visit;
    this.loadState = 'loading';
    let profile: UserProfile | null;
    try {
      profile = await this.profileStore.whenLoaded();
    } catch (err: any) {
      if (visit !== this.visit) return;
      console.error('Failed to load pregnancy settings:', err?.reason ?? err);
      this.loadState = 'failed';
      return;
    }
    if (visit !== this.visit) return;
    if (!profile) {
      this.loadState = 'missing';
      return;
    }
    this.applyProfile(profile);
    this.loadState = 'ready';
  }

  private applyProfile(profile: UserProfile): void {
    this.settings = {
      dueDate: toDateInputValue(profile.dueDate),
      lmpDate: toDateInputValue(profile.lmpDate),
      calcMethod: profile.calcMethod ?? 'lmp',
      weightUnit: profile.weightUnit ?? 'kg',
      kickReminderTime: profile.kickReminderTime || DEFAULT_KICK_TIME,
      highRisk: profile.highRisk ? 'yes' : 'no',
    };
    if (profile.notificationPrefs) {
      const prefs = profile.notificationPrefs;
      for (const t of this.notifToggles) {
        if (t.key in prefs) t.on = (prefs as any)[t.key];
      }
    }
    this.loaded = this.currentForm();
  }

  /** The form as it stands, including the switches, for comparing with
   *  what was loaded (profile-changes.ts). */
  private currentForm(): PregnancySettingsForm {
    const notificationPrefs: Record<string, boolean> = {};
    for (const t of this.notifToggles) notificationPrefs[t.key] = t.on;
    return { ...this.settings, notificationPrefs };
  }

  /** Saves to the same users/{uid} document every other real-data page
   *  already reads, via AuthService -- not a separate
   *  momscare_preg_settings localStorage key. On failure, shows an
   *  error instead of silently claiming success. */
  async saveSettings(): Promise<void> {
    // Never save the placeholder form over the saved profile.
    if (this.isSaving || !this.isLoaded) return;
    this.isSaving = true;
    this.saveError = '';
    this.reminderNote = '';
    try {
      const current = this.currentForm();
      const notificationPrefs = current.notificationPrefs;
      // Only the fields changed on this visit, so nothing untouched is
      // ever rewritten (or reset to a default shown for a missing field).
      const changes = pregnancySettingsChanges(this.loaded, current);
      if (Object.keys(changes).length === 0) {
        void this.feedback.show('No changes to save.', 'info');
      } else {
        // Shared feedback: success only once the write resolves, a reason on
        // failure, and an "offline, will sync" note if it doesn't finish in time.
        const result = await this.feedback.save(() => this.authService.updateProfile(changes));
        if (result.outcome === 'failed') {
          this.saveError = result.message;
          return;
        }
        this.loaded = current;
      }
      // Saved: the dates lock again.
      this.editMode = false;
      // Reminders live on this phone, so they follow the saved switches
      // even while the write is still waiting to reach the server.
      await this.updateReminders(notificationPrefs);
      await this.updateChecklistReminders(notificationPrefs['checklistReminders']);
      await this.updatePush(notificationPrefs['clinicUpdates']);
    } catch (err) {
      console.error('Failed to update this phone after saving:', err);
    } finally {
      this.isSaving = false;
    }
  }

  /** Makes this phone's reminders match the switches that were just saved.
   *  Runs AFTER the save succeeded and never throws, so a notification
   *  problem can't make a successful save look like a failure. */
  private async updateReminders(notificationPrefs: any): Promise<void> {
    const anyOn = ['weeklyUpdates', 'vitaminReminder', 'kickAlerts', 'hydrationReminders']
      .some(k => notificationPrefs[k]);
    try {
      const result = await this.reminders.sync(
        { notificationPrefs, kickReminderTime: this.settings.kickReminderTime, dueDate: this.settings.dueDate },
        { requestPermission: true },
      );
      this.reminderNote = this.describeReminders(result, anyOn);
    } catch (err) {
      console.error('Failed to schedule reminders:', err);
      this.reminderNote = "Saved, but we couldn't set up the reminders on this phone. Please try saving again.";
    }
  }

  /** Daily Checklist reminders follow their switch: on asks for
   *  notification permission (this save is the only place that may ask)
   *  and schedules from today's checklist; off cancels them all. Never
   *  throws, for the same reason as updateReminders. */
  private async updateChecklistReminders(enabled: boolean): Promise<void> {
    try {
      const uid = this.authService.currentUid;
      if (!uid) return;
      if (!enabled) {
        await this.checklistReminders.cancelAll();
        return;
      }
      const state = await this.checklistReminders.loadState(uid);
      await this.checklistReminders.sync(state, { enabled: true, requestPermission: true, dueDate: this.settings.dueDate });
    } catch (err) {
      console.error('Failed to update checklist reminders:', err);
    }
  }

  /** "Updates from my care team": on asks for notification permission and
   *  stores this phone's push token; off removes it. Never throws. */
  private async updatePush(enabled: boolean): Promise<void> {
    const uid = this.authService.currentUid;
    if (!uid) return;
    try {
      if (!enabled) {
        await this.push.unregister(uid);
        return;
      }
      if ((await this.push.register(uid, true)) === 'denied') {
        this.reminderNote = [this.reminderNote, PUSH_DENIED_MESSAGE].filter(Boolean).join(' ');
      }
    } catch (err) {
      console.error('Failed to set up care team updates:', err);
      this.reminderNote = [this.reminderNote, PUSH_ERROR_MESSAGE].filter(Boolean).join(' ');
    }
  }

  private describeReminders(r: ReminderSyncResult, anyOn: boolean): string {
    if (!anyOn) return '';
    if (r.permission === 'unavailable') {
      return 'Saved. Reminders are delivered by the MomCare phone app, not in the browser.';
    }
    if (r.permission === 'denied') {
      return 'Saved, but notifications are blocked for MomCare on this phone. Turn them on in Settings > Apps > MomCare > Notifications, then save again.';
    }
    if (r.permission === 'granted' && r.channel === 'off') {
      return 'Saved, but the Reminders notification channel is turned off. Open Settings > Apps > MomCare > Notifications > Reminders and turn it on.';
    }
    if (r.permission === 'granted' && r.scheduled > 0) {
      const base = `${r.scheduled} reminder${r.scheduled === 1 ? '' : 's'} scheduled on this phone.`;
      return r.exactAlarms === 'denied'
        ? `${base} For on-time delivery, allow "Alarms & reminders" for MomCare in your phone settings.`
        : base;
    }
    return '';
  }

  /** Shows a sample reminder in a few seconds, so the patient (or an
   *  examiner) can see reminders work without waiting for a scheduled time.
   *  Only says "delivered" once the phone has actually shown it. */
  async sendTest(): Promise<void> {
    if (this.isTesting || this.isTestingScheduled) return;
    this.isTesting = true;
    this.reminderNote = '';
    let note = TEST_ERROR_MESSAGE;
    try {
      note = TEST_MESSAGES[await this.reminders.sendTestReminder()];
    } catch (err) {
      console.error('[reminders] test reminder failed:', err);
      note = err instanceof ReminderTimeoutError ? TEST_TIMEOUT_MESSAGE : TEST_ERROR_MESSAGE;
    } finally {
      // Native plugin callbacks arrive from outside Angular; run the final
      // update in the zone so the button always returns to "Test".
      this.zone.run(() => {
        this.isTesting = false;
        this.reminderNote = note;
      });
    }
  }

  /** Schedules one reminder a minute from now, the same way the daily
   *  reminders are scheduled, so the patient can lock the phone and see it
   *  arrive. Only says "Scheduled" once the phone lists it as pending. */
  async sendScheduledTest(): Promise<void> {
    if (this.isTesting || this.isTestingScheduled) return;
    this.isTestingScheduled = true;
    this.reminderNote = '';
    let note = TEST_ERROR_MESSAGE;
    try {
      note = SCHEDULED_TEST_MESSAGES[await this.reminders.scheduleTestReminder()];
    } catch (err) {
      console.error('[reminders] scheduled test reminder failed:', err);
      note = err instanceof ReminderTimeoutError ? TEST_TIMEOUT_MESSAGE : TEST_ERROR_MESSAGE;
    } finally {
      this.zone.run(() => {
        this.isTestingScheduled = false;
        this.reminderNote = note;
      });
    }
  }

  goBack(): void { this.location.back(); }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }
}