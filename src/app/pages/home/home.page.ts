// home.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

// ─── User model ──────────────────────────────────────────────────────────────
// This interface is ready to be populated from your auth/database service
// once authentication is implemented. For now, it uses a default user.
export interface AppUser {
  firstName:     string;
  lastName:      string;
  email:         string;
  pregnancyWeek: number;
  pregnancyDays: number;
  dueDate:       Date;
  firstTimeMom:  boolean | null;
}

// ─── Notification model ───────────────────────────────────────────────────────
export interface AppNotification {
  id:      string;
  icon:    string;
  title:   string;
  message: string;
  time:    string;
  read:    boolean;
  route?:  string;
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

  private clockInterval:    any;
  private countdownInterval: any;
  private midnightTimeout:  any;

  // ── Selected avatar (synced from avatar customization page) ──
  get selectedAvatar() {
    try {
      const saved = localStorage.getItem('momscare_avatar');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { emoji: '🐻', bgColor: '#e07eb8' };
  }

  // ════════════════════════════════════════════════════════
  // CURRENT USER
  // ─────────────────────────────────────────────────────────
  // TODO: Replace this with data from your AuthService / UserService
  // once authentication is connected.
  // Example:
  //   constructor(private authService: AuthService) {}
  //   ngOnInit() { this.currentUser = this.authService.getCurrentUser(); }
  // ════════════════════════════════════════════════════════
  currentUser: AppUser = {
    firstName:     'Maria',
    lastName:      'Santos',
    email:         'maria@email.com',
    pregnancyWeek: 20,
    pregnancyDays: 3,
    dueDate:       new Date('2025-09-15'),
    firstTimeMom:  true,
  };

  // ── Pregnancy derived from user ──
  get pregnancyWeek(): number { return this.currentUser.pregnancyWeek; }
  get pregnancyDays(): number { return this.currentUser.pregnancyDays; }
  get dueDate():       Date   { return this.currentUser.dueDate; }

  // Week strip (shows 5 weeks centred on current week)
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
    // In production, this could open a week-detail modal
    console.log('Selected week', w);
  }

  // ── Baby size data ──
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

  // ── Fetal SVG — womb visualization ──────────────────────
  // All positions are computed dynamically so the fetus
  // grows visually as pregnancy weeks increase (1 → 40).

  private get s(): number {
    // scale factor 0.30 at week 4 → 1.0 at week 40
    return Math.max(0.30, Math.min(1.0, 0.30 + (this.pregnancyWeek / 40) * 0.70));
  }

  // Fetal body geometry (used in template as `fetal.*`)
  get fetal() {
    const s  = this.s;
    const cx = 110; // SVG centre x
    const cy = 132; // SVG centre y  — shift up slightly for small fetuses

    // Curled-up posture: head slightly to the right of centre, body curled below
    const hx = cx + s * 6;
    const hy = cy - s * 28;
    const hr = s * 18;          // head radius

    const bx = cx - s * 4;
    const by = cy + s * 8;
    const bw = s * 14;          // body half-width
    const bh = s * 24;          // body half-height

    return { hx, hy, hr, bx, by, bw, bh };
  }

  // Umbilical cord cubic bezier
  get umbilicalPath(): string {
    const f  = this.fetal;
    // Goes from belly-button area of fetus to placenta at top
    const sx = f.bx + 4;
    const sy = f.by - f.bh * 0.3;
    return `M ${sx} ${sy} C ${sx - 28} ${sy - 40} ${sx + 22} 80 110 58`;
  }

  // Spine curve suggestion
  get spinalPath(): string {
    const f = this.fetal;
    return `M ${f.bx - f.bw * 0.1} ${f.hy + f.hr * 0.7}
            Q ${f.bx - f.bw * 0.35} ${f.by}
              ${f.bx - f.bw * 0.2} ${f.by + f.bh * 0.8}`;
  }

  // ── Navigation tabs ─────────────────────────────────────
  activeTab = 'home';

  setTab(tab: string): void { this.activeTab = tab; }

  navigate(route: string): void {
    this.router.navigate([route]);
  }

  // ════════════════════════════════════════════════════════
  // DUE DATE COUNTDOWN (live, ticks every minute)
  // ════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ════════════════════════════════════════════════════════
  showNotifPanel = false;

