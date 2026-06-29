// signup.page.ts
import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import {
  trigger, transition, style, animate
} from '@angular/animations';

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
      1: 12, 2: 25, 3: 40, 31: 52, 32: 52, 33: 62, 34: 62, 4: 76, 5: 90,
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
    clinicCode:      '',
  };

  // Pregnancy flow state
  knowsDueDate: boolean | null = null;
  calcMethod: 'lmp' | 'weeks' | null = null;

  /* ── Focus / errors ── */
  focus = {
    name: false, email: false, mobile: false,
    password: false, confirm: false, dueDate: false, clinicCode: false,
  };
  errors = {
    name: '', email: '', mobile: '', password: '', confirm: '', terms: '',
  };

  show = { password: false, confirm: false };
  passwordStrength = 0;
  strengthLabels = ['Weak', 'Fair', 'Good', 'Strong'];

  /* ── OTP ── */
  otp: string[] = ['', '', '', '', '', ''];
  resendTimer = 60;
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

  constructor(private router: Router) {}

  ngOnInit(): void {
    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });
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
    // Scroll to center the selected item
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
      // Snap
      el.scrollTo({ top: clampedIdx * itemHeight + spacer - 104, behavior: 'smooth' });
    }, 80);
  }

  // ───────────────────────────────────────────────
  // STEP NAVIGATION
  // ───────────────────────────────────────────────
  onKnowsDueDateNext(): void {
    if (this.knowsDueDate === true) {
      // Set calendar to future months for due date picker
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
      // Set calendar to recent past months
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
    // Calculate due date from LMP: add 280 days (40 weeks)
    const lmp = new Date(this.form.lmpDate);
    const due = new Date(lmp.getTime() + 280 * 24 * 60 * 60 * 1000);
    this.form.dueDate = due.toISOString();
    // Calculate weeks pregnant
    const today = new Date();
    const daysSinceLmp = Math.round((today.getTime() - lmp.getTime()) / (1000 * 60 * 60 * 24));
    this.form.weeksPregnant = Math.max(0, Math.floor(daysSinceLmp / 7));
    this.step = 4;
  }

  onWeeksConfirmed(): void {
    if (!this.form.weeksPregnant) return;
    // Estimate due date: today + (40 - weeksPregnant) weeks
    const remaining = (40 - this.form.weeksPregnant) * 7;
    const due = new Date(Date.now() + remaining * 24 * 60 * 60 * 1000);
    this.form.dueDate = due.toISOString();
    this.step = 4;
  }

  goToClinic(): void {
    this.step = 5;
  }

  async onFinish(): Promise<void> {
    this.isLoading = true;
    await new Promise(r => setTimeout(r, 1200));
    this.isLoading = false;
    this.router.navigate(['/home'], { replaceUrl: true });
  }

  onSkipClinic(): void {
    this.router.navigate(['/home'], { replaceUrl: true });
  }

  onBack(): void {
    const backMap: Record<number, number> = {
      2: 1, 3: 2, 31: 3, 32: 3, 33: 32, 34: 32, 4: 3, 5: 4,
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

  async onStep1(): Promise<void> {
    if (!this.isStep1Valid()) return;
    this.isLoading = true;
    await new Promise(r => setTimeout(r, 1400));
    this.isLoading = false;
    this.otp = ['', '', '', '', '', ''];
    this.startResendTimer();
    this.step = 2;
  }

  // ───────────────────────────────────────────────
  // OTP
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
  }

  async onVerifyOtp(): Promise<void> {
    this.isLoading = true;
    await new Promise(r => setTimeout(r, 1200));
    this.isLoading = false;
    // Reset pregnancy choices
    this.knowsDueDate = null;
    this.calcMethod   = null;
    this.step = 3;
  }

  // ───────────────────────────────────────────────
  // MISC
  // ───────────────────────────────────────────────
  onGoogle(): void { console.log('Google sign-up'); }
  onConnectProvider(): void { console.log('Connect provider'); }
  onTerms(): void {
    this.router.navigate(['/terms'], { state: { fromSignup: true } });
  }
  onPrivacy(): void {
    this.router.navigate(['/privacy'], { state: { fromSignup: true } });
  }
  onLogin(): void { this.router.navigate(['/login']); }
}