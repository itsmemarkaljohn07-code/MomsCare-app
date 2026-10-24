import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AuthService, AvatarSelection, UserProfile } from '../../services/auth.service';
import { ProfileStoreService } from '../../services/profile-store.service';
import { parseStoredDate } from '../../shared/date-utils';
import { pregnancyStatus } from '../../shared/pregnancy-status';
import { BabySize, babySizeFor } from '../../shared/baby-size';
import { ageOn, formatAddress, formatBirthday, readAddress, readBirthday, todayLocalYmd } from '../../shared/profile-fields';

/** "Complete your profile" was closed for this account on this phone. */
const PROMPT_DISMISSED_KEY = 'momcare_profile_prompt_dismissed_';
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
  // a name that genuinely isn't on file yet -- never a hardcoded
  // person's name. Until the profile has loaded, the header shows "–".
  userName = 'User';
  profileLoaded = false;

  /** Birthday ("YYYY-MM-DD") and address, from the live profile. The age
   *  is worked out when shown, never stored. */
  private birthday: string | null = null;
  addressLine = '';
  private uid: string | null = null;
  promptDismissed = false;

  get birthdayText(): string { return this.birthday ? formatBirthday(this.birthday) : ''; }
  get age(): number | null { return this.birthday ? ageOn(this.birthday, todayLocalYmd()) : null; }

  /** Shown only in My Profile, only while something is missing, and only
   *  until she closes it. It never blocks anything. */
  get showCompletePrompt(): boolean {
    return this.profileLoaded && !!this.uid && !this.promptDismissed && (!this.birthday || !this.addressLine);
  }

  dismissCompletePrompt(): void {
    this.promptDismissed = true;
    try { if (this.uid) localStorage.setItem(PROMPT_DISMISSED_KEY + this.uid, '1'); } catch { /* ignore */ }
  }
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

  /** The same table as Home (shared/baby-size.ts), for the real week. */
  get babySize(): BabySize {
    return babySizeFor(this.pregnancyWeek);
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
    this.profileLoaded = true;
    this.userName = profile?.fullName || 'User';
    this.birthday = readBirthday(profile?.dob);
    this.addressLine = formatAddress(readAddress(profile?.address));
    if (profile?.uid !== this.uid) {
      this.uid = profile?.uid ?? null;
      try { this.promptDismissed = !!this.uid && localStorage.getItem(PROMPT_DISMISSED_KEY + this.uid) === '1'; }
      catch { this.promptDismissed = false; }
    }
    this.dueDate = parseStoredDate(profile?.dueDate);
    if (profile?.avatar) {
      this.selectedAvatar = profile.avatar;
    }
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
    this.profileSub?.unsubscribe();
  }

  /** The same tutorial as after registering, with Close; writes nothing. */
  openTutorial(): void {
    this.router.navigate(['/tutorial'], { queryParams: { mode: 'replay' } });
  }

  navigate(route: string): void {
    this.router.navigate([route]);
  }
}