  notifications: AppNotification[] = [
    {
      id: 'n1', icon: '🩺', read: false,
      title: 'Appointment Reminder',
      message: 'Prenatal Checkup with Dr. Reyes tomorrow at 10:00 AM.',
      time: '2 hours ago', route: '/appointments',
    },
    {
      id: 'n2', icon: '💊', read: false,
      title: 'Daily Vitamins',
      message: "Don't forget to take your prenatal vitamins today!",
      time: '8:00 AM', route: '',
    },
    {
      id: 'n3', icon: '📊', read: true,
      title: 'Week 20 Milestone',
      message: "You're halfway through your pregnancy! Check your baby's development.",
      time: 'Yesterday', route: '',
    },
    {
      id: 'n4', icon: '💧', read: true,
      title: 'Hydration Check',
      message: 'Have you had 8 glasses of water today? Stay hydrated, Mama! 💕',
      time: '2 days ago', route: '',
    },
  ];

  get unreadCount(): number { return this.notifications.filter(n => !n.read).length; }

  toggleNotifPanel(): void {
    this.showNotifPanel = !this.showNotifPanel;
  }
  closeNotifPanel(): void {
    this.showNotifPanel = false;
  }

  onNotifTap(n: AppNotification): void {
    n.read = true;
    if (n.route) {
      this.closeNotifPanel();
      this.router.navigate([n.route]);
    }
  }

  clearAllNotifs(): void {
    this.notifications.forEach(n => (n.read = true));
    this.notifications = [];
  }

  // ════════════════════════════════════════════════════════
  // APPOINTMENTS (navigate to appointments page on "See all")
  // ════════════════════════════════════════════════════════
  appointments = [
    { date: 'May 10',  day: 'Sat', label: 'Prenatal Checkup',   doctor: 'Dr. Reyes',  type: 'checkup',    icon: '🩺' },
    { date: 'May 18',  day: 'Sun', label: 'Anatomy Ultrasound', doctor: "St. Luke's", type: 'ultrasound', icon: '🔬' },
    { date: 'Jun 3',   day: 'Tue', label: 'Blood Work',         doctor: 'Dr. Santos', type: 'lab',        icon: '🩸' },
  ];

  // Show only the next 2 on homepage
  get upcomingAppointments() {
    return this.appointments.slice(0, 2);
  }

  goToAppointments(): void {
    this.router.navigate(['/appointments']);
  }

  // ════════════════════════════════════════════════════════
  // HEALTH SNAPSHOT (unchanged as requested)
  // ════════════════════════════════════════════════════════
  health = {
    weight: 62.4,
    bp:     '112/72',
    mood:   3 as number | null,
    kicks:  0,
  };

  healthDraft = { weight: 62.4, bpSys: 112, bpDia: 72, kicks: 0 };
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

  // ════════════════════════════════════════════════════════
  // DAILY CHECKLIST — auto-resets every 24h at midnight
  // ════════════════════════════════════════════════════════
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
    return new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
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
        // New day — reset all items
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

  // Schedule auto-reset at next midnight
  private scheduleMidnightReset(): void {
    const now       = new Date();
    const midnight  = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    this.midnightTimeout = setTimeout(() => {
      this.checklist.forEach(item => (item.done = false));
      localStorage.setItem(this.CHECKLIST_KEY, this.getTodayDateString());
      this.saveChecklistState();
      // Schedule next reset
      this.scheduleMidnightReset();
    }, msUntilMidnight);
  }

  // "Resets in X h Ym" label
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

  // ════════════════════════════════════════════════════════
  // GREETING
  // ════════════════════════════════════════════════════════
  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  // ════════════════════════════════════════════════════════
  // LIFECYCLE
  // ════════════════════════════════════════════════════════
  constructor(private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    // TODO: load real user from auth service here
    // this.currentUser = this.authService.getCurrentUser();

    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });

    // Live clock
    this.clockInterval = setInterval(() => {
      this.currentTime = new Date();
    }, 60000);

    // Live countdown (ticks every minute)
    this.updateCountdown();
    this.countdownInterval = setInterval(() => {
      this.updateCountdown();
    }, 60000);

    // Checklist with 24h reset
    this.loadChecklist();
    this.scheduleMidnightReset();
  }

  ngOnDestroy(): void {
    if (this.clockInterval)     clearInterval(this.clockInterval);
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    if (this.midnightTimeout)   clearTimeout(this.midnightTimeout);
  }
}