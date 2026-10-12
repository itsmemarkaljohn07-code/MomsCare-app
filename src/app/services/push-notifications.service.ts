// push-notifications.service.ts
import { Injectable, EnvironmentInjector, NgZone, inject, runInInjectionContext } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Firestore, deleteDoc, doc, serverTimestamp, setDoc } from '@angular/fire/firestore';
import type { PushNotificationsPlugin } from '@capacitor/push-notifications';
import { filter } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { ReminderSchedulerService } from './reminder-scheduler.service';

/** Android channel for pushes from the care team (also the FCM default
 *  channel, set in AndroidManifest.xml). */
export const PUSH_CHANNEL_ID = 'momcare-updates';

/** Routes a push may open. Anything else in data.route is ignored. */
const ALLOWED_ROUTES = ['/home', '/appointments', '/snapshot'] as const;
type AllowedRoute = typeof ALLOWED_ROUTES[number];
const PHOTO_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const INSTALL_ID_KEY = 'momscare_push_install_id';
/** The account this phone's token was last stored under. */
const TOKEN_OWNER_KEY = 'momscare_push_token_uid';
const REGISTER_TIMEOUT_MS = 15000;
const STEP_TIMEOUT_MS = 8000;

export type PushRegistrationResult = 'registered' | 'denied' | 'unavailable';

/**
 * Push notification foundation: the phone can receive pushes from the care
 * team and open the right page when one is tapped. The dashboard sends
 * them (later); this side keeps users/{uid}/devices/{installId} holding
 * this phone's FCM token while the patient is signed in.
 *
 * - Registers only when notification permission is already granted (or
 *   when the patient turns "Updates from my care team" on and saves).
 * - The device document is deleted before an explicit sign-out (an
 *   AuthService before-sign-out hook) and the FCM token is invalidated, so
 *   another account on this phone never receives the previous patient's
 *   pushes. A session that ends on its own (suspended account, revoked
 *   token) can't delete it; the dashboard must skip such accounts.
 * - In the foreground Android shows no system notification for a push;
 *   none is added here. The in-app bell updates from Firestore.
 */
