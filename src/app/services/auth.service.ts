// src/app/services/auth.service.ts
import { Injectable, EnvironmentInjector, runInInjectionContext, inject } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  user
} from '@angular/fire/auth';
import {
  Firestore,
  doc,
  setDoc,
  getDoc,
  updateDoc
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  mobile?: string;
  dueDate?: string;
  weeksPregnant?: number | null;
  lmpDate?: string;
  firstTimeMom?: boolean;
  clinicName?: string;
  createdAt: string;
  setupComplete?: boolean;
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
   *     to LOCAL first — this guarantees a brand-new account always
   *     stays signed in long-term, even if the Auth instance previously
   *     had SESSION persistence left over from an earlier "Remember Me
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
        await setPersistence(this.auth, browserLocalPersistence);
        return createUserWithEmailAndPassword(this.auth, email, password);
      });
    } catch (err: any) {
      console.error('[AuthService] Registration (Auth) error code:', err?.code);
      throw new Error(this.mapAuthError(err));
    }

    const userData: UserProfile = {
      uid:           cred.user.uid,
      fullName:      profile.fullName      ?? '',
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
        return "We couldn't create your account. Please try again.";
    }
  }

  /**
   * Signs in with Firebase Auth's own secure persistence system —
   * no email or password is ever written to localStorage directly.
   * rememberMe = true  → browserLocalPersistence  (stays signed in
   *                       across browser restarts, until explicit logout)
   * rememberMe = false → browserSessionPersistence (signed out once the
   *                       browser/tab is closed)
   */
  async login(email: string, password: string, rememberMe: boolean = false): Promise<void> {
  try {
    await runInInjectionContext(this.envInjector, async () => {
      try {
        await setPersistence(
          this.auth,
          rememberMe ? browserLocalPersistence : browserSessionPersistence
        );
      } catch (persistErr) {
        // Some environments (private browsing, restrictive storage
        // settings/extensions) can block IndexedDB, which
        // setPersistence relies on. Don't let that block sign-in
        // entirely — fall back to the SDK's default persistence and
        // continue with the actual login attempt.
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

  /**
   * Sends a Firebase password-reset email. Errors are mapped to
   * friendly messages and the original Firebase error code is attached
   * to the thrown Error (as `.code`) so the calling page can decide how
   * to handle specific cases (e.g. treating "no such account" as a
   * generic success message, to avoid revealing which emails are
   * registered).
   */
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
}