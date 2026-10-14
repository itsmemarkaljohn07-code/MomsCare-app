import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AuthService, AvatarSelection, UserProfile } from '../../services/auth.service';
import { ProfileStoreService } from '../../services/profile-store.service';
import { parseStoredDate } from '../../shared/date-utils';
import { pregnancyStatus } from '../../shared/pregnancy-status';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
// Ionic keeps this page alive in the background (e.g. when you go to Avatar
// and back), so it follows the live profile (ProfileStoreService) instead
// of reading it once: a just-saved avatar, name or due date shows at once.
export class ProfilePage implements OnInit, OnDestroy {

  darkMode = false;

  // Real name and due date, loaded from the signed-in user's own
  // live profile (applyProfile below). 'User' is only a fallback for
  // the brief moment before that resolves, or if a name genuinely
  // isn't on file yet -- never a hardcoded person's name.
  userName = 'User';
  private dueDate: Date | null = null;

  /** The shared formula (shared/pregnancy-status.ts), the same one every
   *  other page uses. */
  get pregnancyWeek(): number {
    return pregnancyStatus(this.dueDate).week;
  }

  private themeSub!: Subscription;
  private profileSub?: Subscription;

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
    private authService: AuthService,
    private profileStore: ProfileStoreService,
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    this.profileSub = this.profileStore.profile$.subscribe(profile => this.applyProfile(profile));
  }

  /** Name, due date and avatar from the live profile (ProfileStoreService),
   *  so a just-saved avatar, name or due date shows up immediately, even
   *  though Ionic keeps this page alive between visits. */
  private applyProfile(profile: UserProfile | null): void {
    this.userName = profile?.fullName || 'User';
    this.dueDate = parseStoredDate(profile?.dueDate);
    if (profile?.avatar) {
      this.selectedAvatar = profile.avatar;
    }
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
    this.profileSub?.unsubscribe();
  }

  navigate(route: string): void {
    this.router.navigate([route]);
  }
}