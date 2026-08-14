// reports.page.ts
import { Component, OnInit , OnDestroy } from '@angular/core';
import { Location } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-reports',
  templateUrl: './reports.page.html',
  styleUrls: ['./reports.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class ReportsPage implements OnInit, OnDestroy {

  darkMode = false;
  private themeSub!: Subscription;
  animReady     = false;
  pregnancyWeek = 20;

  moodEmojis = ['😢','😕','😊','😄','🤩'];

  current = { weight: 62.4, bp: '112/72', kicks: 8, mood: 3 };

  get moodEmoji() { return this.moodEmojis[this.current.mood]; }
  get moodName()  { return ['Sad','Low','Okay','Good','Amazing'][this.current.mood]; }
  get trimester() {
    if (this.pregnancyWeek <= 13) return '1st Trimester';
    if (this.pregnancyWeek <= 26) return '2nd Trimester';
    return '3rd Trimester';
  }
  get daysLeft(): number {
    const due = new Date('2025-09-15');
    return Math.max(0, Math.ceil((due.getTime() - Date.now()) / 86400000));
  }
  get bpNormal(): boolean { return this.current.mood >= 2; }

  weightData = [
    { label:'W13', val:58.2 }, { label:'W14', val:58.8 }, { label:'W15', val:59.1 },
    { label:'W16', val:59.8 }, { label:'W17', val:60.3 }, { label:'W18', val:61.0 },
    { label:'W19', val:61.7 }, { label:'W20', val:62.4 },
  ];
  get weightMin() { return Math.min(...this.weightData.map(d => d.val)) - 1; }
  get weightMax() { return Math.max(...this.weightData.map(d => d.val)) + 1; }
  get weightChange() { return +(this.weightData[this.weightData.length-1].val - this.weightData[this.weightData.length-4].val).toFixed(1); }
  barPct(val: number, min: number, max: number): number {
    return Math.round(((val - min) / (max - min)) * 80 + 10);
  }

  bpData = [
    { label:'Jun 1', sys:110, dia:70 }, { label:'Jun 8', sys:112, dia:72 },
    { label:'Jun 15', sys:108, dia:68 }, { label:'Jun 22', sys:114, dia:74 },
    { label:'Jun 29', sys:112, dia:72 },
  ];

  kickData = [
    { label:'Mon', val:6 }, { label:'Tue', val:9 }, { label:'Wed', val:11 },
    { label:'Thu', val:7 }, { label:'Fri', val:12 }, { label:'Sat', val:8 }, { label:'Sun', val:8 },
  ];
  get avgKicks() { return Math.round(this.kickData.reduce((a,d) => a+d.val,0)/this.kickData.length); }

  moodData = [
    { label:'Mon', mood:2 }, { label:'Tue', mood:3 }, { label:'Wed', mood:4 },
    { label:'Thu', mood:2 }, { label:'Fri', mood:3 }, { label:'Sat', mood:3 }, { label:'Sun', mood:3 },
  ];

  get trimesterBlocks() {
    const w = this.pregnancyWeek;
    return [
      { num:1, label:'1st (W1–13)',  pct: Math.min(100, Math.max(0, (Math.min(w,13)/13)*100)) },
      { num:2, label:'2nd (W14–26)', pct: w>13 ? Math.min(100, ((Math.min(w,26)-13)/13)*100) : 0 },
      { num:3, label:'3rd (W27–40)', pct: w>26 ? Math.min(100, ((Math.min(w,40)-26)/14)*100) : 0 },
    ];
  }

  constructor(private location: Location, private theme: ThemeService) {}
  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    try {
      const h = localStorage.getItem('momscare_health_current');
      if (h) { const d = JSON.parse(h); this.current = { weight: d.weight, bp: `${d.bpSys}/${d.bpDia}`, kicks: d.kicks, mood: d.mood }; }
    } catch {}
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }
  goBack(): void { this.location.back(); }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }
}