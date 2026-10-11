// pregnancy-settings.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Location } from '@angular/common';
import { IonicModule, ViewWillEnter } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme';
import { AuthService, UserProfile } from '../../services/auth.service';
import { toDateInputValue, fromDateInputValue, formatLocalDate } from '../../shared/date-utils';
import { ReminderSchedulerService, ReminderSyncResult } from '../../services/reminder-scheduler.service';
import { DEFAULT_KICK_TIME } from '../../services/reminder-plan';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-pregnancy-settings',
  templateUrl: './pregnancy-settings.page.html',
  styleUrls: ['./pregnancy-settings.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class PregnancySettingsPage implements OnInit, OnDestroy, ViewWillEnter {

  darkMode = false;
  private themeSub!: Subscription;
  animReady = false;
  showToast = false;
  isSaving  = false;
  saveError = '';
  isTesting = false;
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
  settings = {
    dueDate: '', lmpDate: '',
    calcMethod: 'lmp', weightUnit: 'kg', kickReminderTime: DEFAULT_KICK_TIME,
    highRisk: 'no',
  };

  // Dates as they were when the page loaded (yyyy-MM-dd). A date the user
  // doesn't change is left out of the save, so the value stored at
  // registration is never rewritten or shifted by a timezone.
  private loaded = { dueDate: '', lmpDate: '' };

  notifToggles = [
    // Descriptions state when each one really fires. Weekly and vitamin
    // start OFF: reminders are opt-in, so nothing is scheduled (and no
    // permission asked for) until the patient switches one on and saves.
    { key: 'weeklyUpdates',        label: 'Weekly Pregnancy Updates', desc: 'Every Monday morning',                          on: false },
    { key: 'appointmentReminders', label: 'Appointment Reminders',    desc: 'The day before and 2 hours before each visit',  on: true },
    { key: 'vitaminReminder',      label: 'Daily Vitamin Reminder',   desc: 'Every morning, around 9:00 AM',                 on: false },
    { key: 'kickAlerts',           label: 'Kick Count Alerts',        desc: 'Every day at the time you choose below',        on: false },
    { key: 'hydrationReminders',   label: 'Hydration Reminders',      desc: 'Three a day, around 11 AM, 2 PM and 5 PM',      on: false },
  ];

  /** Same 280-day formula every other page uses -- computed from
   *  dueDate, never stored as its own independently-adjustable number.
   *  The previous adjustWeek() let the week and the due date drift out
   *  of sync with each other, which is exactly the conflicting
   *  pregnancy data the app is required to avoid. */
  get pregnancyWeek(): number {
    const dueIso = fromDateInputValue(this.settings.dueDate);
    if (!dueIso) return 0;
    const TOTAL_DAYS = 280;
    const msPerDay = 24 * 60 * 60 * 1000;
    const dueTime = new Date(dueIso).getTime();
    if (isNaN(dueTime)) return 0;
    const daysUntilDue = Math.round((dueTime - Date.now()) / msPerDay);
    const daysElapsed = Math.max(0, Math.min(TOTAL_DAYS, TOTAL_DAYS - daysUntilDue));
    return Math.min(40, Math.floor(daysElapsed / 7));
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
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }

  /** Ionic keeps this page's instance alive when navigating away and
   *  back, so OnInit alone wouldn't re-fire -- same reasoning as
   *  profile.page.ts and profile-edit.page.ts. */
  async ionViewWillEnter(): Promise<void> {
    try {
      const profile = await this.authService.getProfile();
      if (!profile) return;

      this.settings = {
        dueDate: toDateInputValue(profile.dueDate),
        lmpDate: toDateInputValue(profile.lmpDate),
        calcMethod: profile.calcMethod ?? 'lmp',
        weightUnit: profile.weightUnit ?? 'kg',
        kickReminderTime: profile.kickReminderTime || DEFAULT_KICK_TIME,
        highRisk: profile.highRisk ? 'yes' : 'no',
      };
      this.loaded = { dueDate: this.settings.dueDate, lmpDate: this.settings.lmpDate };

      if (profile.notificationPrefs) {
        const prefs = profile.notificationPrefs;
        for (const t of this.notifToggles) {
          if (t.key in prefs) t.on = (prefs as any)[t.key];
        }
      }
    } catch (err) {
      console.error('Failed to load pregnancy settings:', err);
    }
  }

  /** Saves to the same users/{uid} document every other real-data page
   *  already reads, via AuthService -- not a separate
   *  momscare_preg_settings localStorage key. On failure, shows an
   *  error instead of silently claiming success. */
  async saveSettings(): Promise<void> {
    if (this.isSaving) return;
    this.isSaving = true;
    this.saveError = '';
    this.reminderNote = '';
    try {
      const notificationPrefs = {
        weeklyUpdates:        this.notifToggles.find(t => t.key === 'weeklyUpdates')!.on,
        appointmentReminders: this.notifToggles.find(t => t.key === 'appointmentReminders')!.on,
        vitaminReminder:      this.notifToggles.find(t => t.key === 'vitaminReminder')!.on,
        kickAlerts:           this.notifToggles.find(t => t.key === 'kickAlerts')!.on,
        hydrationReminders:   this.notifToggles.find(t => t.key === 'hydrationReminders')!.on,
      };
      const changes: Partial<UserProfile> = {
        calcMethod: this.settings.calcMethod as 'lmp' | 'ultrasound' | 'ivf',
        weightUnit: this.settings.weightUnit as 'kg' | 'lbs',
        kickReminderTime: this.settings.kickReminderTime,
        highRisk: this.settings.highRisk === 'yes',
        notificationPrefs,
      };
      if (this.settings.dueDate !== this.loaded.dueDate) {
        changes.dueDate = fromDateInputValue(this.settings.dueDate);
      }
      if (this.settings.lmpDate !== this.loaded.lmpDate) {
        changes.lmpDate = fromDateInputValue(this.settings.lmpDate);
      }
      await this.authService.updateProfile(changes);
      this.loaded = { dueDate: this.settings.dueDate, lmpDate: this.settings.lmpDate };
      this.showToast = true;
      setTimeout(() => (this.showToast = false), 2500);
      await this.updateReminders(notificationPrefs);
    } catch (err) {
      console.error('Failed to save pregnancy settings:', err);
      this.saveError = "Couldn't save your changes. Please check your connection and try again.";
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
        { notificationPrefs, kickReminderTime: this.settings.kickReminderTime },
        { requestPermission: true },
      );
      this.reminderNote = this.describeReminders(result, anyOn);
    } catch (err) {
      console.error('Failed to schedule reminders:', err);
      this.reminderNote = "Saved, but we couldn't set up the reminders on this phone. Please try saving again.";
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
    if (r.permission === 'granted' && r.scheduled > 0) {
      const base = `${r.scheduled} reminder${r.scheduled === 1 ? '' : 's'} scheduled on this phone.`;
      return r.exactAlarms === 'denied'
        ? `${base} For on-time delivery, allow "Alarms & reminders" for MomCare in your phone settings.`
        : base;
    }
    return '';
  }

  /** Shows a sample reminder in a few seconds, so the patient (or an
   *  examiner) can see reminders work without waiting for a scheduled time. */
  async sendTest(): Promise<void> {
    if (this.isTesting) return;
    this.isTesting = true;
    this.reminderNote = '';
    try {
      const result = await this.reminders.sendTestReminder();
      this.reminderNote =
        result === 'sent'   ? 'Test reminder sent. It should appear in a few seconds.'
        : result === 'denied' ? 'Notifications are blocked for MomCare on this phone. Turn them on in Settings > Apps > MomCare > Notifications.'
        : 'Test reminders work in the MomCare phone app, not in the browser.';
    } catch (err) {
      console.error('Failed to send test reminder:', err);
      this.reminderNote = "Couldn't send a test reminder on this phone.";
    } finally {
      this.isTesting = false;
    }
  }

  goBack(): void { this.location.back(); }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }
}