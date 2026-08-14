// services/theme.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const THEME_KEY = 'momscare_dark_mode';

@Injectable({ providedIn: 'root' })
export class ThemeService {

  private _isDark$ = new BehaviorSubject<boolean>(this.loadInitial());
  readonly isDark$ = this._isDark$.asObservable();

  get isDark(): boolean {
    return this._isDark$.value;
  }

  constructor() {
    this.apply(this.isDark);
  }

  private loadInitial(): boolean {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved !== null) return saved === 'true';
    } catch {}
    // Fall back to system preference if nothing saved yet
    return typeof window !== 'undefined' &&
           window.matchMedia &&
           window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  toggle(): void {
    this.set(!this.isDark);
  }

  set(value: boolean): void {
    this._isDark$.next(value);
    this.apply(value);
    try { localStorage.setItem(THEME_KEY, String(value)); } catch {}
  }

  /** Applies/removes the 'dark' class on <html> and <body> so global CSS variables can react. */
  private apply(isDark: boolean): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const body = document.body;
    if (isDark) {
      root.classList.add('dark');
      body.classList.add('dark');
    } else {
      root.classList.remove('dark');
      body.classList.remove('dark');
    }
  }
}