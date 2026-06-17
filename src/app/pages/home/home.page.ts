// home.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  providers: [DatePipe],
})
export class HomePage implements OnInit, OnDestroy {

  animReady = false;
  currentTime = new Date();
  today = new Date();
  private clockInterval: any;
  darkMode = false;
  private themeSub!: Subscription;

  // ── Pregnancy Data ──────────────────────────────
  pregnancyWeek = 20;
  pregnancyDays = 3;
  dueDate = new Date('2025-09-15');
  babyName = 'Little One';

  babySizes: Record<number, { emoji: string; fruit: string; length: string; weight: string }> = {
    8:  { emoji: '🫐', fruit: 'blueberry',      length: '1.6 cm', weight: '1 g' },
    10: { emoji: '🍓', fruit: 'strawberry',     length: '3.1 cm', weight: '4 g' },
    12: { emoji: '🍋', fruit: 'lime',            length: '5.4 cm', weight: '14 g' },
    14: { emoji: '🍑', fruit: 'peach',           length: '8.7 cm', weight: '43 g' },
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
    8:  "Your baby's tiny heart is beating fast!",
    10: "Little fingers and toes are forming 🌱",
    12: "All major organs are now in place!",
    14: "Baby can squint, frown, and make faces!",
    16: "Your baby can hear your voice now 🎵",
    18: "Tiny movements — can you feel them?",
    20: "Your baby is developing tiny fingerprints!",
    22: "Baby's eyes are fully formed beneath those lids!",
    24: "Baby's face looks almost complete now ✨",
    26: "Baby's brain is growing rapidly this week!",
    28: "Baby can now dream — what do you think they dream of?",
    30: "Baby's eyesight is developing rapidly!",
    32: "Baby is practicing breathing motions 💨",
    34: "Baby's immune system is strengthening!",
    36: "Baby is almost ready to meet the world!",
    38: "Everything is set — just waiting for the big day!",
    40: "Any day now, Mama! You've done amazingly 💖",
  };

  get babySize() {
    const weeks = [8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40];
    let closest = weeks[0];
    for (const w of weeks) { if (this.pregnancyWeek >= w) closest = w; }
    return this.babySizes[closest];
  }

  get weeklyMessage(): string {
    const weeks = [8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40];
    let closest = weeks[0];
    for (const w of weeks) { if (this.pregnancyWeek >= w) closest = w; }
    return this.weeklyMessages[closest];
  }

  get daysRemaining(): number {
    const today = new Date();
    const diff = this.dueDate.getTime() - today.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  get pregnancyProgress(): number {
    return Math.min(100, Math.round((this.pregnancyWeek / 40) * 100));
  }

  get trimester(): string {
    if (this.pregnancyWeek <= 13) return '1st Trimester';
    if (this.pregnancyWeek <= 26) return '2nd Trimester';
    return '3rd Trimester';
  }

  // ── Daily Tips ─────────────────────────────────
  tips = [
    { icon: '💧', category: 'Hydration',   text: 'Drink 8–10 glasses of water today to support amniotic fluid levels.' },
    { icon: '🥗', category: 'Nutrition',   text: 'Include iron-rich foods like spinach and lentils in your meals today.' },
    { icon: '🚶', category: 'Movement',    text: 'A 20-minute gentle walk helps circulation and eases back pain.' },
    { icon: '🧘', category: 'Mind & Soul', text: 'Try 5 minutes of deep breathing — it calms both you and baby.' },
    { icon: '😴', category: 'Rest',        text: 'Sleep on your left side to improve blood flow to your baby.' },
    { icon: '💊', category: 'Supplements', text: "Don't forget your prenatal vitamins — folic acid is crucial!" },
    { icon: '☀️', category: 'Sunshine',   text: 'Get 15 minutes of morning sunlight for natural Vitamin D.' },
  ];

  get todayTip() {
    return this.tips[new Date().getDate() % this.tips.length];
  }

  // ── Appointments ────────────────────────────────
  appointments = [
    { date: 'May 10',  day: 'Sat', label: 'Prenatal Checkup',   doctor: 'Dr. Reyes',   type: 'checkup',    icon: '🩺' },
    { date: 'May 18',  day: 'Sun', label: 'Anatomy Ultrasound', doctor: 'St. Luke\'s', type: 'ultrasound', icon: '🔬' },
    { date: 'Jun 3',   day: 'Tue', label: 'Blood Work',         doctor: 'Dr. Santos',  type: 'lab',        icon: '🩸' },
  ];

  // ── Checklist ────────────────────────────────────
  checklist = [
    { id: 1, task: 'Take prenatal vitamins',   done: false, icon: '💊' },
    { id: 2, task: 'Drink 8 glasses of water', done: false, icon: '💧' },
    { id: 3, task: 'Light walk or stretching', done: false, icon: '🚶' },
    { id: 4, task: 'Eat a veggie-rich meal',   done: false, icon: '🥗' },
    { id: 5, task: 'Rest for 30 minutes',      done: false, icon: '😴' },
  ];

  get checklistDone(): number  { return this.checklist.filter(c => c.done).length; }
  get checklistPercent(): number { return Math.round((this.checklistDone / this.checklist.length) * 100); }

  // ── Health Snapshot ──────────────────────────────
  health = {
    weight: 62.4,
    bp: '112/72',
    mood: 3 as number | null,
    kicks: 0,
  };

  // Draft state for modal
  healthDraft = {
    weight: 62.4,
    bpSys: 112,
    bpDia: 72,
    kicks: 0,
  };

  showHealthModal = false;
  activeField = '';

  // Kick dots (show up to 10)
  get kickDots(): number[] {
    return Array(Math.min(10, Math.max(10, this.health.kicks))).fill(0);
  }

  openHealthModal(): void {
    // Populate draft from current health
    const bpParts = this.health.bp.split('/');
    this.healthDraft = {
      weight: this.health.weight,
      bpSys: parseInt(bpParts[0]) || 120,
      bpDia: parseInt(bpParts[1]) || 80,
      kicks: this.health.kicks,
    };
    this.showHealthModal = true;
  }

  closeHealthModal(): void {
    this.showHealthModal = false;
    this.activeField = '';
  }

  saveHealth(): void {
    this.health.weight = this.healthDraft.weight;
    this.health.bp = `${this.healthDraft.bpSys}/${this.healthDraft.bpDia}`;
    this.health.kicks = this.healthDraft.kicks;
    this.closeHealthModal();
  }

  adjustKicks(delta: number): void {
    this.healthDraft.kicks = Math.max(0, this.healthDraft.kicks + delta);
  }

  moodLabels = ['😢', '😕', '😊', '😄', '🤩'];

  // ── Bottom Nav ───────────────────────────────────
  activeTab = 'home';

  // ── Greetings ────────────────────────────────────
  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  constructor(private router: Router, private route: ActivatedRoute, private theme: ThemeService) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe((val: boolean) => this.darkMode = val);
    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });
    this.clockInterval = setInterval(() => {
      this.currentTime = new Date();
    }, 60000);
    this.route.queryParams.subscribe(params => {
      if (params['tab']) { this.activeTab = params['tab']; }
    });
  }

  ngOnDestroy(): void {
    if (this.clockInterval) clearInterval(this.clockInterval);
    this.themeSub.unsubscribe();
  }

  toggleChecklist(item: any): void { item.done = !item.done; }
  setMood(idx: number): void { this.health.mood = idx; }

  navigate(route: string, tab?: string): void {
    this.router.navigate([route], {
      queryParams: tab ? { tab } : {}
    });
  }

  setTab(tab: string): void { this.activeTab = tab; }
} 