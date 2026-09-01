import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ThemeService } from '../../services/theme';
import { AuthService } from '../../services/auth.service';
import { NotificationsService, AppNotification } from '../../services/notifications.service';
import { Subscription } from 'rxjs';

export interface AppUser {
  fullName:     string;
  email:        string;
  dueDate:      Date;
  firstTimeMom: boolean | null;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  providers: [DatePipe],
})
export class HomePage implements OnInit, OnDestroy {

  animReady    = false;
  currentTime  = new Date();
  today        = new Date();
  darkMode     = false;
  isLoadingUser = true;
  private themeSub!: Subscription;
  private userSub!: Subscription;
  private notifSub!: Subscription;
  private currentUid: string | null = null;

  private clockInterval:    any;
  private countdownInterval: any;
  private midnightTimeout:  any;

  get selectedAvatar() {
    try {
      const saved = localStorage.getItem('momscare_avatar');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { emoji: '🐻', bgColor: '#e07eb8' };
  }

  currentUser: AppUser = {
    fullName:     '',
    email:        '',
    dueDate:      new Date(),
    firstTimeMom: null,
  };

  pregnancyWeek = 0;
  pregnancyDays = 0;

  private recomputePregnancyFromDueDate(): void {
    const TOTAL_PREGNANCY_DAYS = 280;
    const msPerDay = 24 * 60 * 60 * 1000;
    const now = new Date();
    const daysUntilDue = Math.round((this.currentUser.dueDate.getTime() - now.getTime()) / msPerDay);
    const daysElapsed = Math.max(0, Math.min(TOTAL_PREGNANCY_DAYS, TOTAL_PREGNANCY_DAYS - daysUntilDue));
    this.pregnancyWeek = Math.min(40, Math.floor(daysElapsed / 7));
    this.pregnancyDays = daysElapsed % 7;
  }

  get dueDate(): Date { return this.currentUser.dueDate; }

  weekStripOffset = 0;
  get visibleWeeks(): number[] {
    const center = this.pregnancyWeek + this.weekStripOffset;
    const start  = Math.max(1, center - 2);
    const end    = Math.min(40, start + 4);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  shiftWeekStrip(delta: number): void {
    const newOffset = this.weekStripOffset + delta;
    const center    = this.pregnancyWeek + newOffset;
    if (center >= 1 && center <= 40) this.weekStripOffset = newOffset;
  }

  selectWeek(w: number): void {
    console.log('Selected week', w);
  }

  babySizes: Record<number, { emoji: string; fruit: string; length: string; weight: string }> = {
    4:  { emoji: '🫐', fruit: 'poppy seed',      length: '0.1 cm',  weight: '<1 g' },
    6:  { emoji: '🫐', fruit: 'lentil',          length: '0.6 cm',  weight: '<1 g' },
    8:  { emoji: '🍓', fruit: 'raspberry',       length: '1.6 cm',  weight: '1 g' },
    10: { emoji: '🍓', fruit: 'strawberry',      length: '3.1 cm',  weight: '4 g' },
    12: { emoji: '🍋', fruit: 'lime',            length: '5.4 cm',  weight: '14 g' },
    14: { emoji: '🍑', fruit: 'peach',           length: '8.7 cm',  weight: '43 g' },
    16: { emoji: '🥑', fruit: 'avocado',         length: '11.6 cm', weight: '100 g' },
    18: { emoji: '🥕', fruit: 'sweet potato',    length: '14.2 cm', weight: '190 g' },
    20: { emoji: '🥭', fruit: 'mango',           length: '16.4 cm', weight: '300 g' },
    22: { emoji: '🌽', fruit: 'corn',            length: '27.8 cm', weight: '430 g' },
    24: { emoji: '🌽', fruit: 'corn',            length: '30 cm',   weight: '600 g' },
    26: { emoji: '🥬', fruit: 'lettuce head',    length: '35.6 cm', weight: '760 g' },
    28: { emoji: '🍆', fruit: 'eggplant',        length: '37.6 cm', weight: '1 kg' },
    30: { emoji: '🥦', fruit: 'broccoli',        length: '39.9 cm', weight: '1.3 kg' },
    32: { emoji: '🥥', fruit: 'coconut',         length: '42.4 cm', weight: '1.7 kg' },
    34: { emoji: '🍍', fruit: 'pineapple',       length: '45 cm',   weight: '2.1 kg' },
    36: { emoji: '🥬', fruit: 'romaine lettuce', length: '47.4 cm', weight: '2.6 kg' },
    38: { emoji: '🎃', fruit: 'small pumpkin',   length: '49.8 cm', weight: '3 kg' },
    40: { emoji: '🍉', fruit: 'watermelon',      length: '51.2 cm', weight: '3.5 kg' },
  };

  weeklyMessages: Record<number, string> = {
    4:  'Implantation is happening — your journey begins! 🌱',
    6:  "Your baby's heart is starting to beat!",
    8:  "Tiny fingers and toes are forming 🌸",
    10: "All major organs are now in place!",
    12: "Your baby can now squint, frown, and grimace!",
    14: "Baby can hear your heartbeat now 🎵",
    16: "Tiny movements are beginning — can you feel them?",
    18: "Your baby is developing unique fingerprints!",
    20: "Halfway there! Your baby is swallowing amniotic fluid.",
    22: "Baby's eyes are fully formed beneath those lids!",
    24: "Baby's face looks almost complete now ✨",
    26: "Baby's brain is growing rapidly this week!",
    28: "Baby can now dream — what do you think they dream of? 💭",
    30: "Baby's eyesight is developing rapidly!",
    32: "Baby is practicing breathing motions 💨",
    34: "Baby's immune system is strengthening!",
    36: "Baby is almost ready to meet the world! 🌍",
    38: "Everything is set — just waiting for the big day!",
    40: "Any day now, Mama! You've done amazingly 💖",
  };

  get babySize() {
    const keys = Object.keys(this.babySizes).map(Number).sort((a, b) => a - b);
    let closest = keys[0];
    for (const w of keys) { if (this.pregnancyWeek >= w) closest = w; }
    return this.babySizes[closest];
  }

  get weeklyMessage(): string {
    const keys = Object.keys(this.weeklyMessages).map(Number).sort((a, b) => a - b);
    let closest = keys[0];
    for (const w of keys) { if (this.pregnancyWeek >= w) closest = w; }
    return this.weeklyMessages[closest];
  }

  get pregnancyProgress(): number {
    return Math.min(100, Math.round((this.pregnancyWeek / 40) * 100));
  }

  get trimester(): string {
    if (this.pregnancyWeek <= 13) return '1st Trimester';
    if (this.pregnancyWeek <= 26) return '2nd Trimester';
    return '3rd Trimester';
  }

  private get s(): number {
    return Math.max(0.32, Math.min(1.0, 0.32 + (this.pregnancyWeek / 40) * 0.68));
  }

  private get origin() {
    return { cx: 110, cy: 128 };
  }

  get fetal() {
    const s = this.s;
    const { cx, cy } = this.origin;
    return {
      cx, cy, s,
      hx: cx + s * 22,
      hy: cy - s * 34,
      hr: s * 23,
      bx: cx - s * 2,
      by: cy + s * 6,
      bw: s * 17,
      bh: s * 26,
    };
  }

  get bodyPath(): string {
    const f = this.fetal;
    return `
      M ${f.hx - f.hr * 0.95} ${f.hy + f.hr * 0.55}
      C ${f.hx - f.hr * 1.25} ${f.hy - f.hr * 0.3}
        ${f.hx - f.hr * 0.55} ${f.hy - f.hr * 1.25}
        ${f.hx + f.hr * 0.25} ${f.hy - f.hr * 1.1}
      C ${f.hx + f.hr * 1.05} ${f.hy - f.hr * 0.95}
        ${f.hx + f.hr * 1.15} ${f.hy + f.hr * 0.15}
        ${f.hx + f.hr * 0.6} ${f.hy + f.hr * 0.75}
      C ${f.hx + f.hr * 0.3} ${f.hy + f.hr * 1.05}
        ${f.bx + f.bw * 1.1} ${f.by - f.bh * 0.85}
        ${f.bx + f.bw * 1.15} ${f.by - f.bh * 0.2}
      C ${f.bx + f.bw * 1.2} ${f.by + f.bh * 0.55}
        ${f.bx + f.bw * 0.65} ${f.by + f.bh * 1.05}
        ${f.bx - f.bw * 0.05} ${f.by + f.bh * 1.15}
      C ${f.bx - f.bw * 0.75} ${f.by + f.bh * 1.25}
        ${f.bx - f.bw * 1.3} ${f.by + f.bh * 0.7}
        ${f.bx - f.bw * 1.15} ${f.by - f.bh * 0.1}
      C ${f.bx - f.bw * 1.05} ${f.by - f.bh * 0.75}
        ${f.bx - f.bw * 0.55} ${f.hy + f.hr * 1.3}
        ${f.hx - f.hr * 0.95} ${f.hy + f.hr * 0.55}
      Z
    `.replace(/\s+/g, ' ').trim();
  }

  get armPath(): string {
    const f = this.fetal;
    const shx = f.bx + f.bw * 0.55, shy = f.by - f.bh * 0.55;
    const elx = f.bx + f.bw * 1.05, ely = f.by - f.bh * 0.05;
    const hax = f.hx + f.hr * 0.15, hay = f.hy + f.hr * 0.85;
    return `M ${shx} ${shy} Q ${elx} ${ely} ${hax} ${hay}`;
  }

  get legsPath(): string {
    const f = this.fetal;
    const hipx = f.bx - f.bw * 0.5, hipy = f.by + f.bh * 0.85;
    const kneex = f.bx + f.bw * 0.9, kneey = f.by + f.bh * 1.15;
    const footx = f.bx + f.bw * 0.1, footy = f.by - f.bh * 0.05;
    return `M ${hipx} ${hipy} Q ${kneex} ${kneey} ${footx} ${footy}`;
  }

  get umbilicalPath(): string {
    const f  = this.fetal;
    const sx = f.bx - f.bw * 0.2;
    const sy = f.by + f.bh * 0.1;
    return `M ${sx} ${sy} C ${sx - 22} ${sy - 36} ${sx + 30} 78 110 56`;
  }

  get spinalPath(): string {
    const f = this.fetal;
    return `M ${f.hx - f.hr * 0.4} ${f.hy + f.hr * 0.3}
            Q ${f.bx - f.bw * 0.9} ${f.by - f.bh * 0.3}
              ${f.bx - f.bw * 0.6} ${f.by + f.bh * 0.9}`;
  }

  activeTab = 'home';

  setTab(tab: string): void { this.activeTab = tab; }

  navigate(route: string): void {
    this.router.navigate([route]);
  }

  countdownDays  = 0;
  countdownHours = 0;
  countdownMins  = 0;

  private updateCountdown(): void {
    const now  = new Date().getTime();
    const due  = this.dueDate.getTime();
    const diff = Math.max(0, due - now);

    this.countdownDays  = Math.floor(diff / (1000 * 60 * 60 * 24));
    this.countdownHours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    this.countdownMins  = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  }

  get daysRemaining(): number { return this.countdownDays; }

  showNotifPanel = false;
  notifications: AppNotification[] = [];

  get unreadCount(): number { return this.notifications.filter(n => !n.read).length; }

  toggleNotifPanel(): void {
    this.showNotifPanel = !this.showNotifPanel;
  }
  closeNotifPanel(): void {
    this.showNotifPanel = false;
  }

  onNotifTap(n: AppNotification): void {
    if (!n.read && this.currentUid) {
      this.notificationsService.markRead(this.currentUid, n.id);
    }
    if (n.route) {
      this.closeNotifPanel();
      this.router.navigate([n.route]);
    }
  }

  clearAllNotifs(): void {
    if (!this.currentUid || this.notifications.length === 0) return;
    this.notificationsService.markAllRead(this.currentUid, this.notifications.map(n => n.id));
  }

  appointments = [
    { date: 'May 10',  day: 'Sat', label: 'Prenatal Checkup',   doctor: 'Dr. Reyes',  type: 'checkup',    icon: '🩺' },
    { date: 'May 18',  day: 'Sun', label: 'Anatomy Ultrasound', doctor: "St. Luke's", type: 'ultrasound', icon: '🔬' },
    { date: 'Jun 3',   day: 'Tue', label: 'Blood Work',         doctor: 'Dr. Santos', type: 'lab',        icon: '🩸' },
  ];

  get upcomingAppointments() {
    return this.appointments.slice(0, 2);
  }

  goToAppointments(): void {
    this.router.navigate(['/appointments']);
  }

  health = {
    weight: 0,
    bp:     '--/--',
    mood:   null as number | null,
    kicks:  0,
  };

  healthDraft = { weight: 0, bpSys: 120, bpDia: 80, kicks: 0 };
  showHealthModal = false;
  activeField     = '';

  get kickDots(): number[] {
    return Array(Math.max(10, this.health.kicks)).fill(0);
  }

  openHealthModal(): void {
    const bpParts = this.health.bp.split('/');
    this.healthDraft = {
      weight: this.health.weight,
      bpSys:  parseInt(bpParts[0]) || 120,
      bpDia:  parseInt(bpParts[1]) || 80,
      kicks:  this.health.kicks,
    };
    this.showHealthModal = true;
  }

  closeHealthModal(): void { this.showHealthModal = false; this.activeField = ''; }

  saveHealth(): void {
    this.health.weight = this.healthDraft.weight;
    this.health.bp     = `${this.healthDraft.bpSys}/${this.healthDraft.bpDia}`;
    this.health.kicks  = this.healthDraft.kicks;
    this.closeHealthModal();
  }

  adjustKicks(delta: number): void {
    this.healthDraft.kicks = Math.max(0, this.healthDraft.kicks + delta);
  }

  moodLabels = ['😢', '😕', '😊', '😄', '🤩'];
  setMood(idx: number): void { this.health.mood = idx; }

  private readonly CHECKLIST_KEY = 'momscare_checklist_date';

  checklist = [
    { id: 1, task: 'Take prenatal vitamins',   done: false, icon: '💊' },
    { id: 2, task: 'Drink 8 glasses of water', done: false, icon: '💧' },
    { id: 3, task: 'Light walk or stretching', done: false, icon: '🚶' },
    { id: 4, task: 'Eat a veggie-rich meal',   done: false, icon: '🥗' },
    { id: 5, task: 'Rest for 30 minutes',      done: false, icon: '😴' },
  ];

  get checklistDone():    number { return this.checklist.filter(c => c.done).length; }
  get checklistPercent(): number { return Math.round((this.checklistDone / this.checklist.length) * 100); }

  private getTodayDateString(): string {
    return new Date().toISOString().split('T')[0];
  }

  private loadChecklist(): void {
    try {
      const savedDate  = localStorage.getItem(this.CHECKLIST_KEY);
      const savedItems = localStorage.getItem('momscare_checklist_items');
      const today      = this.getTodayDateString();

      if (savedDate === today && savedItems) {
        const saved: { id: number; done: boolean }[] = JSON.parse(savedItems);
        this.checklist.forEach(item => {
          const match = saved.find(s => s.id === item.id);
          if (match) item.done = match.done;
        });
      } else {
        this.checklist.forEach(item => (item.done = false));
        localStorage.setItem(this.CHECKLIST_KEY, today);
        this.saveChecklistState();
      }
    } catch { /* localStorage unavailable */ }
  }

  private saveChecklistState(): void {
    try {
      localStorage.setItem(
        'momscare_checklist_items',
        JSON.stringify(this.checklist.map(c => ({ id: c.id, done: c.done })))
      );
    } catch { /* ignore */ }
  }

  toggleChecklist(item: any): void {
    item.done = !item.done;
    this.saveChecklistState();
  }

  private scheduleMidnightReset(): void {
    const now       = new Date();
    const midnight  = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    this.midnightTimeout = setTimeout(() => {
      this.checklist.forEach(item => (item.done = false));
      localStorage.setItem(this.CHECKLIST_KEY, this.getTodayDateString());
      this.saveChecklistState();
      this.scheduleMidnightReset();
    }, msUntilMidnight);
  }

  get timeUntilMidnight(): string {
    const now      = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const diff = midnight.getTime() - now.getTime();
    const h    = Math.floor(diff / (1000 * 60 * 60));
    const m    = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  get nextResetLabel(): string {
    const h = new Date();
    h.setHours(24, 0, 0, 0);
    const diff = Math.floor((h.getTime() - Date.now()) / (1000 * 60 * 60));
    return diff > 0 ? `in ${diff}h` : 'soon';
  }

  get greetingName(): string {
    const first = this.currentUser.fullName?.trim().split(/\s+/)[0];
    return first || 'Mama';
  }

  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private theme: ThemeService,
    private authService: AuthService,
    private notificationsService: NotificationsService,
  ) {}

  private async loadUserProfile(): Promise<void> {
    this.isLoadingUser = true;
    try {
      const profile = await this.authService.getProfile();
      if (profile) {
        this.currentUser = {
          fullName:     profile.fullName || '',
          email:        profile.email    || '',
          dueDate:      profile.dueDate ? new Date(profile.dueDate) : new Date(),
          firstTimeMom: profile.firstTimeMom ?? null,
        };
        this.recomputePregnancyFromDueDate();
        this.updateCountdown();
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
    } finally {
      this.isLoadingUser = false;
    }
  }

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));

    this.userSub = this.authService.user$.subscribe(fbUser => {
      this.currentUid = fbUser?.uid ?? null;
      if (fbUser) {
        this.loadUserProfile();
      }
    });

    this.notifSub = this.notificationsService.notifications$()
      .subscribe((list: AppNotification[]) => (this.notifications = list));

    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });

    this.clockInterval = setInterval(() => {
      this.currentTime = new Date();
    }, 60000);

    this.updateCountdown();
    this.countdownInterval = setInterval(() => {
      this.updateCountdown();
      this.recomputePregnancyFromDueDate();
    }, 60000);

    this.loadChecklist();
    this.scheduleMidnightReset();
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
    this.userSub?.unsubscribe();
    this.notifSub?.unsubscribe();
    if (this.clockInterval)     clearInterval(this.clockInterval);
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    if (this.midnightTimeout)   clearTimeout(this.midnightTimeout);
  }
}