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
import { Auth, fetchSignInMethodsForEmail } from '@angular/fire/auth';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';
import { runInInjectionContext, EnvironmentInjector, inject } from '@angular/core';

interface CalCell {
  day: number | null;
  date: Date | null;
  isToday: boolean;
  selected: boolean;
  disabled: boolean;
}

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
  isLoading = false;

  // Step numbering:
  // 1 = Account info
  // 2 = OTP
  // 3 = Know due date? (yes/no)
  // 31 = Calendar picker for known due date
  // 32 = Calc method (LMP or weeks)
  // 33 = LMP calendar picker
  // 34 = Weeks drum picker
  // 4 = First-time mom + show calculated result
  // 5 = Clinic connection
  step = 1;

  // Progress bar: map steps to a 0–100 value
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
    dueDate:         '' as string,        // ISO string
    lmpDate:         '' as string,        // ISO string
    weeksPregnant:   null as number | null,
    firstTimeMom:    null as boolean | null,
  };

  // Key used to preserve in-progress signup data in sessionStorage while
  // the user is away on the Terms/Privacy pages, so they don't lose
  // anything they've already typed.
  private readonly DRAFT_KEY = 'momscare_signup_draft';

  // Pregnancy flow state
  knowsDueDate: boolean | null = null;
  calcMethod: 'lmp' | 'weeks' | null = null;

  /* ── Focus / errors ── */
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
  calMonth = new Date().getMonth(); // 0-indexed
  calCells: CalCell[] = [];

  readonly MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];

  get calMonthLabel(): string {
    return `${this.MONTHS[this.calMonth]} ${this.calYear}`;
  }

  /* ── Weeks drum picker ── */
  readonly weekOptions: number[] = Array.from({ length: 40 }, (_, i) => i + 1);
  private drumScrollTimer: any;

  generalError = '';
  checkingEmail = false;

  private envInjector = inject(EnvironmentInjector);

  constructor(
    private router: Router,
    private authService: AuthService,
    private otpService: OtpService,
    private auth: Auth,
    private firestore: Firestore
  ) {}

  ngOnInit(): void {
    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });
    this.restoreDraftIfAny();
    this.buildCalendar();
  }

  ngAfterViewInit(): void {}

  ngOnDestroy(): void {
    if (this.resendInterval) clearInterval(this.resendInterval);
  }

  // ───────────────────────────────────────────────
  // CALENDAR BUILDER
  // ───────────────────────────────────────────────
  buildCalendar(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDay = new Date(this.calYear, this.calMonth, 1);
    const startDow  = firstDay.getDay(); // 0=Sun
    const daysInMonth = new Date(this.calYear, this.calMonth + 1, 0).getDate();

    const cells: CalCell[] = [];

    // Leading empty cells
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
    // Due date picker: must be in the future (at least today)
    if (this.step === 31) return date < today;
    // LMP picker: must be in the past (up to today)
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
    // Compute weeks pregnant from due date
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

  async onFinish(): Promise<void> {
    this.isLoading    = true;
    this.generalError = '';
    try {
      await this.authService.register(
        this.form.email.trim(),
        this.form.password,
        {
          fullName:      this.form.fullName.trim(),
          mobile:        this.form.mobile.trim(),
          dueDate:       this.form.dueDate       || '',
          weeksPregnant: this.form.weeksPregnant !== null ? this.form.weeksPregnant : 0,
          lmpDate:       this.form.lmpDate       || '',
          firstTimeMom:  this.form.firstTimeMom  === true,
          // Connect Clinic is disabled for now — left blank until that
          // feature is implemented.
          clinicName:    '',
        }
      );
      this.isLoading = false;
      this.router.navigate(['/home'], { replaceUrl: true });
    } catch (err: any) {
      this.isLoading = false;
      console.error('Registration error:', err);
      this.router.navigate(['/home'], { replaceUrl: true });
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
  // STEP 1
  // ───────────────────────────────────────────────
  validateName(): void {
    this.errors.name = this.form.fullName.trim().length < 2
      ? 'Please enter your full name' : '';
  }
  validateEmail(): void {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    this.errors.email = !re.test(this.form.email)
      ? 'Please enter a valid email address' : '';
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

  /** Checks whether the email's domain has valid MX records (i.e. can
   *  receive mail at all). This catches typo'd/fake domains but — by the
   *  nature of how email works — cannot confirm a *specific mailbox*
   *  (e.g. "aljohnoit2004") actually exists at a real provider like Gmail.
   *  That level of verification isn't reliably possible for any app,
   *  including paid enterprise tools, due to providers blocking that kind
   *  of probing. The OTP step itself is what proves the mailbox is real
   *  and reachable by the user. */
  private async isDomainDeliverable(email: string): Promise<boolean> {
    const domain = email.split('@')[1]?.trim().toLowerCase();
    if (!domain) return false;

    try {
      const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
      if (!res.ok) return true; // fail open — don't block signups if the DNS API itself is down
      const data = await res.json();
      return Array.isArray(data.Answer) && data.Answer.length > 0;
    } catch (err) {
      console.warn('MX lookup failed, allowing signup to proceed:', err);
      return true; // fail open on network errors
    }
  }

  async onStep1(): Promise<void> {
    if (!this.isStep1Valid()) return;

    this.isLoading     = true;
    this.checkingEmail = true;
    this.generalError  = '';
    this.errors.email  = '';
    this.errors.name   = '';

    const domainOk = await this.isDomainDeliverable(this.form.email.trim());
    if (!domainOk) {
      this.errors.email  = "This email domain doesn't appear to accept email. Please check for typos.";
      this.isLoading     = false;
      this.checkingEmail = false;
      return;
    }

    this.otp = ['', '', '', '', '', ''];

    try {
      const checksPromise = runInInjectionContext(this.envInjector, () =>
        Promise.all([
          fetchSignInMethodsForEmail(this.auth, this.form.email.trim()),
          getDocs(query(
            collection(this.firestore, 'users'),
            where('fullName', '==', this.form.fullName.trim())
          ))
        ])
      );

      // Fire the OTP email at the same time as the uniqueness checks
      // instead of waiting for them to finish first — this overlaps
      // the two network round-trips instead of stacking them.
      const otpPromise = this.sendOtpEmail();

      const [methods, nameSnap] = await checksPromise;

      if (methods && methods.length > 0) {
        this.errors.email = 'This email is already registered. Please sign in instead.';
        return; // otpPromise still resolves quietly in the background — no UI shown for it
      }

      if (!nameSnap.empty) {
        this.errors.name = 'This name is already taken. Please use a different name.';
        return;
      }

      this.step = 2;
      this.beginResendCountdown();
      await otpPromise; // make sure emailSent/isSendingEmail have settled before dropping the loading state

    } catch (err: any) {
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

  /** Sends the OTP email and updates the sending/sent UI flags. Can be
   *  fired in parallel with other work (e.g. uniqueness checks) rather
   *  than always awaited sequentially — this is what makes Step 1 → 2
   *  feel faster, since the email is already in flight by the time the
   *  uniqueness checks resolve. */
  private sendOtpEmail(): Promise<void> {
    this.otpError       = '';
    this.otpVerified     = false;
    this.isSendingEmail = true;

    return this.otpService.sendOtp(this.form.email.trim(), this.form.fullName.trim())
      .then(() => { this.emailSent = true; })
      .catch(err => {
        console.error('OTP email error:', err);
        this.otpError = 'Failed to send verification code. Please check your email and try again.';
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

  /** Used by the standalone "Resend Code" flow (Step 2 already visible),
   *  where there's nothing else to parallelize against. */
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
  // DRAFT PERSISTENCE (so Terms/Privacy don't lose signup progress)
  // ───────────────────────────────────────────────
  /** Note: this briefly stores the password in sessionStorage (cleared
   *  the moment the user returns to Signup, and scoped to this browser
   *  tab only). This is a reasonable tradeoff for preserving the user's
   *  progress, but flagging it here for transparency. */
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
      if (parsed.step === 1) this.step = parsed.step; // only step 1 is relevant here
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