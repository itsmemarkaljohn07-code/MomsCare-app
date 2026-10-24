// profile-edit.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { IonicModule, ViewWillEnter, ViewWillLeave } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme';
import { AuthService, AvatarSelection, UserProfile } from '../../services/auth.service';
import { SaveFeedbackService } from '../../services/save-feedback.service';
import { ProfileStoreService } from '../../services/profile-store.service';
import { McDropdownComponent, McDropdownOption } from '../../shared/mc-dropdown/mc-dropdown.component';
import { McDatepickerComponent } from '../../shared/mc-datepicker/mc-datepicker.component';
import { toDateInputValue, fromDateInputValue, parseStoredDate } from '../../shared/date-utils';
import { formatAddress, readAddress } from '../../shared/profile-fields';
import { pregnancyStatus } from '../../shared/pregnancy-status';
import { ProfileEditForm, profileEditChanges } from '../../shared/profile-changes';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-profile-edit',
  templateUrl: './profile-edit.page.html',
  styleUrls: ['./profile-edit.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, McDropdownComponent, McDatepickerComponent],
})
export class ProfileEditPage implements OnInit, OnDestroy, ViewWillEnter, ViewWillLeave {

  darkMode = false;
  private themeSub!: Subscription;
  animReady = false;
  editMode  = false;
  isSaving  = false;
  saveError = '';

  bloodTypes = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
  readonly bloodTypeOptions: McDropdownOption[] = this.bloodTypes.map(bt => ({ value: bt, label: bt }));
  readonly firstTimeMomOptions: McDropdownOption[] = [
    { value: 'yes', label: 'Yes, first pregnancy' },
    { value: 'no', label: 'No, I have children' },
  ];

  // Blank, not another hardcoded person -- every field here is filled
  // in from the real profile in ionViewWillEnter below. pregnancyWeek
  // is intentionally NOT part of this form: it's computed from dueDate
  // (see the pregnancyWeek getter), never stored or edited as its own
  // raw number, which previously let it drift out of sync with the
  // due date -- exactly the kind of conflicting pregnancy data this
  // feature is required to avoid.
  form = {
    firstName: '', lastName: '',
    email: '', phone: '',
    address: '',
    dueDate: '',
    firstTimeMom: '', bloodType: '',
    doctorName: '', clinic: '',
    emergencyContact: '',
  };

  /** 'ready' once the saved profile filled the form; only then can it be
   *  edited and saved. 'failed' after PROFILE_LOAD_TIMEOUT_MS, with Retry;
   *  'missing' if the server says there is no profile. */
  loadState: 'loading' | 'ready' | 'failed' | 'missing' = 'loading';
  get isLoaded(): boolean { return this.loadState === 'ready'; }
  /** Bumped on every load and when the page is left. */
  private visit = 0;

  // The form as it was loaded on this visit. Save sends only the fields
  // that differ from it, so an untouched field (e.g. the due date stored
  // at registration) is never rewritten, shifted or blanked.
  private loadedForm: ProfileEditForm = { ...this.form };

  selectedAvatar: AvatarSelection | { emoji: string; bgColor: string } = { emoji: '🐻', bgColor: '#e07eb8' };

  /** Same 280-day formula every other page uses (snapshot.page.ts,
   *  insights.page.ts, profile.page.ts) -- one shared calculation,
   *  computed from dueDate rather than stored as its own number. */
  get pregnancyWeek(): number {
    // The shared formula, so this preview matches Home exactly.
    return pregnancyStatus(parseStoredDate(fromDateInputValue(this.form.dueDate))).week;
  }

  constructor(
    private router: Router,
    private location: Location,
    private theme: ThemeService,
    private authService: AuthService,
    private feedback: SaveFeedbackService,
    private profileStore: ProfileStoreService,
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }

  /** Ionic keeps this page's instance alive when you navigate to
   *  Avatar and back, so OnInit alone would not re-fire -- this re-pulls
   *  the real profile (including a just-changed avatar) every time the
   *  page becomes active, same reasoning as profile.page.ts. */
  ionViewWillEnter(): void {
    // Back from Avatar in the middle of editing: keep what was typed and
    // only show the avatar just chosen. Otherwise load the saved profile.
    if (this.editMode && this.isLoaded) {
      void this.refreshAvatar();
      return;
    }
    void this.loadProfile();
  }

