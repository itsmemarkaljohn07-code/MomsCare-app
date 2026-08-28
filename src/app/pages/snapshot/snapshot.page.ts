// snapshot.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

export type PhotoType = 'bump' | 'ultrasound' | 'milestone';

export interface SnapshotPhoto {
  id: string;
  imageUrl: string;
  type: PhotoType;
  week: number;
  caption: string;
  date: Date;
}

export interface HealthLog {
  date: Date;
  weight: number;
  bpSys: number;
  bpDia: number;
  kicks: number;
  mood: number;
}

@Component({
  selector: 'app-snapshot',
  templateUrl: './snapshot.page.html',
  styleUrls: ['./snapshot.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class SnapshotPage implements OnInit, OnDestroy {

  animReady = false;
  darkMode  = false;
  private themeSub!: Subscription;

  pregnancyWeek = 20;
  today = new Date();
  Math = Math;

  // ── Internal Gallery/Health tab switcher (unrelated to bottom nav) ──
  activeTab: 'gallery' | 'health' = 'gallery';

  // ── Bottom nav active state (kept distinct from the tab switcher above) ──
  activeNavTab = 'snapshot';

  navigate(route: string): void {
    this.router.navigate([route]);
  }

  // ════════════════════════════════════════════════════════
  // PHOTO GALLERY
  // ════════════════════════════════════════════════════════
  photoTypes: PhotoType[] = ['bump', 'ultrasound', 'milestone'];
  typeLabels: Record<PhotoType, string> = {
    bump: 'Bump',
    ultrasound: 'Ultrasound',
    milestone: 'Milestone',
  };

  selectedType: PhotoType = 'bump';
  captionDraft = '';
  isUploadingPhoto = false;
  uploadError = '';

  photos: SnapshotPhoto[] = [];

  viewingPhoto: SnapshotPhoto | null = null;

  get groupedPhotos(): { week: number; items: SnapshotPhoto[] }[] {
    const groups = new Map<number, SnapshotPhoto[]>();
    for (const p of this.photos) {
      if (!groups.has(p.week)) groups.set(p.week, []);
      groups.get(p.week)!.push(p);
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([week, items]) => ({ week, items }));
  }

  openCamera(): void {
    // Hook up to Capacitor Camera plugin in production.
    console.log('Open camera for snapshot capture');
  }

  openFilePicker(): void {
    // Hook up to a hidden <input type="file"> or Capacitor Filesystem in production.
    console.log('Open gallery file picker');
  }

  openPhoto(photo: SnapshotPhoto): void {
    this.viewingPhoto = photo;
  }

  closePhoto(): void {
    this.viewingPhoto = null;
  }

  deletePhoto(id: string): void {
    this.photos = this.photos.filter(p => p.id !== id);
    this.closePhoto();
  }

  // ════════════════════════════════════════════════════════
  // HEALTH TRACKER
  // ════════════════════════════════════════════════════════
  health: HealthLog = {
    date: new Date(),
    weight: 0,
    bpSys: 120,
    bpDia: 80,
    kicks: 0,
    mood: 2,
  };

  healthHistory: HealthLog[] = [];

  healthDraft = { weight: 0, bpSys: 120, bpDia: 80, kicks: 0, mood: 2 };
  showHealthForm = false;
  activeField = '';

  moodLabels = ['😢', '😕', '😊', '😄', '🤩'];
  moodNames  = ['Low', 'Okay', 'Good', 'Great', 'Amazing'];

  get bpDisplay(): string {
    return `${this.health.bpSys}/${this.health.bpDia}`;
  }
  get moodEmoji(): string { return this.moodLabels[this.health.mood]; }
  get moodName():  string { return this.moodNames[this.health.mood]; }

  get kickDots(): number[] {
    return Array(Math.max(10, this.health.kicks)).fill(0);
  }

  openHealthForm(): void {
    this.healthDraft = {
      weight: this.health.weight,
      bpSys:  this.health.bpSys,
      bpDia:  this.health.bpDia,
      kicks:  this.health.kicks,
      mood:   this.health.mood,
    };
    this.showHealthForm = true;
  }

  closeHealthForm(): void {
    this.showHealthForm = false;
    this.activeField = '';
  }

  adjustKicks(delta: number): void {
    this.healthDraft.kicks = Math.max(0, this.healthDraft.kicks + delta);
  }

  setMood(idx: number): void {
    this.healthDraft.mood = idx;
  }

  saveHealth(): void {
    this.health = {
      date: new Date(),
      weight: this.healthDraft.weight,
      bpSys:  this.healthDraft.bpSys,
      bpDia:  this.healthDraft.bpDia,
      kicks:  this.healthDraft.kicks,
      mood:   this.healthDraft.mood,
    };
    this.healthHistory.unshift({ ...this.health });
    this.closeHealthForm();
  }

  // ════════════════════════════════════════════════════════
  // LIFECYCLE
  // ════════════════════════════════════════════════════════
  constructor(
    private router: Router,
    private theme: ThemeService,
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }
}