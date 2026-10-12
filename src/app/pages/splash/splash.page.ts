// splash.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme';
import { AuthService } from '../../services/auth.service';
import { Subscription, firstValueFrom } from 'rxjs';

/** How long to wait for Firebase to restore a saved session before
 *  giving up and showing Welcome. Giving up never signs anyone out. */
const AUTH_RESTORE_TIMEOUT_MS = 10000;

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class SplashPage implements OnInit, OnDestroy {
  splashDone = false;
  darkMode   = false;
  private themeSub!: Subscription;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private destroyed = false;

  constructor(
    private router: Router,
    private theme: ThemeService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));

    // Start waiting for Firebase's first auth state straight away, so a
    // saved session is restored while the splash is still showing.
    const signedIn = this.waitForFirstAuthState();

    // Show the splash for 3s, then stay on it until auth state is known,
    // then fade out (700ms) and go to Home or Welcome.
    this.timers.push(setTimeout(async () => {
      const isSignedIn = await signedIn;
      if (this.destroyed) return;
      this.splashDone = true;
      this.timers.push(setTimeout(() => {
        this.router.navigate([isSignedIn ? '/home' : '/welcome'], { replaceUrl: true });
      }, 700)); // 700ms fade-out animation before navigating
    }, 3000)); // 3s splash display time
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.timers.forEach(t => clearTimeout(t));
    this.themeSub?.unsubscribe();
  }

  /** Resolves true if a user is signed in, false if not. If the restore
   *  stalls, resolves false after AUTH_RESTORE_TIMEOUT_MS. */
  private waitForFirstAuthState(): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      const fallback = setTimeout(() => {
        console.warn(`[Splash] Auth state not restored after ${AUTH_RESTORE_TIMEOUT_MS / 1000}s, showing Welcome.`);
        resolve(false);
      }, AUTH_RESTORE_TIMEOUT_MS);
      this.timers.push(fallback);

      firstValueFrom(this.authService.user$).then(
        user => {
          clearTimeout(fallback);
          resolve(!!user);
        },
        err => {
          clearTimeout(fallback);
          console.warn('[Splash] Could not read auth state, showing Welcome:', err);
          resolve(false);
        }
      );
    });
  }
}
