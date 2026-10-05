import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ViewWillEnter } from '@ionic/angular';
import { AuthService, AvatarSelection } from '../../services/auth.service';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
// ViewWillEnter (not just OnInit) is deliberate: Ionic normally keeps
// this page's component instance alive in the background when you
// navigate to Avatar and back, so OnInit alone would never re-fire --
// meaning a just-saved avatar wouldn't show up here without this.
export class ProfilePage implements OnInit, OnDestroy, ViewWillEnter {

  darkMode = false;

  // Real name and due date, loaded from the signed-in user's own
  // profile in ionViewWillEnter below. 'User' is only a fallback for
  // the brief moment before that resolves, or if a name genuinely
  // isn't on file yet -- never a hardcoded person's name.
  userName = 'User';
  private dueDateIso: string | null = null;

  /** Same 280-day/40-week formula as every other page that computes
   *  this (snapshot.page.ts, insights.page.ts) -- one shared
   *  calculation, not a second one that could drift out of sync. */
  get pregnancyWeek(): number {
    if (!this.dueDateIso) return 0;
    const TOTAL_DAYS = 280;
    const msPerDay = 24 * 60 * 60 * 1000;
    const dueTime = new Date(this.dueDateIso).getTime();
    if (isNaN(dueTime)) return 0;
    const daysUntilDue = Math.round((dueTime - Date.now()) / msPerDay);
    const daysElapsed = Math.max(0, Math.min(TOTAL_DAYS, TOTAL_DAYS - daysUntilDue));
    return Math.min(40, Math.floor(daysElapsed / 7));
  }

  private themeSub!: Subscription;

  activeTab = 'profile';

  // Default shown before the real profile loads, and the fallback if
  // the user hasn't saved a custom avatar yet -- same default as
  // before, just no longer sourced from a device-local value that
  // could show one account's avatar on another account.
  selectedAvatar: AvatarSelection | { emoji: string; bgColor: string } = { emoji: '🐻', bgColor: '#e07eb8' };

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

  /** Called by Ionic every time this page becomes the active view --
   *  including returning from Avatar, where OnInit alone would not
   *  re-fire. Pulls name, due date, and avatar fresh from Firestore
   *  each time, so a just-saved avatar (or a name changed elsewhere)
   *  always shows up immediately. */
  async ionViewWillEnter(): Promise<void> {
    try {
      const profile = await this.authService.getProfile();
      this.userName = profile?.fullName || 'User';
      this.dueDateIso = profile?.dueDate ?? null;
      if (profile?.avatar) {
        this.selectedAvatar = profile.avatar;
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }

  navigate(route: string): void {
    this.router.navigate([route]);
  }
}