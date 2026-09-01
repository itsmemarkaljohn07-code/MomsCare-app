import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Follows the device/OS color scheme automatically (prefers-color-scheme).
 * There is no manual override — MomsCare always mirrors the system theme.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService implements OnDestroy {
  private darkSubject = new BehaviorSubject<boolean>(false);
  isDark$ = this.darkSubject.asObservable();

  private mediaQuery: MediaQueryList | null = null;
  private mediaQueryListener = (e: MediaQueryListEvent) => this.applyDark(e.matches);

  constructor() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.applyDark(this.mediaQuery.matches);

      if (this.mediaQuery.addEventListener) {
        this.mediaQuery.addEventListener('change', this.mediaQueryListener);
      } else {
        (this.mediaQuery as any).addListener(this.mediaQueryListener);
      }
    }
  }

  get isDark(): boolean {
    return this.darkSubject.value;
  }

  private applyDark(isDark: boolean): void {
    this.darkSubject.next(isDark);
    document.body.classList.toggle('dark', isDark);
  }

  ngOnDestroy(): void {
    if (!this.mediaQuery) return;
    if (this.mediaQuery.removeEventListener) {
      this.mediaQuery.removeEventListener('change', this.mediaQueryListener);
    } else {
      (this.mediaQuery as any).removeListener(this.mediaQueryListener);
    }
  }
}