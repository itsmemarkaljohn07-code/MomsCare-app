// src/app/services/auth.service.ts
import { Injectable, EnvironmentInjector, runInInjectionContext, inject } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  user
} from '@angular/fire/auth';
// Imported from the raw 'firebase/auth' package (NOT '@angular/fire/auth')
// deliberately — these persistence classes must be the exact same module
// instance the Auth object internally expects. Importing them through
// @angular/fire's wrapper instead caused "TypeError: cls is not a
// constructor" at runtime, a known interop mismatch between the two
// import paths.
import {
  setPersistence,
  indexedDBLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import {
  Firestore,
  doc,
  setDoc,
  getDoc,
  updateDoc
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface AvatarSelection {
  emoji: string;
  bgColor: string;
  animalId: string;
  animalName: string;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  username: string;
  email: string;
  mobile?: string;
  dueDate?: string;
  weeksPregnant?: number | null;
  lmpDate?: string;
  firstTimeMom?: boolean;
  clinicName?: string;
  createdAt: string;
  setupComplete?: boolean;
  // Added for per-user avatar customization -- stored on the SAME
  // users/{uid} document everything else already lives on, not a
  // separate collection. Optional so existing accounts with no
  // avatar saved yet still parse fine.
  avatar?: AvatarSelection;

  // Added for the My Profile page. firstName/lastName are genuinely
  // new fields (registration only ever collected one combined
  // fullName), kept in sync with fullName by whoever writes them so
  // every existing fullName reader elsewhere in the app keeps working
  // unchanged. The rest were never collected at registration at all
  // and are filled in later by the user, so all are optional and
  // absent (not a placeholder value) until the user actually saves
  // something.
  firstName?: string;
  lastName?: string;
  dob?: string;
  address?: string;
  bloodType?: string;
  emergencyContact?: string;
  // The admin dashboard's REAL doctor-assignment field (it queries
  // assignedDoctorNames with array-contains). Managed by clinic staff
  // only: the app reads and displays it, and Firestore rules stop a
  // patient from changing it. Replaces an earlier patient-editable
  // assignedDoctorName string that nothing else in the system used.
  assignedDoctorNames?: string[];

  // Added for Pregnancy Settings. calcMethod/weightUnit/kickReminderTime/
  // highRisk were previously only ever saved to a separate, now-removed
  // localStorage key; notificationPrefs previously had no persistence
  // at all (toggles reset on every reload). All optional, all absent
  // until the user actually sets them -- no invented defaults stored.
  calcMethod?: 'lmp' | 'ultrasound' | 'ivf';
  weightUnit?: 'kg' | 'lbs';
  kickReminderTime?: string;
  highRisk?: boolean;
  notificationPrefs?: {
    weeklyUpdates: boolean;
    appointmentReminders: boolean;
    vitaminReminder: boolean;
    kickAlerts: boolean;
    hydrationReminders: boolean;
  };
}

const FIRESTORE_SAVE_TIMEOUT_MS = 45000;
const PENDING_KEY = 'momscare_pending_profile';
const REMEMBERED_EMAIL_KEY = 'momscare_remembered_email';

@Injectable({ providedIn: 'root' })
export class AuthService {

  user$: Observable<any>;
  private envInjector = inject(EnvironmentInjector);

  constructor(
    private auth: Auth,
    private firestore: Firestore
  ) {
    this.user$ = runInInjectionContext(this.envInjector, () => user(this.auth));
  }

  getCurrentUser() {
    return this.auth.currentUser;
  }

  get currentUid(): string {
    return this.auth.currentUser?.uid ?? '';
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let handle: any;
    const timeout = new Promise<never>((_, reject) => {
      handle = setTimeout(() => {
        const err: any = new Error(message);
        err.code = 'timeout';
        reject(err);
      }, ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(handle)) as Promise<T>;
  }

  /**
   * Registration flow:
   *  1. Create the Firebase Auth account. Persistence is explicitly set
   *     to IndexedDB-backed local persistence first — Firebase's own
   *     recommended persistence type for Capacitor/hybrid apps, and more
   *     reliable than browserLocalPersistence at surviving a full app
   *     close-and-reopen. This also guarantees a brand-new account
   *     always stays signed in long-term, even if the Auth instance
   *     previously had SESSION persistence left over from a "Remember Me
   *     unchecked" login (setPersistence() is sticky on the Auth
   *     instance until changed again).
   *  2. Save the full pregnancy profile (including dueDate) to
   *     users/{uid} in Firestore, timeout-guarded and retried.
   *  3. Only if step 2 genuinely succeeds does this resolve normally —
   *     the caller (signup.page.ts) only navigates to Home after this
   *     promise resolves without throwing.
   *  4. If step 2 fails after all retries, a 'profile-save-failed'
   *     error is thrown (Auth account exists, profile does not) so the
   *     UI can show a clear message and offer a retry — the account is
   *     never left in a silent, ambiguous state.
   */
  async register(
    email: string,
    password: string,
    profile: Partial<UserProfile>
  ): Promise<void> {
    let cred;
    try {
      cred = await runInInjectionContext(this.envInjector, async () => {
        try {
          await setPersistence(this.auth, indexedDBLocalPersistence);
        } catch (persistErr) {
          console.warn('[AuthService] setPersistence failed on register, continuing with default persistence:', persistErr);
        }
        return createUserWithEmailAndPassword(this.auth, email, password);
      });
    } catch (err: any) {
      console.error('[AuthService] Registration (Auth) failed — full details:', {
        code: err?.code,
        name: err?.name,
        message: err?.message,
        raw: err,
      });
      throw new Error(this.mapAuthError(err));
    }

        const userData: UserProfile = {
      uid:           cred.user.uid,
      fullName:      profile.fullName      ?? '',
      username:      profile.username      ?? '',
      email:         email,
      mobile:        profile.mobile        ?? '',
      dueDate:       profile.dueDate       ?? '',
      weeksPregnant: profile.weeksPregnant ?? 0,
      lmpDate:       profile.lmpDate       ?? '',
      firstTimeMom:  profile.firstTimeMom  ?? true,
      clinicName:    profile.clinicName    ?? '',
      createdAt:     new Date().toISOString(),
      setupComplete: true,
    };

    // Backed up locally BEFORE the network call, so the EDD and rest of
    // the profile can never be silently lost even if every save attempt
    // fails — syncPendingProfileIfAny() recovers it automatically later.
    this.savePendingProfileLocally(userData);

    try {
      await this.saveProfileWithRetry(cred.user.uid, userData);
      if (userData.username) {
        await this.reserveUsername(userData.username, email, cred.user.uid);
      }
      this.clearPendingProfileLocally();
    } catch (err) {
      console.error('[AuthService] Profile save failed after retries:', err);
      const wrapped: any = new Error(
        "We created your account, but couldn't save your pregnancy details. Please try saving again."
      );
      wrapped.code = 'profile-save-failed';
      wrapped.uid  = cred.user.uid;
      throw wrapped;
    }
  }

  /** Retries saving the profile for the currently signed-in user —
   *  used when Auth succeeded but the profile save previously failed.
   *  Does not re-register (the Auth account already exists). */
  async retryProfileSave(profile: Partial<UserProfile>): Promise<void> {
    if (!this.currentUid) {
      throw new Error('No signed-in account found. Please sign in and try again.');
    }
        const userData: UserProfile = {
      uid:           this.currentUid,
      fullName:      profile.fullName      ?? '',
      username:      profile.username      ?? '',
      email:         this.auth.currentUser?.email ?? '',
      mobile:        profile.mobile        ?? '',
      dueDate:       profile.dueDate       ?? '',
      weeksPregnant: profile.weeksPregnant ?? 0,
      lmpDate:       profile.lmpDate       ?? '',
      firstTimeMom:  profile.firstTimeMom  ?? true,
      clinicName:    profile.clinicName    ?? '',
      createdAt:     new Date().toISOString(),
      setupComplete: true,
    };
    this.savePendingProfileLocally(userData);
    await this.saveProfileWithRetry(this.currentUid, userData);
    this.clearPendingProfileLocally();
  }

  private async saveProfileWithRetry(uid: string, userData: UserProfile, attempts = 3): Promise<void> {
    let lastErr: any;
    for (let i = 0; i < attempts; i++) {
      try {
        await this.withTimeout(
          runInInjectionContext(this.envInjector, () =>
            setDoc(doc(this.firestore, 'users', uid), userData)
          ),
          FIRESTORE_SAVE_TIMEOUT_MS,
          'Saving your details is taking too long.'
        );
        return; // genuine success — Firestore confirmed the write
      } catch (err) {
        lastErr = err;
        console.warn(`[AuthService] Profile save attempt ${i + 1} failed:`, err);
        if (i < attempts - 1) {
          await new Promise(res => setTimeout(res, 1000));
        }
      }
    }
    throw lastErr;
  }

  // ── Local pending-profile backup (safety net) ─────────────────────
  private savePendingProfileLocally(userData: UserProfile): void {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(userData)); } catch { /* ignore */ }
  }

  private clearPendingProfileLocally(): void {
    try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
  }

  /** Call from Home's ngOnInit() to silently retry any previously-failed
   *  profile save in the background. Safe no-op if nothing is pending. */
  async syncPendingProfileIfAny(): Promise<void> {
    if (!this.currentUid) return;
    let pending: UserProfile | null = null;
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (raw) pending = JSON.parse(raw);
    } catch { /* ignore corrupt data */ }
    if (!pending) return;

    try {
      await runInInjectionContext(this.envInjector, () =>
        setDoc(doc(this.firestore, 'users', this.currentUid), pending)
      );
      this.clearPendingProfileLocally();
    } catch (err) {
      console.warn('[AuthService] Background pending-profile sync failed, will retry next load:', err);
    }
  }

  private mapAuthError(err: any): string {
    switch (err?.code) {
      case 'auth/email-already-in-use':
        return 'This email is already registered. Please sign in instead.';
      case 'auth/invalid-email':
        return 'The email address is not valid.';
      case 'auth/weak-password':
        return 'Password is too weak. Please use at least 8 characters.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection and try again.';
      case 'auth/operation-not-allowed':
        return 'Account creation is currently disabled. Please try again later.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment and try again.';
      default:
        return err?.message
          ? `We couldn't create your account: ${err.message}`
          : "We couldn't create your account. Please try again.";
    }
  }

  /**
   * Signs in with Firebase Auth's own secure persistence system — no
   * email or password is ever written to localStorage/any storage by
   * this app's own code.
   *
   * rememberMe = true  → indexedDBLocalPersistence — the account stays
   *                       signed in across full app closes and re-opens
   *                       (Firebase's recommended persistence type for
   *                       Capacitor/hybrid apps specifically).
   * rememberMe = false → browserSessionPersistence — signed out once
   *                       the current app/browser session ends.
   */
  async login(email: string, password: string, rememberMe: boolean = false): Promise<void> {
    try {
      await runInInjectionContext(this.envInjector, async () => {
        try {
          await setPersistence(
            this.auth,
            rememberMe ? indexedDBLocalPersistence : browserSessionPersistence
          );
        } catch (persistErr) {
          // Defensive fallback only — with the correct import source
          // above this should no longer actually occur, but sign-in
          // must never be blocked by a persistence-layer failure.
          console.warn('[AuthService] setPersistence failed, continuing with default persistence:', persistErr);
        }
        await signInWithEmailAndPassword(this.auth, email, password);
      });
    } catch (err: any) {
      console.error('[AuthService] Login error code:', err?.code, '| message:', err?.message);
      throw err;
    }
  }

  async logout(): Promise<void> {
    await runInInjectionContext(this.envInjector, () => signOut(this.auth));
  }

  async getProfile(): Promise<UserProfile | null> {
    if (!this.currentUid) return null;
    try {
      const snap = await runInInjectionContext(this.envInjector, () =>
        getDoc(doc(this.firestore, 'users', this.currentUid))
      );
      return snap.exists() ? (snap.data() as UserProfile) : null;
    } catch (err) {
      console.error('[AuthService] getProfile failed:', err);
      return null;
    }
  }

  async updateProfile(data: Partial<UserProfile>): Promise<void> {
    if (!this.currentUid) return;
    await runInInjectionContext(this.envInjector, () =>
      updateDoc(doc(this.firestore, 'users', this.currentUid), { ...data })
    );
  }

  async resetPassword(email: string): Promise<void> {
    try {
      await runInInjectionContext(this.envInjector, () =>
        sendPasswordResetEmail(this.auth, email)
      );
    } catch (err: any) {
      console.error('[AuthService] resetPassword error code:', err?.code);
      const wrapped: any = new Error(this.mapResetError(err));
      wrapped.code = err?.code || 'unknown';
      throw wrapped;
    }
  }

  private mapResetError(err: any): string {
    switch (err?.code) {
      case 'auth/user-not-found':
        return 'No account found with that email address.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/too-many-requests':
        return 'Too many requests. Please wait a moment and try again.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection and try again.';
      default:
        return "We couldn't send the reset email. Please try again.";
    }
  }

  // ── Remembered email (Remember Me) — email only, NEVER the password ──
  rememberEmail(email: string): void {
    try { localStorage.setItem(REMEMBERED_EMAIL_KEY, email); } catch { /* ignore */ }
  }

  forgetRememberedEmail(): void {
    try { localStorage.removeItem(REMEMBERED_EMAIL_KEY); } catch { /* ignore */ }
  }

    getRememberedEmail(): string | null {
    try { return localStorage.getItem(REMEMBERED_EMAIL_KEY); } catch { return null; }
  }

  // ── Username support ──────────────────────────────────────────────
  // Firebase Auth's email/password provider has no native "username"
  // concept — it always requires a real email internally. This app
  // still collects a real email at signup (for account recovery), but
  // the user only ever types a USERNAME to sign in. A `usernames/
  // {username}` doc maps each username to its account email, checked
  // for uniqueness at signup and looked up silently at login.

  async isUsernameTaken(username: string): Promise<boolean> {
    const snap = await runInInjectionContext(this.envInjector, () =>
      getDoc(doc(this.firestore, 'usernames', username.toLowerCase()))
    );
    return snap.exists();
  }

  async reserveUsername(username: string, email: string, uid: string): Promise<void> {
    await runInInjectionContext(this.envInjector, () =>
      setDoc(doc(this.firestore, 'usernames', username.toLowerCase()), { email, uid })
    );
  }

  /** Resolves a username to its account email, or null if not found. */
  private async getEmailForUsername(username: string): Promise<string | null> {
    const snap = await runInInjectionContext(this.envInjector, () =>
      getDoc(doc(this.firestore, 'usernames', username.toLowerCase()))
    );
    return snap.exists() ? (snap.data() as any).email ?? null : null;
  }

  async loginWithUsername(username: string, password: string, rememberMe: boolean = false): Promise<void> {
    const email = await this.getEmailForUsername(username.trim());
    if (!email) {
      const err: any = new Error('No account found with that username.');
      err.code = 'auth/user-not-found';
      throw err;
    }
    return this.login(email, password, rememberMe);
  }

  // ── Remembered username (replaces remembered email for login) ──────
  rememberUsername(username: string): void {
    try { localStorage.setItem('momscare_remembered_username', username); } catch { /* ignore */ }
  }
  forgetRememberedUsername(): void {
    try { localStorage.removeItem('momscare_remembered_username'); } catch { /* ignore */ }
  }
  getRememberedUsername(): string | null {
    try { return localStorage.getItem('momscare_remembered_username'); } catch { return null; }
  }
}