  private async refreshAvatar(): Promise<void> {
    try {
      const profile = await this.profileStore.whenLoaded();
      if (profile?.avatar) this.selectedAvatar = profile.avatar;
    } catch (err: any) {
      console.error('Failed to refresh the avatar:', err?.reason ?? err);
    }
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
   *  load (ProfileStoreService.whenLoaded): until then Edit and Save are
   *  disabled, so blanks can never be saved over real data. */
  private async loadProfile(): Promise<void> {
    const visit = ++this.visit;
    this.loadState = 'loading';
    let profile: UserProfile | null;
    try {
      profile = await this.profileStore.whenLoaded();
    } catch (err: any) {
      if (visit !== this.visit) return;
      console.error('Failed to load profile:', err?.reason ?? err);
      this.loadState = 'failed';
      this.editMode = false;
      return;
    }
    if (visit !== this.visit) return;
    if (!profile) {
      this.loadState = 'missing';
      this.editMode = false;
      return;
    }
    this.applyProfile(profile);
    this.loadState = 'ready';
  }

  private applyProfile(profile: UserProfile): void {
    // firstName/lastName fall back to splitting the existing
    // fullName for an account that has never saved them separately
    // before -- still "information provided during registration,"
    // just split for the two-box editing UI here.
    let firstName = profile.firstName ?? '';
    let lastName  = profile.lastName  ?? '';
    if (!firstName && !lastName && profile.fullName) {
      const parts = profile.fullName.trim().split(/\s+/);
      firstName = parts[0] ?? '';
      lastName  = parts.slice(1).join(' ');
    }

    this.form = {
      firstName, lastName,
      email: profile.email ?? '',
      phone: profile.mobile ?? '',
      // Shown as one line here for now (an older string or the new parts).
      address: formatAddress(readAddress(profile.address)),
      dueDate: toDateInputValue(profile.dueDate),
      firstTimeMom: profile.firstTimeMom === false ? 'no' : 'yes',
      bloodType: profile.bloodType ?? '',
      // Assigned by clinic staff in the admin dashboard, so shown
      // here read-only rather than as something the patient types.
      doctorName: (profile.assignedDoctorNames ?? []).join(', '),
      clinic: profile.clinicName ?? '',
      emergencyContact: profile.emergencyContact ?? '',
    };
    this.loadedForm = { ...this.form };
    if (profile.avatar) this.selectedAvatar = profile.avatar;
  }

  /** Saves to the signed-in user's own users/{uid} document via
   *  AuthService -- the same document every other real-data page in
   *  this app already reads. fullName is kept in sync from
   *  firstName+lastName so every existing fullName reader elsewhere
   *  (the Profile page greeting, for instance) keeps working with no
   *  changes of its own. email and the assigned doctor are deliberately
   *  NOT written: email is the login identity (changing only the
   *  Firestore copy would silently desync it), and the doctor
   *  assignment belongs to clinic staff. On failure, stays in edit mode and shows an
   *  error rather than silently claiming success. */
  async saveProfile(): Promise<void> {
    // Never save the placeholder form over the saved profile.
    if (this.isSaving || !this.isLoaded) return;
    this.isSaving = true;
    this.saveError = '';
    try {
      // Only the fields changed on this visit (profile-changes.ts), so
      // nothing untouched is ever rewritten. updateDoc leaves every field
      // it isn't given (e.g. dob) as it is.
      const { changes, clearedRequired } = profileEditChanges(this.loadedForm, this.form);
      if (clearedRequired.length) {
        this.saveError = `${clearedRequired.join(', ')} can't be left empty.`;
        return;
      }
      if (Object.keys(changes).length === 0) {
        this.editMode = false;
        void this.feedback.show('No changes to save.', 'info');
        return;
      }
      // Shared feedback: success only once the write resolves, a reason on
      // failure, and an "offline, will sync" note if it doesn't finish in time.
      const result = await this.feedback.save(() => this.authService.updateProfile(changes));
      if (result.outcome === 'failed') {
        this.saveError = result.message;
      } else {
        this.loadedForm = { ...this.form };
        this.editMode = false;
      }
    } finally {
      this.isSaving = false;
    }
  }

  navigate(r: string): void { this.router.navigate([r]); }
  goBack(): void { this.location.back(); }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }
}