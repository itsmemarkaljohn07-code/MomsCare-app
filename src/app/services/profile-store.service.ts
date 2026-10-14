// profile-store.service.ts
import { Injectable, EnvironmentInjector, inject, runInInjectionContext } from '@angular/core';
import { Firestore, DocumentSnapshot, doc, onSnapshot } from '@angular/fire/firestore';
import { BehaviorSubject, Observable, combineLatest, firstValueFrom, of, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, filter, first, map, shareReplay, startWith, switchMap, timeout } from 'rxjs/operators';
import { AuthService, ProfileUnavailableError, UserProfile } from './auth.service';
import { reconnectNow } from '../shared/firestore-read';

/** How long a page waits for the profile before showing "couldn't load". */
export const PROFILE_LOAD_TIMEOUT_MS = 10000;

/**
 * - signed-out: nobody is signed in.
 * - loading: not known yet. Firestore hasn't reached the server (right
 *   after a cold start it can count itself offline for a while), so a
 *   missing document is not an answer yet.
 * - ready: the profile document (from the server, or this phone's own
 *   pending write).
 * - missing: the server confirmed there is no profile document (e.g. a
 *   brand-new account before its profile is saved).
 * - error: the listener failed (e.g. permission denied). retry() restarts it.
 */
export type ProfileStatus = 'signed-out' | 'loading' | 'ready' | 'missing' | 'error';

export interface ProfileState {
  uid: string | null;
  status: ProfileStatus;
  profile: UserProfile | null;
}

/**
 * The signed-in patient's profile (users/{uid}) as ONE shared real-time
 * listener. Pages that show the pregnancy week, due date or countdown read
 * from here, so a change saved anywhere (Pregnancy Settings, Profile Edit,
 * the clinic dashboard) reaches every page at once, including pages Ionic
 * keeps alive in the background. Switching accounts closes the previous
 * user's listener; signing out closes it and emits null.
 *
 * A read that hasn't finished is never reported as "no profile": state$
 * says 'loading' until the server answers, and profile$ skips it.
 */
@Injectable({ providedIn: 'root' })
export class ProfileStoreService {
  private firestore = inject(Firestore);
  private envInjector = inject(EnvironmentInjector);
  private restart$ = new BehaviorSubject<void>(undefined);

  readonly state$: Observable<ProfileState>;
  /** Settled values only: the profile, or null when signed out or when the
   *  server confirmed there is none. Nothing while loading or failed. */
  readonly profile$: Observable<UserProfile | null>;

  constructor(private auth: AuthService) {
    const uid$ = auth.user$.pipe(
      map(user => (user?.uid as string | undefined) ?? null),
      distinctUntilChanged(),
    );
    this.state$ = combineLatest([uid$, this.restart$]).pipe(
      switchMap(([uid]) => {
        if (!uid) return of<ProfileState>({ uid: null, status: 'signed-out', profile: null });
        return this.snapshots(uid).pipe(
          map((snap): ProfileState => snap.exists()
            ? { uid, status: 'ready', profile: snap.data() as UserProfile }
            : { uid, status: snap.metadata.fromCache ? 'loading' : 'missing', profile: null }),
          startWith<ProfileState>({ uid, status: 'loading', profile: null }),
          catchError(err => {
            console.error('[ProfileStore] profile listener failed:', err?.code ?? err);
            return of<ProfileState>({ uid, status: 'error', profile: null });
          }),
        );
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.profile$ = this.state$.pipe(
      filter(s => s.status === 'ready' || s.status === 'missing' || s.status === 'signed-out'),
      map(s => s.profile),
    );
  }

  /**
   * The signed-in patient's profile once it is really known: the profile,
   * or null when the server confirmed there is none (a brand-new account).
   * Rejects with ProfileUnavailableError after timeoutMs, if the listener
   * fails, or if the patient signs out or another account signs in while
   * waiting. Never hangs and leaves no subscription behind.
   */
  whenLoaded(timeoutMs = PROFILE_LOAD_TIMEOUT_MS): Promise<UserProfile | null> {
    const uid = this.auth.currentUid;
    if (!uid) return Promise.reject(new ProfileUnavailableError('Not signed in.', 'signed-out'));
    // state$ can still hold the previous account's last value for a moment
    // after a sign-in, so other accounts only count once this one was seen.
    let seenOwn = false;
    return firstValueFrom(this.state$.pipe(
      first(s => {
        if (s.uid === uid) {
          seenOwn = true;
          return s.status !== 'loading';
        }
        return seenOwn;
      }),
      timeout({
        first: timeoutMs,
        with: () => throwError(() => new ProfileUnavailableError('The profile did not load in time.', 'timeout')),
      }),
      map(s => {
        if (s.uid !== uid) throw new ProfileUnavailableError('The account changed while loading.', 'cancelled');
        if (s.status === 'error') throw new ProfileUnavailableError("Couldn't read the profile.", 'error');
        return s.profile;
      }),
    ));
  }

  /** For a Retry button: restarts the listener if it failed, or, while it
   *  is still waiting for the connection, makes Firestore reconnect now
   *  instead of after its growing wait between attempts. */
  retry(): void {
    void firstValueFrom(this.state$).then(s => {
      if (s.status === 'error') this.restart$.next();
      else if (s.status === 'loading') void runInInjectionContext(this.envInjector, () => reconnectNow(this.firestore));
    });
  }

  /** Every snapshot of users/{uid}, including metadata-only changes, so the
   *  switch from "from cache" to "confirmed by the server" is seen too. */
  private snapshots(uid: string): Observable<DocumentSnapshot> {
    return new Observable<DocumentSnapshot>(subscriber =>
      runInInjectionContext(this.envInjector, () =>
        onSnapshot(doc(this.firestore, 'users', uid), { includeMetadataChanges: true },
          snap => subscriber.next(snap),
          err => subscriber.error(err))));
  }
}
