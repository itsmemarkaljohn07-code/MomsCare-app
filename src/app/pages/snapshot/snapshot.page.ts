// snapshot.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme';
import { AuthService } from '../../services/auth.service';
import { CloudinaryService } from '../../services/cloudinary.service';
import { SnapshotService, SnapshotPhoto } from '../../services/snapshot.service';
import { Subscription } from 'rxjs';

export interface HealthLog {
  date: string;
  weight: number;
  bpSys: number;
  bpDia: number;
  kicks: number;
  mood: number;       // 0-4 index
}

@Component({
  selector: 'app-snapshot',
  templateUrl: './snapshot.page.html',
  styleUrls: ['./snapshot.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class SnapshotPage implements OnInit, OnDestroy {

  darkMode = false;
  private themeSub!: Subscription;

  animReady     = false;
  pregnancyWeek = 20;
  today         = new Date();
  Math          = Math;   // expose Math to template for min()

  // ── Tabs ─────────────────────────────────────────────────
  activeTab: 'gallery' | 'health' = 'gallery';

  // ── Photo gallery ────────────────────────────────────────
  photos: SnapshotPhoto[]  = [];
  photoTypes: Array<SnapshotPhoto['type']> = ['bump', 'ultrasound', 'milestone'];
  selectedType: SnapshotPhoto['type']      = 'bump';
  captionDraft = '';
  viewingPhoto: SnapshotPhoto | null = null;
  isUploadingPhoto = false;
  uploadError = '';

  typeLabels: Record<SnapshotPhoto['type'], string> = {
    bump:       '🤰 Bump Selfie',
    ultrasound: '🔬 Ultrasound',
    milestone:  '⭐ Milestone',
  };

  get groupedPhotos(): { week: number; items: SnapshotPhoto[] }[] {
    const map: Record<number, SnapshotPhoto[]> = {};
    for (const p of this.photos) {
      if (!map[p.week]) map[p.week] = [];
      map[p.week].push(p);
    }
    return Object.keys(map)
      .map(Number)
      .sort((a, b) => b - a)
      .map(week => ({ week, items: map[week] }));
  }

  openFilePicker(): void {
    const input = document.createElement('input');
    input.type  = 'file';
    input.accept = 'image/*';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.uploadAndAddPhoto(file);
    };
    input.click();
  }

  openCamera(): void {
    // input.capture="environment" is designed for phones (opens the rear
    // camera directly). On a laptop this can hang waiting for a webcam
    // permission prompt that never resolves properly, since there's no
    // "environment-facing" camera to satisfy the request. So: only use
    // capture on an actual mobile device; fall back to a plain file
    // picker everywhere else (including desktop browser testing).
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = 'image/*';
    if (isMobile) {
      input.capture = 'environment';
    }
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.uploadAndAddPhoto(file);
    };
    input.click();
  }

  private async uploadAndAddPhoto(file: File): Promise<void> {
    const uid = this.authService.currentUid;
    if (!uid) {
      this.uploadError = 'You need to be signed in to add photos.';
      return;
    }

    this.isUploadingPhoto = true;
    this.uploadError = '';

    try {
      const result = await this.cloudinary.uploadImage(file);

      const newPhoto: Omit<SnapshotPhoto, 'id'> = {
        imageUrl: result.secure_url,
        week:     this.pregnancyWeek,
        date:     new Date().toISOString(),
        caption:  this.captionDraft.trim(),
        type:     this.selectedType,
      };

      await this.snapshotService.addPhoto(uid, newPhoto);
      this.captionDraft = '';
      await this.refreshPhotos();
    } catch (err) {
      console.error('Photo upload failed:', err);
      this.uploadError = 'Failed to upload photo. Please check your connection and try again.';
    } finally {
      this.isUploadingPhoto = false;
    }
  }

  async deletePhoto(id: string): Promise<void> {
    try {
      await this.snapshotService.deletePhoto(id);
      this.viewingPhoto = null;
      await this.refreshPhotos();
    } catch (err) {
      console.error('Failed to delete photo:', err);
    }
  }

  openPhoto(photo: SnapshotPhoto): void  { this.viewingPhoto = photo; }
  closePhoto(): void                      { this.viewingPhoto = null; }

  private async refreshPhotos(): Promise<void> {
    const uid = this.authService.currentUid;
    if (!uid) return;
    try {
      this.photos = await this.snapshotService.getPhotos(uid);
    } catch (err) {
      console.error('Failed to load photos:', err);
    }
  }

  // ── Health tracking ──────────────────────────────────────
  // NOTE: still local-only (localStorage) for now — not part of this
  // Cloudinary migration since it's numeric data, not images. Worth
  // moving to Firestore separately if you want it synced across devices.
  health: HealthLog = {
    date:   new Date().toISOString(),
    weight: 62.4,
    bpSys:  112,
    bpDia:  72,
    kicks:  0,
    mood:   3,
  };

  healthDraft: HealthLog = { ...this.health };
  activeField   = '';
  showHealthForm = false;
  healthHistory: HealthLog[] = [];

  moodLabels  = ['😢', '😕', '😊', '😄', '🤩'];
  moodNames   = ['Sad', 'Low', 'Okay', 'Good', 'Amazing'];
  kickDots    = Array(10).fill(0);

  get bpDisplay()  { return `${this.health.bpSys}/${this.health.bpDia}`; }
  get moodEmoji()  { return this.moodLabels[this.health.mood] ?? '😊'; }
  get moodName()   { return this.moodNames[this.health.mood] ?? 'Okay'; }

  openHealthForm(): void {
    this.healthDraft  = { ...this.health };
    this.showHealthForm = true;
  }
  closeHealthForm(): void {
    this.showHealthForm = false;
    this.activeField    = '';
  }

  saveHealth(): void {
    this.health      = { ...this.healthDraft, date: new Date().toISOString() };
    this.healthHistory = [this.health, ...this.healthHistory].slice(0, 30);
    this.closeHealthForm();
    this.saveHealthData();
  }

  adjustKicks(delta: number): void {
    this.healthDraft.kicks = Math.max(0, this.healthDraft.kicks + delta);
  }

  setMood(idx: number): void { this.healthDraft.mood = idx; }

  private saveHealthData(): void {
    try {
      localStorage.setItem('momscare_health_current', JSON.stringify(this.health));
      localStorage.setItem('momscare_health_history', JSON.stringify(this.healthHistory));
    } catch {}
  }

  private loadHealthData(): void {
    try {
      const cur = localStorage.getItem('momscare_health_current');
      if (cur) this.health = JSON.parse(cur);
      const hist = localStorage.getItem('momscare_health_history');
      if (hist) this.healthHistory = JSON.parse(hist);
    } catch {}
  }

  // ── Lifecycle ─────────────────────────────────────────────
  constructor(
    private router: Router,
    private theme: ThemeService,
    private authService: AuthService,
    private cloudinary: CloudinaryService,
    private snapshotService: SnapshotService,
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    this.refreshPhotos();
    this.loadHealthData();
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }

  ngOnDestroy(): void { this.themeSub?.unsubscribe(); }

  navigate(route: string): void { this.router.navigate([route]); }
}