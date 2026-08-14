// app-settings.page.ts
import { Component, OnInit , OnDestroy } from '@angular/core';
import { Location } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-app-settings',
  templateUrl: './app-settings.page.html',
  styleUrls: ['./app-settings.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class AppSettingsPage implements OnInit, OnDestroy {
  animReady = false;
  showToast = false;
  darkMode  = false;
  private themeSub!: Subscription;

  s = { language: 'en', dateFormat: 'mdy', appLock: 'none' };

  notifSettings = [
    { label: 'Push Notifications', desc: 'Receive alerts on your device', on: true },
    { label: 'Email Notifications', desc: 'Weekly summaries to your email', on: false },
    { label: 'Sound & Vibration', desc: 'Play sound for reminders', on: true },
  ];

  privacySettings = [
    { label: 'Analytics', desc: 'Help improve MomsCare with usage data', on: true },
    { label: 'Crash Reports', desc: 'Auto-send error reports to improve stability', on: true },
    { label: 'Share with Provider', desc: 'Allow your healthcare provider to view data', on: false },
  ];

  saveSettings(): void {
    this.showToast = true;
    setTimeout(() => (this.showToast = false), 2500);
  }
  exportData(): void { alert('Your data export will be sent to your email within 24 hours.'); }
  clearCache(): void { alert('Cache cleared successfully.'); }
  changePassword(): void { alert('Password change feature coming soon.'); }
  deleteAccount(): void { alert('Please contact support@momscare.app to delete your account.'); }

  toggleDarkMode(): void { this.theme.toggle(); }

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