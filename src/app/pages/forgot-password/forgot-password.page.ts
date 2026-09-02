// forgot-password.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ForgotPasswordPage implements OnInit, OnDestroy {
  animReady = false;
  darkMode  = false;
  private themeSub!: Subscription;

  email        = '';
  emailFocused = false;
  touched      = false;
  emailError   = '';
  generalError = '';
  isLoading    = false;
  submitted    = false;

  constructor(
    private router: Router,
    private authService: AuthService,
    private theme: ThemeService
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));

    // Prefill from the email the user typed on the Login page, if any
    const navState = window.history.state as { email?: string } | undefined;
    if (navState?.email) {
      this.email = navState.email;
    }

    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }

  validateEmail(): void {
    this.touched = true;
    const value = this.email.trim();
    if (!value) {
      this.emailError = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      this.emailError = 'Please enter a valid email address.';
    } else {
      this.emailError = '';
    }
  }

  async onSubmit(): Promise<void> {
    this.validateEmail();
    if (this.emailError || this.isLoading) return;

    this.isLoading    = true;
    this.generalError = '';

    try {
      await this.authService.resetPassword(this.email.trim());
      this.submitted = true;
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found') {
        // Deliberately treated as success — never confirm or deny
        // whether an email is registered, to protect user privacy.
        this.submitted = true;
      } else {
        this.generalError = err?.message || 'Something went wrong. Please try again.';
      }
    } finally {
      this.isLoading = false;
    }
  }

  onResend(): void {
    this.submitted    = false;
    this.generalError = '';
  }

  onBack(): void {
    this.router.navigate(['/login']);
  }
}