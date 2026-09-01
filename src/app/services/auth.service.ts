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
   *  1. Create the Firebase Auth account.
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
      cred = await runInInjectionContext(this.envInjector, () =>
        createUserWithEmailAndPassword(this.auth, email, password)
      );
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

  async login(email: string, password: string): Promise<void> {
    try {
      await runInInjectionContext(this.envInjector, () =>
        signInWithEmailAndPassword(this.auth, email, password)
      );
    } catch (err: any) {
      console.error('[AuthService] Login error code:', err?.code);
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
    await runInInjectionContext(this.envInjector, () =>
      sendPasswordResetEmail(this.auth, email)
    );
  }
}