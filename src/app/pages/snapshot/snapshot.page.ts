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
import { CommentService, SnapshotComment } from '../../services/comment.service';
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
  private commentsSub?: Subscription;
  private currentUid: string | null = null;
  currentUserName = 'You';

  pregnancyWeek = 20;
  today = new Date();
  Math = Math;

  activeTab: 'gallery' | 'health' = 'gallery';
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

  get groupedPhotos(): { dateKey: string; label: string; items: SnapshotPhoto[] }[] {
    const groups = new Map<string, SnapshotPhoto[]>();
    for (const p of this.photos) {
      const key = this.toLocalDateKey(p.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
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
      return;
    }
    if (!dataUrl) return;

    this.isUploadingPhoto = true;
    try {
      await this.photoService.uploadPhoto(this.currentUid, dataUrl, {
        type: this.selectedType,
        week: this.pregnancyWeek,
        caption: this.captionDraft,
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

  // ── Photo viewer + comment thread ──────────────────────────────────
  photoComments: SnapshotComment[] = [];
  replyingToId: string | null = null;
  replyingToAuthorName = '';
  replyDraft = '';

  get threadedComments(): { comment: SnapshotComment; replies: SnapshotComment[] }[] {
    const topLevel = this.photoComments.filter(c => !c.parentCommentId);
    return topLevel.map(comment => ({
      comment,
      replies: this.photoComments.filter(r => r.parentCommentId === comment.id),
    }));
  }

    openPhoto(photo: SnapshotPhoto): void {
    this.viewingPhoto = photo;
    this.cancelReply();

    this.commentsSub?.unsubscribe();
    if (this.currentUid) {
      this.commentsSub = this.commentService.getComments$(this.currentUid, photo.id)
        .subscribe(comments => (this.photoComments = comments));
    }
  }

  closePhoto(): void {
    this.viewingPhoto = null;
    this.commentsSub?.unsubscribe();
    this.photoComments = [];
    this.cancelReply();
  }

  /** Tapping "Reply" only sets WHICH comment is being replied to — the
   *  actual input is a single, persistent bar pinned to the bottom of
   *  the sheet (see .reply-bar in the template), never an element that
   *  appears/disappears inline within the scrolling comment list. */
  toggleReply(commentId: string | undefined, authorName: string): void {
    if (!commentId) return;
    if (this.replyingToId === commentId) {
      this.cancelReply();
      return;
    }
    this.replyingToId = commentId;
    this.replyingToAuthorName = authorName;
    this.replyDraft = '';
  }

  cancelReply(): void {
    this.replyingToId = null;
    this.replyingToAuthorName = '';
    this.replyDraft = '';
  }

  async sendReply(parentCommentId: string | null): Promise<void> {
    if (!parentCommentId || !this.currentUid || !this.viewingPhoto || !this.replyDraft.trim()) return;
    try {
      await this.commentService.postReply(
        this.currentUid,
        this.viewingPhoto.id,
        this.currentUserName,
        this.replyDraft.trim(),
        parentCommentId
      );
      this.cancelReply();
    } catch (err) {
      console.error('Failed to post reply:', err);
    }
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
    private commentService: CommentService,
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

        this.authService.getProfile().then(profile => {
          if (profile?.fullName) this.currentUserName = profile.fullName;
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
    this.commentsSub?.unsubscribe();
  }
}