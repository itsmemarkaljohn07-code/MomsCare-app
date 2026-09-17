// login.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class LoginPage implements OnInit, OnDestroy {
  animReady = false;
  darkMode  = false;
  private themeSub!: Subscription;

  loginForm    = { username: '', password: '' };
  emailFocused = false;
  passFocused  = false;
  showPass     = false;
  isLoading    = false;
  rememberMe   = false;

    errors = {
    username: '',
    password: '',
    general:  '',
  };

  touched = {
    username: false,
    password: false,
  };

  constructor(
    private router: Router,
    private authService: AuthService,
    private theme: ThemeService
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));

    // If a previous login had "Remember me" checked, prefill the email
    // and restore the checkbox state (only the email is ever stored —
    // the password itself is never persisted anywhere by this app).
    const remembered = this.authService.getRememberedUsername();
    if (remembered) {
      this.loginForm.username = remembered;
      this.rememberMe = true;
    }

    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }

  // ── Validation ─────────────────────────────────
  validateUsername(): void {
    this.touched.username = true;
    const username = this.loginForm.username.trim();
    if (!username) {
      this.errors.username = 'Username is required.';
    } else {
      this.errors.username = '';
    }
  }

  validatePassword(): void {
    this.touched.password = true;
    if (!this.loginForm.password) {
      this.errors.password = 'Password is required.';
    } else if (this.loginForm.password.length < 6) {
      this.errors.password = 'Password must be at least 6 characters.';
    } else {
      this.errors.password = '';
    }
  }

  private isFormValid(): boolean {
    this.touched.username = true;
    this.touched.password = true;
    this.validateUsername();
    this.validatePassword();
    return !this.errors.username && !this.errors.password;
  }

  // ── Sign In with Firebase ──────────────────────
  async onSignIn(): Promise<void> {
    if (!this.isFormValid()) return;

    this.isLoading    = true;
    this.errors.general = '';

      try {
      await this.authService.loginWithUsername(
        this.loginForm.username.trim(),
        this.loginForm.password,
        this.rememberMe
      );

      if (this.rememberMe) {
        this.authService.rememberUsername(this.loginForm.username.trim());
      } else {
        this.authService.forgetRememberedUsername();
      }

      // Login successful — navigate to home
      this.router.navigate(['/home'], { replaceUrl: true });
    } catch (err: any) {
      // Map Firebase error codes to friendly messages
      switch (err.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          this.errors.general = 'Incorrect email or password. Please try again.';
          break;
        case 'auth/user-disabled':
          this.errors.general = 'This account has been disabled.';
          break;
        case 'auth/too-many-requests':
          this.errors.general = 'Too many attempts. Please try again later.';
          break;
        default:
          this.errors.general = 'Login failed. Please check your connection and try again.';
      }
    } finally {
      this.isLoading = false;
    }
  }

  onBack(): void { this.router.navigate(['/welcome']); }

      onForgot(): void {
    this.router.navigate(['/forgot-password']);
  }

  onRegister(): void { this.router.navigate(['/signup']); }
}