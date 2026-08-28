// profile.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';
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

  darkMode      = false;
  pregnancyWeek = 20;
  dueDate       = new Date('2025-09-15');

  private themeSub!: Subscription;

  // ── Bottom nav active state (Profile is now reachable from the nav bar) ──
  activeTab = 'profile';

  // ── Selected avatar (reads from localStorage) ──
  get selectedAvatar() {
    try {
      const saved = localStorage.getItem('momscare_avatar');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { emoji: '🐻', bgColor: '#e07eb8' };
  }

  // ── Days until due ──
  get daysUntilDue(): number {
    const diff = this.dueDate.getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

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

  toggleDarkMode(): void {
    this.theme.toggle();
  }

  async signOut(): Promise<void> {
    try {
      await this.authService.logout();
    } catch {}
    this.router.navigate(['/welcome'], { replaceUrl: true });
  }

  constructor(
    private router: Router,
    private theme: ThemeService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }

  navigate(route: string): void {
    this.router.navigate([route]);
  }
}