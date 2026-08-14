// pregnancy-settings.page.ts
import { Component, OnInit , OnDestroy } from '@angular/core';
import { Location } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-pregnancy-settings',
  templateUrl: './pregnancy-settings.page.html',
  styleUrls: ['./pregnancy-settings.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class PregnancySettingsPage implements OnInit, OnDestroy {

  darkMode = false;
  private themeSub!: Subscription;
  animReady = false;
  showToast = false;

  settings = {
    pregnancyWeek: 20, dueDate: '2025-09-15', lmpDate: '2024-12-09',
    calcMethod: 'lmp', weightUnit: 'kg', kickReminderTime: '20:00',
    clinic: 'St. Luke\'s Medical Center', highRisk: 'no',
  };

  notifToggles = [
    { label: 'Weekly Pregnancy Updates', desc: 'Get tips and info every week', on: true },
    { label: 'Appointment Reminders', desc: '24 hours before each visit', on: true },
    { label: 'Daily Vitamin Reminder', desc: 'Remind me to take my vitamins', on: true },
    { label: 'Kick Count Alerts', desc: 'Daily fetal movement reminder', on: false },
    { label: 'Hydration Reminders', desc: 'Stay hydrated throughout the day', on: false },
  ];

  get trimester(): string {
    if (this.settings.pregnancyWeek <= 13) return '1st';
    if (this.settings.pregnancyWeek <= 26) return '2nd';
    return '3rd';
  }
  get pregnancyProgress(): number {
    return Math.min(100, Math.round((this.settings.pregnancyWeek / 40) * 100));
  }

  adjustWeek(d: number): void {
    this.settings.pregnancyWeek = Math.min(42, Math.max(1, this.settings.pregnancyWeek + d));
  }

  saveSettings(): void {
    try { localStorage.setItem('momscare_preg_settings', JSON.stringify(this.settings)); } catch {}
    this.showToast = true;
    setTimeout(() => (this.showToast = false), 2500);
  }

  constructor(private location: Location, private theme: ThemeService) {}
  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }
  goBack(): void { this.location.back(); }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }
}