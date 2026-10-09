// profile-edit.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { IonicModule, ViewWillEnter } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme';
import { AuthService, AvatarSelection, UserProfile } from '../../services/auth.service';
import { toDateInputValue, fromDateInputValue } from '../../shared/date-utils';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-profile-edit',
  templateUrl: './profile-edit.page.html',
  styleUrls: ['./profile-edit.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ProfileEditPage implements OnInit, OnDestroy, ViewWillEnter {

  darkMode = false;
  private themeSub!: Subscription;
  animReady = false;
  editMode  = false;
  showToast = false;
  isSaving  = false;
  saveError = '';

  bloodTypes = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];

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
    dob: '', address: '',
    dueDate: '',
    firstTimeMom: 'yes', bloodType: '',
    doctorName: '', clinic: '',
    emergencyContact: '',
  };

  // The due date as it was when the page loaded (yyyy-MM-dd). If the user
  // doesn't change it, it is left out of the save entirely, so the value
  // stored at registration is never rewritten or shifted.
  private loadedDueDate = '';

  selectedAvatar: AvatarSelection | { emoji: string; bgColor: string } = { emoji: '🐻', bgColor: '#e07eb8' };

  /** Same 280-day formula every other page uses (snapshot.page.ts,
   *  insights.page.ts, profile.page.ts) -- one shared calculation,
   *  computed from dueDate rather than stored as its own number. */
  get pregnancyWeek(): number {
    const dueIso = fromDateInputValue(this.form.dueDate);
    if (!dueIso) return 0;
    const TOTAL_DAYS = 280;
    const msPerDay = 24 * 60 * 60 * 1000;
    const dueTime = new Date(dueIso).getTime();
    if (isNaN(dueTime)) return 0;
    const daysUntilDue = Math.round((dueTime - Date.now()) / msPerDay);
    const daysElapsed = Math.max(0, Math.min(TOTAL_DAYS, TOTAL_DAYS - daysUntilDue));
    return Math.min(40, Math.floor(daysElapsed / 7));
  }

  constructor(
    private router: Router,
    private location: Location,
    private theme: ThemeService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }

  /** Ionic keeps this page's instance alive when you navigate to
   *  Avatar and back, so OnInit alone would not re-fire -- this re-pulls
   *  the real profile (including a just-changed avatar) every time the
   *  page becomes active, same reasoning as profile.page.ts. */
  async ionViewWillEnter(): Promise<void> {
    try {
      const profile = await this.authService.getProfile();
      if (!profile) return;

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
        dob: toDateInputValue(profile.dob),
        address: profile.address ?? '',
        dueDate: toDateInputValue(profile.dueDate),
        firstTimeMom: profile.firstTimeMom === false ? 'no' : 'yes',
        bloodType: profile.bloodType ?? '',
        // Assigned by clinic staff in the admin dashboard, so shown
        // here read-only rather than as something the patient types.
        doctorName: (profile.assignedDoctorNames ?? []).join(', '),
        clinic: profile.clinicName ?? '',
        emergencyContact: profile.emergencyContact ?? '',
      };
      this.loadedDueDate = this.form.dueDate;
      if (profile.avatar) this.selectedAvatar = profile.avatar;
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
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
    if (this.isSaving) return;
    this.isSaving = true;
    this.saveError = '';
    try {
      const fullName = `${this.form.firstName} ${this.form.lastName}`.trim();
      const changes: Partial<UserProfile> = {
        firstName: this.form.firstName,
        lastName: this.form.lastName,
        fullName,
        mobile: this.form.phone,
        dob: this.form.dob,
        address: this.form.address,
        firstTimeMom: this.form.firstTimeMom === 'yes',
        bloodType: this.form.bloodType,
        clinicName: this.form.clinic,
        emergencyContact: this.form.emergencyContact,
      };
      if (this.form.dueDate !== this.loadedDueDate) {
        changes.dueDate = fromDateInputValue(this.form.dueDate);
      }
      await this.authService.updateProfile(changes);
      this.loadedDueDate = this.form.dueDate;
      this.editMode = false;
      this.showToast = true;
      setTimeout(() => (this.showToast = false), 2500);
    } catch (err) {
      console.error('Failed to save profile:', err);
      this.saveError = "Couldn't save your changes. Please check your connection and try again.";
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