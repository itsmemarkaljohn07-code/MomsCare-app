// snapshot.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ThemeService } from '../../services/theme';
import { AuthService } from '../../services/auth.service';
import { HealthService, HealthData } from '../../services/health.service';
import { PhotoService, SnapshotPhotoRecord, HealthSnapshotAtUpload } from '../../services/photo.service';
import { Subscription } from 'rxjs';

export type PhotoType = 'bump' | 'ultrasound' | 'milestone';

export interface SnapshotPhoto {
  id: string;
  imageUrl: string;
  type: PhotoType;
  week: number;
  caption: string;
  date: Date;
  healthSnapshot?: HealthSnapshotAtUpload;
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
  private photosSub?: Subscription;
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
  // PHOTO GALLERY — real uploads via PhotoService (Cloudinary for the
  // image, Firestore for metadata). Each photo also carries a frozen
  // snapshot of the user's health data at the moment it was uploaded,
  // powering the flip-card feature below.
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

  /** Tracks which cards are currently flipped, by photo id — using a
   *  Set means each card's flip state is fully independent of the
   *  others. */
  flippedIds = new Set<string>();

  toggleFlip(id: string): void {
    if (this.flippedIds.has(id)) {
      this.flippedIds.delete(id);
    } else {
      this.flippedIds.add(id);
    }
  }

  isFlipped(id: string): boolean {
    return this.flippedIds.has(id);
  }

    /** Groups photos by the actual calendar day they were uploaded (in
   *  the user's own local time, not UTC), most-recent day first —
   *  matching the behaviour of a phone's native Gallery app rather
   *  than grouping by pregnancy week. */
  get groupedPhotos(): { dateKey: string; label: string; items: SnapshotPhoto[] }[] {
    const groups = new Map<string, SnapshotPhoto[]>();
    for (const p of this.photos) {
      const key = this.toLocalDateKey(p.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0])) // YYYY-MM-DD strings sort chronologically
      .map(([dateKey, items]) => ({
        dateKey,
        label: this.formatGroupLabel(dateKey),
        items,
      }));
  }

  private toLocalDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private formatGroupLabel(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map(Number);
    const groupDate = new Date(y, m - 1, d);
    const formatted = groupDate.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });

    const todayKey = this.toLocalDateKey(new Date());
    return dateKey === todayKey ? `Today — ${formatted}` : formatted;
  }

  private toSnapshotPhoto(rec: SnapshotPhotoRecord): SnapshotPhoto {
    return {
      id: rec.id!,
      imageUrl: rec.imageUrl,
      type: rec.type,
      week: rec.week,
      caption: rec.caption,
      date: rec.createdAt?.toDate ? rec.createdAt.toDate() : new Date(),
      healthSnapshot: rec.healthSnapshot,
    };
  }

  private async captureAndUpload(getDataUrl: () => Promise<string | null>): Promise<void> {
    if (!this.currentUid) return;
    this.uploadError = '';

    let dataUrl: string | null;
    try {
      dataUrl = await getDataUrl();
    } catch {
      // User cancelled the camera/picker — not a real error.
      return;
    }
    if (!dataUrl) return;

    this.isUploadingPhoto = true;
    try {
      await this.photoService.uploadPhoto(this.currentUid, dataUrl, {
        type: this.selectedType,
        week: this.pregnancyWeek,
        caption: this.captionDraft,
        // Freezes the user's REAL, live health data at this exact
        // moment onto the photo — never changes afterward, even if
        // they log new health data later.
        healthSnapshot: {
          weight: this.health.weight,
          bpSys:  this.health.bpSys,
          bpDia:  this.health.bpDia,
          kicks:  this.health.kicks,
          mood:   this.health.mood,
        },
      });
      this.captionDraft = '';
    } catch (err: any) {
      console.error('Photo upload failed:', err);
      this.uploadError = err?.message || 'Failed to upload photo. Please try again.';
    } finally {
      this.isUploadingPhoto = false;
    }
  }

  async openCamera(): Promise<void> {
    await this.captureAndUpload(() => this.photoService.capturePhoto());
  }

  async openFilePicker(): Promise<void> {
    await this.captureAndUpload(() => this.photoService.pickFromGallery());
  }

  openPhoto(photo: SnapshotPhoto): void {
    this.viewingPhoto = photo;
  }

  closePhoto(): void {
    this.viewingPhoto = null;
  }

  async deletePhoto(id: string): Promise<void> {
    if (!this.currentUid) return;
    try {
      await this.photoService.deletePhoto(this.currentUid, id);
    } catch (err) {
      console.error('Failed to delete photo:', err);
    }
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
   *  identically here, on the Homepage's summary card, and on the
   *  back of each photo's flip card. */
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
    private photoService: PhotoService,
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));

    const navState = window.history.state as { tab?: string } | undefined;
    if (navState?.tab === 'health') {
      this.activeTab = 'health';
    }

    this.userSub = this.authService.user$.subscribe(u => {
      this.currentUid = u?.uid ?? null;

      this.photosSub?.unsubscribe();
      if (this.currentUid) {
        this.photosSub = this.photoService.getPhotos$(this.currentUid).subscribe(records => {
          this.photos = records.map(r => this.toSnapshotPhoto(r));
        });
      } else {
        this.photos = [];
      }
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
    this.photosSub?.unsubscribe();
  }
}