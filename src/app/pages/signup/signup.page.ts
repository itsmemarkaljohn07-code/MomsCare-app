// signup.page.ts
import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import {
  trigger, transition, style, animate
} from '@angular/animations';
import { AuthService } from '../../services/auth.service';
import { OtpService } from '../../services/otp.service';
import { ThemeService } from '../../services/theme';
import { Auth, fetchSignInMethodsForEmail } from '@angular/fire/auth';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';
import { runInInjectionContext, EnvironmentInjector, inject } from '@angular/core';
import { Subscription } from 'rxjs';

interface CalCell {
  day: number | null;
  date: Date | null;
  isToday: boolean;
  selected: boolean;
  disabled: boolean;
}

// Bounded wait times so no step of signup can spin forever — see
// withTimeout() below for details.
const PRECHECK_TIMEOUT_MS = 20000;
const OTP_SEND_TIMEOUT_MS = 25000;

@Component({
  selector: 'app-signup',
  templateUrl: './signup.page.html',
  styleUrls: ['./signup.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, DatePipe],
  animations: [
    trigger('slideStep', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(32px)' }),
        animate('380ms cubic-bezier(0.34,1.56,0.64,1)',
          style({ opacity: 1, transform: 'translateX(0)' })),
      ]),
      transition(':leave', [
        animate('220ms ease-in',
          style({ opacity: 0, transform: 'translateX(-32px)' })),
      ]),
    ]),
  ],
})
export class SignupPage implements OnInit, OnDestroy, AfterViewInit {

  @ViewChild('drumList') drumListRef!: ElementRef<HTMLElement>;

  animReady = false;
  darkMode  = false;
  isLoading = false;
  private themeSub!: Subscription;

  // Step numbering:
  // 1 = Account info
  // 2 = OTP
  // 3 = Know due date? (yes/no)
  // 31 = Calendar picker for known due date
  // 32 = Calc method (LMP or weeks)
  // 33 = LMP calendar picker
  // 34 = Weeks drum picker
  // 4 = First-time mom + finish
  step = 1;

  get stepPercent(): number {
    const map: Record<number, number> = {
      1: 14, 2: 28, 3: 42, 31: 55, 32: 55, 33: 65, 34: 65, 4: 90,
    };
    return map[this.step] ?? 0;
  }

  /* ── Form ── */
  form = {
    fullName:        '',
    email:           '',
    mobile:          '',
    password:        '',
    confirmPassword: '',
    agreed:          false,
    dueDate:         '' as string,
    lmpDate:         '' as string,
    weeksPregnant:   null as number | null,
    firstTimeMom:    null as boolean | null,
  };

  private readonly DRAFT_KEY = 'momscare_signup_draft';

  knowsDueDate: boolean | null = null;
  calcMethod: 'lmp' | 'weeks' | null = null;

  focus = {
    name: false, email: false, mobile: false,
    password: false, confirm: false, dueDate: false,
  };
  errors = {
    name: '', email: '', mobile: '', password: '', confirm: '', terms: '',
  };

  show = { password: false, confirm: false };
  passwordStrength = 0;
  strengthLabels = ['Weak', 'Fair', 'Good', 'Strong'];

  /* ── OTP ── */
  otp: string[] = ['', '', '', '', '', ''];
  resendTimer    = 60;
  otpError       = '';
  otpVerified    = false;
  emailSent      = false;
  isSendingEmail = false;
  private resendInterval: any;

  /* ── Calendar ── */
  calYear  = new Date().getFullYear();
  calMonth = new Date().getMonth();
  calCells: CalCell[] = [];

