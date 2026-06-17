// login.page.ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class LoginPage implements OnInit {
  animReady = false;

  loginForm = { email: '', password: '' };
  emailFocused = false;
  passFocused  = false;
  showPass     = false;
  isLoading    = false;

  // ── Validation errors ──────────────────────
  errors = {
    email:    '',
    password: '',
  };

  // ── Touched flags (show error only after user interacts) ──
  touched = {
    email:    false,
    password: false,
  };

  constructor(private router: Router) {}

  ngOnInit(): void {
    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });
  }

  // ── Validation helpers ─────────────────────
  validateEmail(): void {
    this.touched.email = true;
    if (!this.loginForm.email.trim()) {
      this.errors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.loginForm.email)) {
      this.errors.email = 'Please enter a valid email address.';
    } else {
      this.errors.email = '';
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
    // Mark all as touched so errors show on submit
    this.touched.email    = true;
    this.touched.password = true;
    this.validateEmail();
    this.validatePassword();
    return !this.errors.email && !this.errors.password;
  }

  // ── Sign In ────────────────────────────────
  async onSignIn(): Promise<void> {
    if (!this.isFormValid()) return;

    this.isLoading = true;
    // TODO: replace with real auth service call
    await new Promise(r => setTimeout(r, 1800));
    this.isLoading = false;
    this.router.navigate(['/home'], { replaceUrl: true });
  }

  onForgot(): void {
    this.router.navigate(['/forgot-password']);
  }

  onGoogle(): void {
    console.log('Google sign-in');
  }

  onApple(): void {
    console.log('Apple sign-in');
  }

  onRegister(): void {
    this.router.navigate(['/signup']);
  }
}