@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  private firestore = inject(Firestore);
  private envInjector = inject(EnvironmentInjector);
  private started = false;
  /** The account this phone's token is currently stored under. */
  private registeredUid: string | null = null;
  private tokenWaiter: { resolve: (token: string) => void; reject: (err: unknown) => void } | null = null;
  /** A tapped push waiting for sign-in / the first real page. */
  private pending: { path: AllowedRoute; photoId?: string } | null = null;

  constructor(
    private auth: AuthService,
    private reminderScheduler: ReminderSchedulerService,
    private router: Router,
    private zone: NgZone,
  ) {
    this.auth.onBeforeSignOut(uid => this.unregister(uid));
  }

  /** Call once, as early as possible (AppComponent). Registers the tap
   *  listener first, so a tap that cold-started the app isn't lost. */
  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const native = await this.plugin();
    if (!native) return;
    const push = native.plugin;

    await push.addListener('pushNotificationActionPerformed', action =>
      this.zone.run(() => this.onTap(action.notification?.data)));
    await push.addListener('registration', token =>
      this.zone.run(() => this.onToken(token.value)));
    await push.addListener('registrationError', err =>
      this.zone.run(() => {
        console.warn('[push] registration error:', err?.error);
        this.tokenWaiter?.reject(new Error('registration failed'));
        this.tokenWaiter = null;
      }));

    // Once signed in and past the splash / sign-in pages, open a tapped push.
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => void this.openPending());

    try {
      await this.withTimeout('create-channel', push.createChannel({
        id: PUSH_CHANNEL_ID,
        name: 'Updates from my care team',
        description: 'Messages and updates from your doctor or clinic',
        importance: 4,
        visibility: 1,
        vibration: true,
      }));
    } catch (err) {
      console.warn('[push] could not create the channel:', err);
    }
  }

  /**
   * Stores this phone's push token for `uid`. With `mayAsk: false` (app
   * start) it only registers if notifications are already allowed and
   * never shows a dialog. Throws on timeout or failure.
   */
  async register(uid: string, mayAsk: boolean): Promise<PushRegistrationResult> {
    const native = await this.plugin();
    if (!native) return 'unavailable';
    if ((await this.reminderScheduler.ensurePermission(mayAsk)) !== 'granted') {
      console.log('[push] notifications not allowed: not registered');
      return 'denied';
    }
    // A different account than last time (e.g. the previous session ended
    // without a sign-out, so its device document couldn't be deleted):
    // get a NEW token, so the old account's document no longer reaches
    // this phone.
    const previousOwner = this.storedTokenOwner();
    if (previousOwner && previousOwner !== uid) {
      console.log('[push] account changed: rotating the token');
      await this.withTimeout('rotate-token', native.plugin.unregister());
    }
    this.registeredUid = uid;
    const token = await this.withTimeout('register', new Promise<string>((resolve, reject) => {
      this.tokenWaiter = { resolve, reject };
      native.plugin.register().catch(reject);
    }), REGISTER_TIMEOUT_MS);
    await this.saveToken(uid, token);
    this.setStoredTokenOwner(uid);
    console.log('[push] registered');
    return 'registered';
  }

  /** Deletes this phone's device document and invalidates its token.
   *  Never throws; each step has a timeout. */
  async unregister(uid: string): Promise<void> {
    this.registeredUid = null;
    this.setStoredTokenOwner(null);
    try {
      await this.withTimeout('delete-device', runInInjectionContext(this.envInjector, () =>
        deleteDoc(doc(this.firestore, `users/${uid}/devices/${this.installId()}`))));
    } catch (err) {
      console.warn('[push] could not delete the device document:', err);
    }
    const native = await this.plugin().catch(() => null);
    if (!native) return;
    try {
      await this.withTimeout('unregister', native.plugin.unregister());
    } catch (err) {
      console.warn('[push] could not unregister from FCM:', err);
    }
    console.log('[push] unregistered');
  }

  // -- internals --------------------------------------------------------

  /** A new token, from register() or a refresh. A refresh is rewritten
   *  for the account it is registered under. */
  private onToken(token: string): void {
    if (this.tokenWaiter) {
      this.tokenWaiter.resolve(token);
      this.tokenWaiter = null;
      return;
    }
    if (this.registeredUid) {
      void this.saveToken(this.registeredUid, token)
        .catch(err => console.warn('[push] could not save the refreshed token:', err));
    }
  }

  private async saveToken(uid: string, token: string): Promise<void> {
    await this.withTimeout('save-token', runInInjectionContext(this.envInjector, () =>
      setDoc(doc(this.firestore, `users/${uid}/devices/${this.installId()}`), {
        token,
        platform: 'android',
        updatedAt: serverTimestamp(),
      })));
  }

  /** Only whitelisted routes; an optional photoId only for /snapshot. */
  private onTap(data: any): void {
    const route = typeof data?.route === 'string' ? data.route.trim() : '';
    if (!(ALLOWED_ROUTES as readonly string[]).includes(route)) {
      console.log('[push] tap with no allowed route: ignored');
      return;
    }
    const photoId = route === '/snapshot' && typeof data?.photoId === 'string' && PHOTO_ID_PATTERN.test(data.photoId)
      ? data.photoId
      : undefined;
    this.pending = { path: route as AllowedRoute, photoId };
    void this.openPending();
  }

  /** Opens the tapped route once someone is signed in and the app is on a
   *  real page (not the splash or a sign-in page, which navigate on their
   *  own and would otherwise override it). */
  private async openPending(): Promise<void> {
    if (!this.pending || !this.auth.getCurrentUser()) return;
    const url = this.router.url;
    if (url === '/' || ['/splash', '/welcome', '/login', '/signup', '/forgot-password'].some(p => url.startsWith(p))) {
      return;
    }
    const { path, photoId } = this.pending;
    this.pending = null;
    await this.router.navigate([path], photoId ? { queryParams: { photoId } } : {});
  }

  private storedTokenOwner(): string | null {
    try { return localStorage.getItem(TOKEN_OWNER_KEY); } catch { return null; }
  }

  private setStoredTokenOwner(uid: string | null): void {
    try {
      if (uid) localStorage.setItem(TOKEN_OWNER_KEY, uid);
      else localStorage.removeItem(TOKEN_OWNER_KEY);
    } catch { /* ignore */ }
  }

  /** A random ID for this installation, the device document's ID. */
  private installId(): string {
    try {
      let id = localStorage.getItem(INSTALL_ID_KEY);
      if (!id) {
        id = typeof crypto?.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
        localStorage.setItem(INSTALL_ID_KEY, id);
      }
      return id;
    } catch {
      return 'android-device';
    }
  }

  /** The plugin on the phone app, or null in a browser. Wrapped: a
   *  Capacitor plugin is a thenable Proxy and must never be returned bare
   *  from an async function (see reminder-scheduler.service.ts). */
  private async plugin(): Promise<{ plugin: PushNotificationsPlugin } | null> {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return null;
    const mod = await import('@capacitor/push-notifications');
    return { plugin: mod.PushNotifications };
  }

  private withTimeout<T>(step: string, promise: Promise<T>, ms = STEP_TIMEOUT_MS): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`[push] ${step} timed out`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
}
