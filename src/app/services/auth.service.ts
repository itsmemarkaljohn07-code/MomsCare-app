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
}

@Injectable({ providedIn: 'root' })
export class AuthService {

  user$: Observable<any>;

  private envInjector = inject(EnvironmentInjector);

  constructor(
    private auth: Auth,
    private firestore: Firestore
  ) {
    // Wrapped: user() sets up an onAuthStateChanged listener whose callback
    // fires later, asynchronously, outside Angular's original injection
    // context — this was the source of the "Calling Firebase APIs outside
    // of an Injection context" warning.
    this.user$ = runInInjectionContext(this.envInjector, () => user(this.auth));
  }

  // ── Get current user ──────────────────────────
  getCurrentUser() {
    return this.auth.currentUser;
  }

  get currentUid(): string {
    return this.auth.currentUser?.uid ?? '';
  }

  // ── Register new user ─────────────────────────
  async register(
    email: string,
    password: string,
    profile: Partial<UserProfile>
  ): Promise<void> {
    // Step 1: Create Firebase Auth account (throws if email taken etc.)
    const cred = await runInInjectionContext(this.envInjector, () =>
      createUserWithEmailAndPassword(this.auth, email, password)
    );

    // Step 2: Save profile to Firestore (non-fatal if it fails)
    try {
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
      };
      await runInInjectionContext(this.envInjector, () =>
        setDoc(doc(this.firestore, 'users', cred.user.uid), userData)
      );
    } catch (firestoreErr) {
      // Firestore write failed but auth succeeded — log and continue
      console.warn('Profile save to Firestore failed:', firestoreErr);
    }
  }

  // ── Login ─────────────────────────────────────
  async login(email: string, password: string): Promise<void> {
    try {
      await runInInjectionContext(this.envInjector, () =>
        signInWithEmailAndPassword(this.auth, email, password)
      );
    } catch (err: any) {
      // Debug logging so the real Firebase error code/message is always
      // visible in the console — this is what tells us exactly why a
      // login failed instead of falling back to a generic message.
      console.error('[AuthService] Login error code:', err?.code);
      console.error('[AuthService] Login error message:', err?.message);
      console.error('[AuthService] Full error:', err);
      throw err;
    }
  }

  // ── Logout ────────────────────────────────────
  async logout(): Promise<void> {
    await runInInjectionContext(this.envInjector, () => signOut(this.auth));
  }

  // ── Get user profile from Firestore ───────────
  async getProfile(): Promise<UserProfile | null> {
    if (!this.currentUid) return null;
    const snap = await runInInjectionContext(this.envInjector, () =>
      getDoc(doc(this.firestore, 'users', this.currentUid))
    );
    return snap.exists() ? (snap.data() as UserProfile) : null;
  }

  // ── Update user profile ───────────────────────
  async updateProfile(data: Partial<UserProfile>): Promise<void> {
    if (!this.currentUid) return;
    await runInInjectionContext(this.envInjector, () =>
      updateDoc(doc(this.firestore, 'users', this.currentUid), { ...data })
    );
  }

  // ── Password reset ────────────────────────────
  async resetPassword(email: string): Promise<void> {
    await runInInjectionContext(this.envInjector, () =>
      sendPasswordResetEmail(this.auth, email)
    );
  }
}