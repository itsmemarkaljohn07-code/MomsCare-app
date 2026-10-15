// first-run-tutorial.service.ts
import { Injectable } from '@angular/core';

/** localStorage key holding the uid of an account registered on this phone
 *  that hasn't finished the first-run tutorial yet. */
const PENDING_KEY = 'momcare_tutorial_pending_uid';

/**
 * Remembers, on this phone only, that an account was just registered here
 * and still has to see the first-run tutorial. Existing accounts never get
 * the flag, so they keep going straight to Home even though their profile
 * has no tutorialSeen field. The flag is cleared only once tutorialSeen is
 * known to be true (saved by "Get started", or read from the loaded
 * profile), never because a read failed.
 */
@Injectable({ providedIn: 'root' })
export class FirstRunTutorialService {
  /** Called right after a successful registration. */
  markPending(uid: string): void {
    if (!uid) return;
    try { localStorage.setItem(PENDING_KEY, uid); } catch { /* ignore */ }
  }

  /** True while this account registered here and hasn't finished it. */
  isPending(uid: string | null | undefined): boolean {
    if (!uid) return false;
    try { return localStorage.getItem(PENDING_KEY) === uid; } catch { return false; }
  }

  clear(): void {
    try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
  }
}
