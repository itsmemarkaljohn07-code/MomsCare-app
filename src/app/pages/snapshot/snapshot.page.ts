// snapshot.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ThemeService } from '../../services/theme';
import { AuthService } from '../../services/auth.service';
import { HealthService, HealthData } from '../../services/health.service';
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
  private userSub!: Subscription;
  private healthSub!: Subscription;
  private historySub!: Subscription;
  private currentUid: string | null = null;

  pregnancyWeek = 20;
  today = new Date();
  Math = Math;

  /** Reads router state so tapping the Homepage's compact Health
   *  Tracker card can land directly on the 'health' tab here. */
  activeTab: 'gallery' | 'health' = 'gallery';
  activeNavTab = 'snapshot';

  navigate(route: string): void {
    this.router.navigate([route]);
  }

  // ════════════════════════════════════════════════════════
  // PHOTO GALLERY (unchanged)
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
    console.log('Open camera for snapshot capture');
  }

  openFilePicker(): void {
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
  // HEALTH TRACKER — backed by the shared HealthService, always in
  // sync with the Homepage's compact Health Tracker summary.
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

  /** Minimalist mood-face mouth curve per mood index (0-4) — replaces
   *  the colorful emoji face with one consistent line-art icon, used
   *  identically here and on the Homepage's summary card. */
  moodMouthPaths: string[] = [
    'M6 11.5 Q9 8.5 12 11.5',
    'M6.5 11.3 Q9 10.3 11.5 11.3',
    'M6.5 11 Q9 11.8 11.5 11',
    'M6 11 Q9 13.2 12 11',
    'M5.5 10.5 Q9 14.5 12.5 10.5',
  ];

  get bpDisplay(): string {
    return `${this.health.bpSys}/${this.health.bpDia}`;
  }
  get moodName(): string { return this.moodNames[this.health.mood]; }

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

  async saveHealth(): Promise<void> {
    if (!this.currentUid) { this.closeHealthForm(); return; }
    const payload: HealthData = {
      weight: this.healthDraft.weight,
      bpSys:  this.healthDraft.bpSys,
      bpDia:  this.healthDraft.bpDia,
      kicks:  this.healthDraft.kicks,
      mood:   this.healthDraft.mood,
    };
    try {
      await this.healthService.saveHealth(this.currentUid, payload);
    } catch (err) {
      console.error('Failed to save health data:', err);
    }
    this.closeHealthForm();
  }

  // ════════════════════════════════════════════════════════
  // LIFECYCLE
  // ════════════════════════════════════════════════════════
  constructor(
    private router: Router,
    private theme: ThemeService,
    private authService: AuthService,
    private healthService: HealthService,
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));

    // Land on the Health tab directly when arriving from the
    // Homepage's compact Health Tracker shortcut.
    const navState = window.history.state as { tab?: string } | undefined;
    if (navState?.tab === 'health') {
      this.activeTab = 'health';
    }

    this.userSub = this.authService.user$.subscribe(u => {
      this.currentUid = u?.uid ?? null;
    });

    this.healthSub = this.healthService.getCurrentHealth$().subscribe(data => {
      if (data) {
        this.health = {
          date: new Date(),
          weight: data.weight ?? 0,
          bpSys:  data.bpSys  ?? 120,
          bpDia:  data.bpDia  ?? 80,
          kicks:  data.kicks  ?? 0,
          mood:   data.mood   ?? 2,
        };
      }
    });

    // Live listener — new entries (add/edit) appear here automatically,
    // already ordered most-recent-first, without any manual refresh.
    this.historySub = this.healthService.getHistory$().subscribe(list => {
      this.healthHistory = list.map(h => ({
        date:   h.loggedAt?.toDate ? h.loggedAt.toDate() : new Date(),
        weight: h.weight,
        bpSys:  h.bpSys,
        bpDia:  h.bpDia,
        kicks:  h.kicks,
        mood:   h.mood,
      }));
    });

    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
    this.userSub?.unsubscribe();
    this.healthSub?.unsubscribe();
    this.historySub?.unsubscribe();
  }
}