  readonly MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];

  get calMonthLabel(): string {
    return `${this.MONTHS[this.calMonth]} ${this.calYear}`;
  }

  readonly weekOptions: number[] = Array.from({ length: 40 }, (_, i) => i + 1);
  private drumScrollTimer: any;

  generalError = '';
  checkingEmail = false;

  /** True when Firebase Auth account creation succeeded but the
   *  Firestore profile write failed. In this state, tapping the action
   *  button retries ONLY the profile save (registering again would fail
   *  with "email already in use" since the account already exists). */
  accountCreatedPendingProfile = false;

  private envInjector = inject(EnvironmentInjector);

  constructor(
    private router: Router,
    private authService: AuthService,
    private otpService: OtpService,
    private theme: ThemeService,
    private auth: Auth,
    private firestore: Firestore
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });
    this.restoreDraftIfAny();
    this.buildCalendar();
  }

  ngAfterViewInit(): void {}

  ngOnDestroy(): void {
    if (this.resendInterval) clearInterval(this.resendInterval);
    this.themeSub?.unsubscribe();
  }

  /** Races `promise` against a timer so an await on it can never hang
   *  the UI forever — see the same helper in auth.service.ts for the
   *  full rationale. Used here for the Step-1 uniqueness pre-checks and
   *  the OTP send, which have the exact same "unresolved Firebase
   *  promise" hang risk as account creation does. */
  private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let handle: any;
    const timeout = new Promise<never>((_, reject) => {
      handle = setTimeout(() => {
        const err: any = new Error(message);
        err.code = 'timeout';
        reject(err);
      }, ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(handle)) as Promise<T>;
  }

  // ───────────────────────────────────────────────
  // CALENDAR BUILDER
  // ───────────────────────────────────────────────
  buildCalendar(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDay = new Date(this.calYear, this.calMonth, 1);
    const startDow  = firstDay.getDay();
    const daysInMonth = new Date(this.calYear, this.calMonth + 1, 0).getDate();

    const cells: CalCell[] = [];

    for (let i = 0; i < startDow; i++) {
      cells.push({ day: null, date: null, isToday: false, selected: false, disabled: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(this.calYear, this.calMonth, d);
      date.setHours(0, 0, 0, 0);
      cells.push({
        day: d,
        date,
        isToday: date.getTime() === today.getTime(),
        selected: this.isDateSelected(date),
        disabled: this.isCellDisabled(date),
      });
    }

    this.calCells = cells;
  }

  private isDateSelected(date: Date): boolean {
    if (this.step === 31 && this.form.dueDate) {
      return new Date(this.form.dueDate).toDateString() === date.toDateString();
    }
    if (this.step === 33 && this.form.lmpDate) {
      return new Date(this.form.lmpDate).toDateString() === date.toDateString();
    }
    return false;
  }

  private isCellDisabled(date: Date): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (this.step === 31) return date < today;
    if (this.step === 33) return date > today;
    return false;
  }

  prevMonth(): void {
    if (this.calMonth === 0) { this.calMonth = 11; this.calYear--; }
    else this.calMonth--;
    this.buildCalendar();
  }

  nextMonth(): void {
    if (this.calMonth === 11) { this.calMonth = 0; this.calYear++; }
    else this.calMonth++;
    this.buildCalendar();
  }

  selectDueDate(cell: CalCell): void {
    if (!cell.date || cell.disabled) return;
    this.form.dueDate = cell.date.toISOString();
    const today = new Date();
    const weeksLeft = Math.round((cell.date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7));
    this.form.weeksPregnant = Math.max(0, 40 - weeksLeft);
    this.buildCalendar();
  }

  selectLmpDate(cell: CalCell): void {
    if (!cell.date || cell.disabled) return;
    this.form.lmpDate = cell.date.toISOString();
    this.buildCalendar();
  }

  // ───────────────────────────────────────────────
  // WEEKS DRUM
  // ───────────────────────────────────────────────
  selectWeek(w: number): void {
    this.form.weeksPregnant = w;
    if (this.drumListRef) {
      const itemHeight = 52;
      const spacer = 104;
      const idx = this.weekOptions.indexOf(w);
      this.drumListRef.nativeElement.scrollTo({
        top: idx * itemHeight + spacer - 104,
        behavior: 'smooth',
      });
    }
  }

  onDrumScroll(): void {
    clearTimeout(this.drumScrollTimer);
    this.drumScrollTimer = setTimeout(() => {
      if (!this.drumListRef) return;
      const el = this.drumListRef.nativeElement;
      const itemHeight = 52;
      const spacer = 104;
      const scrollTop = el.scrollTop;
      const idx = Math.round((scrollTop - spacer + 104) / itemHeight);
      const clampedIdx = Math.max(0, Math.min(idx, this.weekOptions.length - 1));
      this.form.weeksPregnant = this.weekOptions[clampedIdx];
      el.scrollTo({ top: clampedIdx * itemHeight + spacer - 104, behavior: 'smooth' });
    }, 80);
  }

  // ───────────────────────────────────────────────
  // STEP NAVIGATION
  // ───────────────────────────────────────────────
  onKnowsDueDateNext(): void {
    if (this.knowsDueDate === true) {
      const next = new Date();
      next.setMonth(next.getMonth() + 1);
      this.calYear  = next.getFullYear();
      this.calMonth = next.getMonth();
      this.buildCalendar();
      this.step = 31;
    } else {
      this.step = 32;
    }
  }

  onCalcMethodNext(): void {
    if (this.calcMethod === 'lmp') {
      const past = new Date();
      past.setMonth(past.getMonth() - 2);
      this.calYear  = past.getFullYear();
      this.calMonth = past.getMonth();
      this.buildCalendar();
      this.step = 33;
    } else {
      this.step = 34;
    }
  }

  onDueDateConfirmed(): void {
    this.step = 4;
  }

  onLmpConfirmed(): void {
    const lmp = new Date(this.form.lmpDate);
    const due = new Date(lmp.getTime() + 280 * 24 * 60 * 60 * 1000);
    this.form.dueDate = due.toISOString();
    const today = new Date();
    const daysSinceLmp = Math.round((today.getTime() - lmp.getTime()) / (1000 * 60 * 60 * 24));
    this.form.weeksPregnant = Math.max(0, Math.floor(daysSinceLmp / 7));
    this.step = 4;
  }

  onWeeksConfirmed(): void {
    if (!this.form.weeksPregnant) return;
    const remaining = (40 - this.form.weeksPregnant) * 7;
    const due = new Date(Date.now() + remaining * 24 * 60 * 60 * 1000);
    this.form.dueDate = due.toISOString();
    this.step = 4;
  }

  /** Assembles the pregnancy/profile payload from the current form state.
   *  Shared by both onFinish() and onRetryProfileSave() so the two never
   *  drift out of sync. */
  private buildProfilePayload() {
    return {
      fullName:      this.form.fullName.trim(),
      mobile:        this.form.mobile.trim(),
      dueDate:       this.form.dueDate       || '',
      weeksPregnant: this.form.weeksPregnant !== null ? this.form.weeksPregnant : 0,
      lmpDate:       this.form.lmpDate       || '',
      firstTimeMom:  this.form.firstTimeMom  === true,
      clinicName:    '',
    };
  }

  /** Final step. `isLoading` is reset in `finally` — guaranteed to run
   *  regardless of which branch executes — rather than being duplicated
   *  in both the try and catch blocks, which is what allowed earlier
   *  versions to silently miss resetting it on some paths. Combined with
   *  the timeout guard inside AuthService.register(), this function is
   *  now guaranteed to always either navigate to Home or show an error —
   *  it can never spin forever. */
  async onFinish(): Promise<void> {
    if (this.form.firstTimeMom === null || this.isLoading) return;

    this.isLoading    = true;
    this.generalError = '';

    try {
      await this.authService.register(
        this.form.email.trim(),
        this.form.password,
        this.buildProfilePayload()
      );
      this.router.navigate(['/home'], { replaceUrl: true });
    } catch (err: any) {
      console.error('Registration error:', err);

      if (err?.code === 'profile-save-failed') {
        // The Firebase Auth account WAS created — only the Firestore
        // profile write failed. Offer a retry that doesn't re-register.
        this.accountCreatedPendingProfile = true;
        this.generalError = err.message ||
          "We created your account, but couldn't save your pregnancy details.";
      } else {
        // Nothing was created (or we can't tell) — stay on this step,
        // show the error, do NOT navigate.
        this.generalError = err?.message || 'Something went wrong while creating your account. Please try again.';
      }
    } finally {
      this.isLoading = false;
    }
  }

  /** Used only when accountCreatedPendingProfile is true: retries saving
   *  the Firestore profile for the already-created Auth account. */
  async onRetryProfileSave(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading    = true;
    this.generalError = '';

    try {
      await this.authService.retryProfileSave(this.buildProfilePayload());
      this.accountCreatedPendingProfile = false;
      this.router.navigate(['/home'], { replaceUrl: true });
    } catch (err: any) {
      console.error('Profile retry error:', err);
      this.generalError = err?.message ||
        'Still unable to save your details. Please check your connection and try again.';
    } finally {
      this.isLoading = false;
    }
  }

  onBack(): void {
    const backMap: Record<number, number> = {
      2: 1, 3: 2, 31: 3, 32: 3, 33: 32, 34: 32, 4: 3,
    };
    if (backMap[this.step] !== undefined) {
      this.step = backMap[this.step];
    } else {
      this.router.navigate(['/welcome']);
    }
  }

  // ───────────────────────────────────────────────
  // STEP 1 — VALIDATION
  // ───────────────────────────────────────────────
  validateName(): void {
    this.errors.name = this.form.fullName.trim().length < 2
      ? 'Please enter your full name' : '';
  }

  validateEmail(): void {
    const email = this.form.email.trim();
    this.form.email = email;

    if (!email) {
      this.errors.email = 'Email address is required.';
      return;
    }
    if (/\s/.test(email)) {
      this.errors.email = 'Email address cannot contain spaces.';
      return;
    }
    if (!email.includes('@')) {
      this.errors.email = 'Email address must include an "@".';
      return;
    }

    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    const [local, domain] = email.split('@');

    if (!re.test(email) || local.startsWith('.') || local.endsWith('.') || email.includes('..')) {
      this.errors.email = 'Please enter a valid email address.';
      return;
    }
    if (!domain || !domain.includes('.')) {
      this.errors.email = 'Email address must include a domain (e.g. example.com).';
      return;
    }

    this.errors.email = '';
  }

  validateMobile(): void {
    const digits = this.form.mobile.replace(/\D/g, '');
    this.errors.mobile = digits.length < 10
      ? 'Enter a valid Philippine mobile number' : '';
  }
  validatePassword(): void {
    this.errors.password = this.form.password.length < 8
      ? 'Password must be at least 8 characters' : '';
  }
  validateConfirm(): void {
    this.errors.confirm = this.form.password !== this.form.confirmPassword
      ? 'Passwords do not match' : '';
  }
  onPasswordChange(): void {
    const p = this.form.password;
    let score = 0;
    if (p.length >= 8)           score++;
    if (/[A-Z]/.test(p))        score++;
    if (/[0-9]/.test(p))        score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    this.passwordStrength = score;
  }

  private isStep1Valid(): boolean {
    this.validateName(); this.validateEmail();
    this.validateMobile(); this.validatePassword(); this.validateConfirm();
    this.errors.terms = !this.form.agreed ? 'Please agree to the Terms & Conditions' : '';
    return !Object.values(this.errors).some(e => e);
  }

  private async isDomainDeliverable(email: string): Promise<boolean> {
    const domain = email.split('@')[1]?.trim().toLowerCase();
    if (!domain) return false;

    try {
      const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
      if (!res.ok) return true;
      const data = await res.json();
      return Array.isArray(data.Answer) && data.Answer.length > 0;
    } catch (err) {
      console.warn('MX lookup failed, allowing signup to proceed:', err);
      return true;
    }
  }

  /** Step 1 already reset isLoading/checkingEmail in a finally block, but
   *  that only protects against the checksPromise REJECTING — a hang
   *  (never settling) would still have frozen this screen forever before
   *  this fix. checksPromise is now timeout-guarded the same way. */
  async onStep1(): Promise<void> {
    this.form.email = this.form.email.trim();

    if (!this.isStep1Valid()) return;

    this.isLoading     = true;
    this.checkingEmail = true;
    this.generalError  = '';
    this.errors.email  = '';
    this.errors.name   = '';

    const domainOk = await this.isDomainDeliverable(this.form.email);
    if (!domainOk) {
      this.errors.email  = "This email domain doesn't appear to accept email. Please check for typos.";
      this.isLoading     = false;
      this.checkingEmail = false;
      return;
    }

    this.otp = ['', '', '', '', '', ''];

    try {
      const checksPromise = this.withTimeout(
        runInInjectionContext(this.envInjector, () =>
          Promise.all([
            fetchSignInMethodsForEmail(this.auth, this.form.email),
            getDocs(query(
              collection(this.firestore, 'users'),
              where('fullName', '==', this.form.fullName.trim())
            ))
          ])
        ),
        PRECHECK_TIMEOUT_MS,
        'Checking availability is taking too long.'
      );

      const otpPromise = this.sendOtpEmail();

      const [methods, nameSnap] = await checksPromise;

      if (methods && methods.length > 0) {
        this.errors.email = 'This email is already registered. Please sign in instead.';
        return;
      }

      if (!nameSnap.empty) {
        this.errors.name = 'This name is already taken. Please use a different name.';
        return;
      }

      this.step = 2;
      this.beginResendCountdown();
      await otpPromise;

    } catch (err: any) {
      // Best-effort pre-check: a timeout or any other failure here is
      // not fatal — fall through to the OTP step regardless, exactly as
      // before. The timeout guard's job is only to guarantee this catch
      // is actually reached instead of hanging forever first.
      console.warn('Pre-check error, proceeding anyway:', err);
      this.step = 2;
      this.beginResendCountdown();
    } finally {
      this.isLoading     = false;
      this.checkingEmail = false;
    }
  }

  // ───────────────────────────────────────────────
  // OTP (EmailJS — email-based, no Firestore, no hang)
  // ───────────────────────────────────────────────
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

  /** Wrapped with a timeout for the same reason as everything else here:
   *  without it, an unresolving otpService.sendOtp() call would leave
   *  isSendingEmail=true forever, since .finally() only runs once the
   *  promise settles. */
  private sendOtpEmail(): Promise<void> {
    this.otpError       = '';
    this.otpVerified     = false;
    this.isSendingEmail = true;

    return this.withTimeout(
      this.otpService.sendOtp(this.form.email.trim(), this.form.fullName.trim()),
      OTP_SEND_TIMEOUT_MS,
      'Sending the verification code is taking too long.'
    )
      .then(() => { this.emailSent = true; })
      .catch(err => {
        console.error('OTP email error:', err);
        this.otpError = err?.code === 'timeout'
          ? `${err.message} Please check your connection and try again.`
          : 'Failed to send verification code. Please check your email and try again.';
        this.emailSent = false;
      })
      .finally(() => { this.isSendingEmail = false; });
  }

  private beginResendCountdown(): void {
    this.resendTimer = 60;
    if (this.resendInterval) clearInterval(this.resendInterval);
    this.resendInterval = setInterval(() => {
      this.resendTimer--;
      if (this.resendTimer <= 0) clearInterval(this.resendInterval);
    }, 1000);
  }

  async onResend(): Promise<void> {
    this.otp      = ['', '', '', '', '', ''];
    this.otpError = '';
    this.emailSent  = false;
    await this.sendOtpEmail();
    this.beginResendCountdown();
  }

  async onVerifyOtp(): Promise<void> {
    const entered = this.otp.join('');

    if (entered.length < 6) {
      this.otpError = 'Please enter the complete 6-digit code.';
      return;
    }

    this.isLoading = true;
    this.otpError  = '';

    const result = this.otpService.verifyOtp(this.form.email.trim(), entered);

    if (result === 'not_found') {
      this.otpError = 'No code found. Please request a new one.';
      this.otp = ['', '', '', '', '', ''];
      this.isLoading = false;
      return;
    }
    if (result === 'expired') {
      this.otpError = 'This code has expired. Please request a new one.';
      this.otp = ['', '', '', '', '', ''];
      this.isLoading = false;
      return;
    }
    if (result === 'invalid') {
      this.otpError = 'Incorrect code. Please try again.';
      this.otp = ['', '', '', '', '', ''];
      this.isLoading = false;
      setTimeout(() => {
        (document.getElementById('otp-0') as HTMLInputElement)?.focus();
      }, 100);
      return;
    }

    // ✅ result === 'valid'
    this.otpError    = '';
    this.otpVerified = true;

    await new Promise(r => setTimeout(r, 300));

    this.isLoading     = false;
    this.knowsDueDate  = null;
    this.calcMethod    = null;
    this.step = 3;
  }

  // ───────────────────────────────────────────────
  // DRAFT PERSISTENCE
  // ───────────────────────────────────────────────
  private saveDraft(): void {
    try {
      sessionStorage.setItem(this.DRAFT_KEY, JSON.stringify({
        form: this.form,
        step: this.step,
      }));
    } catch { /* sessionStorage unavailable — draft just won't persist */ }
  }

  private restoreDraftIfAny(): void {
    try {
      const raw = sessionStorage.getItem(this.DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.form) this.form = { ...this.form, ...parsed.form };
      if (parsed.step === 1) this.step = parsed.step;
      sessionStorage.removeItem(this.DRAFT_KEY);
    } catch { /* ignore corrupt/missing draft */ }
  }

  // ───────────────────────────────────────────────
  // MISC
  // ───────────────────────────────────────────────
  onGoogle(): void { console.log('Google sign-up'); }
  onTerms(): void {
    this.saveDraft();
    this.router.navigate(['/terms'], { state: { fromSignup: true } });
  }
  onPrivacy(): void {
    this.saveDraft();
    this.router.navigate(['/privacy'], { state: { fromSignup: true } });
  }
  onLogin(): void { this.router.navigate(['/login']); }
}