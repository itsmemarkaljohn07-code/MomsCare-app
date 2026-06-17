import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ProfilePage implements OnInit, OnDestroy {

  darkMode = false;
  private themeSub!: Subscription;

  toggleDarkMode(): void {
    this.theme.toggle();
  }

  pregnancyWeek = 20;
  dueDate = new Date('2025-09-15');

  babySizes: Record<number, { emoji: string; fruit: string }> = {
    8:  { emoji: '🫐', fruit: 'blueberry' },
    10: { emoji: '🍓', fruit: 'strawberry' },
    12: { emoji: '🍋', fruit: 'lime' },
    14: { emoji: '🍑', fruit: 'peach' },
    16: { emoji: '🥑', fruit: 'avocado' },
    18: { emoji: '🥕', fruit: 'sweet potato' },
    20: { emoji: '🥭', fruit: 'mango' },
    22: { emoji: '🌽', fruit: 'corn' },
    24: { emoji: '🌽', fruit: 'corn' },
    26: { emoji: '🥬', fruit: 'lettuce head' },
    28: { emoji: '🍆', fruit: 'eggplant' },
    30: { emoji: '🥦', fruit: 'broccoli' },
    32: { emoji: '🥥', fruit: 'coconut' },
    34: { emoji: '🍍', fruit: 'pineapple' },
    36: { emoji: '🥬', fruit: 'romaine lettuce' },
    38: { emoji: '🎃', fruit: 'small pumpkin' },
    40: { emoji: '🍉', fruit: 'watermelon' },
  };

  get babySize() {
    const weeks = [8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40];
    let closest = weeks[0];
    for (const w of weeks) { if (this.pregnancyWeek >= w) closest = w; }
    return this.babySizes[closest];
  }

  get pregnancyProgress(): number {
    return Math.min(100, Math.round((this.pregnancyWeek / 40) * 100));
  }

  get trimester(): string {
    if (this.pregnancyWeek <= 13) return '1st Trimester';
    if (this.pregnancyWeek <= 26) return '2nd Trimester';
    return '3rd Trimester';
  }

  settingsItems = [
    { label: 'My Profile',          icon: 'person',   svgPath: null, route: '/profile-edit' },
    { label: 'Pregnancy Settings',  icon: 'baby',     svgPath: null, route: '/pregnancy-settings' },
    { label: 'Medical Records',     icon: 'document', svgPath: null, route: '/records' },
    { label: 'Baby Development',    icon: 'baby',     svgPath: null, route: '/development' },
    { label: 'Appointments',        icon: 'calendar', svgPath: null, route: '/appointments' },
    { label: 'App Settings',        icon: 'settings', svgPath: null, route: '/settings' },
    { label: 'Reminders',           icon: 'bell',     svgPath: null, route: '/reminders' },
    { label: 'Graphs & Reports',    icon: 'chart',    svgPath: null, route: '/reports' },
    { label: 'Claim Your Referral', icon: 'gift',     svgPath: null, route: '/referral' },
    { label: 'About DailyMom',      icon: 'info',     svgPath: null, route: '/about' },
  ];

  constructor(private router: Router, private theme: ThemeService) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe((val: boolean) => this.darkMode = val);
  }

  ngOnDestroy(): void {
    this.themeSub.unsubscribe();
  }

  navigate(route: string, tab?: string): void {
    this.router.navigate([route], {
      queryParams: tab ? { tab } : {}
    });
  }

  goBack(): void {
    console.log('Go back');
  }
}