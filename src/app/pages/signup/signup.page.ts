// signup.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import {
  trigger, transition, style, animate, query, animateChild
} from '@angular/animations';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.page.html',
  styleUrls: ['./signup.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  animations: [
    trigger('slideStep', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(40px)' }),
        animate('400ms cubic-bezier(0.34,1.56,0.64,1)',
          style({ opacity: 1, transform: 'translateX(0)' })),
      ]),
      transition(':leave', [
        animate('250ms ease-in',
          style({ opacity: 0, transform: 'translateX(-40px)' })),
      ]),
    ]),
  ],
})
export class SignupPage implements OnInit, OnDestroy {

  animReady = false;
  step = 1;
  isLoading = false;

  steps = ['Account', 'Verify', 'Pregnancy', 'Clinic'];

  get stepLineWidth(): number {
    return ((this.step - 1) / (this.steps.length - 1)) * 100;
  }

  /* ── Form data ── */
  form = {
    fullName:        '',
    email:           '',
    mobile:          '',
    password:        '',
    confirmPassword: '',
    agreed:          false,
    dueDate:         '',
    weeksPregnant:   null as number | null,
    firstTimeMom:    null as boolean | null,
    clinicCode:      '',
    photoFile:       null as File | null,
  };

  photoPreview: string | null = null;

  /* ── Focus states ── */
  focus = {
  name: false,
  email: false,
  mobile: false,
  password: false,
  confirm: false,
  dueDate: false,
  clinicCode: false,
};

errors: {
  name: string;
  email: string;
  mobile: string;
  password: string;
  confirm: string;
  terms: string;
} = {
  name: '',
  email: '',
  mobile: '',
  password: '',
  confirm: '',
  terms: '',
};

  /* ── Password visibility ── */
  show = { password: false, confirm: false };

  /* ── Password strength ── */
  passwordStrength = 0;
  strengthLabels = ['Weak', 'Fair', 'Good', 'Strong'];

  /* ── OTP ── */
  otp: string[] = ['', '', '', '', '', ''];
  resendTimer = 60;
  private resendInterval: any;

  ngOnInit(): void {
    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });
  }

  ngOnDestroy(): void {
    if (this.resendInterval) clearInterval(this.resendInterval);
  }

  // ─── Photo ───────────────────────────────────────────────
  onPhotoClick(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e: any) => {
    const file: File = e.target.files[0];
    if (!file) return;
    this.form.photoFile = file;
    const reader = new FileReader();
    reader.onload = (r) => {
      if (r.target && r.target.result) {
        this.photoPreview = r.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

  // ─── Validation ──────────────────────────────────────────
  validateName(): void {
    this.errors['name'] = this.form.fullName.trim().length < 2
      ? 'Please enter your full name'
      : '';
  }

  validateEmail(): void {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    this.errors['email'] = !re.test(this.form.email)
      ? 'Please enter a valid email address'
      : '';
  }

  validateMobile(): void {
    const digits = this.form.mobile.replace(/\D/g, '');
    this.errors['mobile'] = digits.length < 10
      ? 'Enter a valid Philippine mobile number'
      : '';
  }

  validatePassword(): void {
    this.errors['password'] = this.form.password.length < 8
      ? 'Password must be at least 8 characters'
      : '';
  }

  validateConfirm(): void {
    this.errors['confirm'] = this.form.password !== this.form.confirmPassword
      ? 'Passwords do not match'
      : '';
  }

  onPasswordChange(): void {
    const p = this.form.password;
    let score = 0;
    if (p.length >= 8)              score++;
    if (/[A-Z]/.test(p))           score++;
    if (/[0-9]/.test(p))           score++;
    if (/[^A-Za-z0-9]/.test(p))    score++;
    this.passwordStrength = score;
  }

  private isStep1Valid(): boolean {
    this.validateName();
    this.validateEmail();
    this.validateMobile();
    this.validatePassword();
    this.validateConfirm();
    if (!this.form.agreed) this.errors['terms'] = 'Please agree to the Terms & Conditions';
    else this.errors['terms'] = '';
    return !Object.values(this.errors).some(e => e);
  }

  // ─── Step navigation ─────────────────────────────────────
  async onStep1(): Promise<void> {
    if (!this.isStep1Valid()) return;
    this.isLoading = true;
    // Simulate sending OTP
    await new Promise(r => setTimeout(r, 1400));
    this.isLoading = false;
    this.otp = ['', '', '', '', '', ''];
    this.startResendTimer();
    this.step = 2;
  }

  async onVerifyOtp(): Promise<void> {
    this.isLoading = true;
    await new Promise(r => setTimeout(r, 1200));
    this.isLoading = false;
    this.step = 3;
  }

  onStep3(): void {
    this.step = 4;
  }

  skipToStep4(): void {
    this.step = 4;
  }

  async onStep4(): Promise<void> {
    this.isLoading = true;
    await new Promise(r => setTimeout(r, 1200));
    this.isLoading = false;
    this.router.navigate(['/home'], { replaceUrl: true });
  }

  onSkipClinic(): void {
    this.router.navigate(['/home'], { replaceUrl: true });
  }

  onBack(): void {
    if (this.step > 1) this.step--;
  }

  // ─── OTP input helpers ───────────────────────────────────
  onOtpInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const val = input.value.replace(/\D/g, '');
    this.otp[index] = val.slice(-1);
    if (val && index < 5) {
      (document.getElementById(`otp-${index + 1}`) as HTMLInputElement)?.focus();
    }
  }

  onOtpKey(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace' && !this.otp[index] && index > 0) {
      (document.getElementById(`otp-${index - 1}`) as HTMLInputElement)?.focus();
    }
  }

  // ─── Resend timer ─────────────────────────────────────────
  startResendTimer(): void {
    this.resendTimer = 60;
    if (this.resendInterval) clearInterval(this.resendInterval);
    this.resendInterval = setInterval(() => {
      this.resendTimer--;
      if (this.resendTimer <= 0) clearInterval(this.resendInterval);
    }, 1000);
  }

  onResend(): void {
    this.otp = ['', '', '', '', '', ''];
    this.startResendTimer();
    // TODO: call your OTP resend API here
  }

  // ─── Due date auto-calc ──────────────────────────────────
  onDueDateChange(): void {
    if (!this.form.dueDate) { this.form.weeksPregnant = null; return; }
    const due = new Date(this.form.dueDate);
    const today = new Date();
    const diffMs = due.getTime() - today.getTime();
    const weeksLeft = Math.round(diffMs / (1000 * 60 * 60 * 24 * 7));
    this.form.weeksPregnant = Math.max(0, 40 - weeksLeft);
  }

  // ─── Social / links ──────────────────────────────────────
  onGoogle(): void {
    // TODO: integrate Google OAuth
    console.log('Google sign-up');
  }

  onConnectProvider(): void {
    // TODO: open provider search modal
    console.log('Connect provider');
  }

  onTerms(): void {
    // TODO: open terms modal or navigate
  }

  onPrivacy(): void {
    // TODO: open privacy modal or navigate
  }

  onLogin(): void {
    this.router.navigate(['/login']);
  }

  constructor(private router: Router) {}
}