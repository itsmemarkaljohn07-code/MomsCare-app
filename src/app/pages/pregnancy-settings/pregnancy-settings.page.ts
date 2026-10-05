// pregnancy-settings.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Location } from '@angular/common';
import { IonicModule, ViewWillEnter } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme';
import { AuthService } from '../../services/auth.service';
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

  // Blank until the real profile loads in ionViewWillEnter -- not
  // another hardcoded "20 weeks, due Sep 2025" placeholder. clinic was
  // removed from here entirely: My Profile already owns that exact
  // field (clinicName on the same users/{uid} document), so editing it
  // in two separate settings pages would just be two UIs for one
  // value -- still confusing to edit from two places even though it's
  // the same underlying data.
  settings = {
    dueDate: '', lmpDate: '',
    calcMethod: 'lmp', weightUnit: 'kg', kickReminderTime: '',
    highRisk: 'no',
  };

  notifToggles = [
    { key: 'weeklyUpdates',        label: 'Weekly Pregnancy Updates', desc: 'Get tips and info every week',          on: true },
    { key: 'appointmentReminders', label: 'Appointment Reminders',    desc: '24 hours before each visit',            on: true },
    { key: 'vitaminReminder',      label: 'Daily Vitamin Reminder',   desc: 'Remind me to take my vitamins',         on: true },
    { key: 'kickAlerts',           label: 'Kick Count Alerts',        desc: 'Daily fetal movement reminder',         on: false },
    { key: 'hydrationReminders',   label: 'Hydration Reminders',      desc: 'Stay hydrated throughout the day',      on: false },
  ];

  /** Same 280-day formula every other page uses -- computed from
   *  dueDate, never stored as its own independently-adjustable number.
   *  The previous adjustWeek() let the week and the due date drift out
   *  of sync with each other, which is exactly the conflicting
   *  pregnancy data the app is required to avoid. */
  get pregnancyWeek(): number {
    if (!this.settings.dueDate) return 0;
    const TOTAL_DAYS = 280;
    const msPerDay = 24 * 60 * 60 * 1000;
    const dueTime = new Date(this.settings.dueDate).getTime();
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
    if (!this.settings.dueDate) return;
    const date = new Date(this.settings.dueDate);
    if (isNaN(date.getTime())) return;
    date.setDate(date.getDate() - d * 7);
    this.settings.dueDate = date.toISOString().slice(0, 10);
  }

  constructor(private location: Location, private theme: ThemeService, private authService: AuthService) {}

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
        dueDate: profile.dueDate ?? '',
        lmpDate: profile.lmpDate ?? '',
        calcMethod: profile.calcMethod ?? 'lmp',
        weightUnit: profile.weightUnit ?? 'kg',
        kickReminderTime: profile.kickReminderTime ?? '',
        highRisk: profile.highRisk ? 'yes' : 'no',
      };

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
    try {
      const notificationPrefs = {
        weeklyUpdates:        this.notifToggles.find(t => t.key === 'weeklyUpdates')!.on,
        appointmentReminders: this.notifToggles.find(t => t.key === 'appointmentReminders')!.on,
        vitaminReminder:      this.notifToggles.find(t => t.key === 'vitaminReminder')!.on,
        kickAlerts:           this.notifToggles.find(t => t.key === 'kickAlerts')!.on,
        hydrationReminders:   this.notifToggles.find(t => t.key === 'hydrationReminders')!.on,
      };
      await this.authService.updateProfile({
        dueDate: this.settings.dueDate,
        lmpDate: this.settings.lmpDate,
        calcMethod: this.settings.calcMethod as 'lmp' | 'ultrasound' | 'ivf',
        weightUnit: this.settings.weightUnit as 'kg' | 'lbs',
        kickReminderTime: this.settings.kickReminderTime,
        highRisk: this.settings.highRisk === 'yes',
        notificationPrefs,
      });
      this.showToast = true;
      setTimeout(() => (this.showToast = false), 2500);
    } catch (err) {
      console.error('Failed to save pregnancy settings:', err);
      this.saveError = "Couldn't save your changes. Please check your connection and try again.";
    } finally {
      this.isSaving = false;
    }
  }

  goBack(): void { this.location.back(); }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }
}