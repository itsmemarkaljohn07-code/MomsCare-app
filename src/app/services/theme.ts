import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private darkMode$ = new BehaviorSubject<boolean>(
    localStorage.getItem('dailymom-dark-mode') === 'true'
  );

  isDark$ = this.darkMode$.asObservable();

  constructor() {
    // Apply saved theme on app startup
    this.applyTheme(this.darkMode$.value);
  }

  get isDark(): boolean {
    return this.darkMode$.value;
  }

  toggle(): void {
    const next = !this.darkMode$.value;
    this.darkMode$.next(next);
    localStorage.setItem('dailymom-dark-mode', next ? 'true' : 'false');
    this.applyTheme(next); // ← ADD THIS
  }

  set(value: boolean): void {
    this.darkMode$.next(value);
    localStorage.setItem('dailymom-dark-mode', value ? 'true' : 'false');
    this.applyTheme(value); // ← ADD THIS
  }

  private applyTheme(dark: boolean): void {
    document.body.classList.toggle('dark', dark);
  }
}