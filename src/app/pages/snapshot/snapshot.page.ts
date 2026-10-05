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
import { DoctorProfileService, DoctorProfile } from '../../services/doctor-profile.service';
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

  // The patient's due date, fetched once when their profile loads
  // (see ngOnInit). pregnancyWeek below is computed FROM this on every
  // read, rather than being a value that has to be manually kept in
  // sync — that's what let it silently go stale/wrong before.
  private currentDueDate: string | null = null;

  /** Current pregnancy week, computed live from the patient's due
   *  date. Same 280-day/40-week formula as computeWeek() in the admin
   *  dashboard's patient-view-live.tsx, so both apps always agree.
   *  Returns 0 if no due date is on file yet. */
  get pregnancyWeek(): number {
    if (!this.currentDueDate) return 0;
    const TOTAL_DAYS = 280;
    const msPerDay = 24 * 60 * 60 * 1000;
    const dueTime = new Date(this.currentDueDate).getTime();
    if (isNaN(dueTime)) return 0;
    const daysUntilDue = Math.round((dueTime - Date.now()) / msPerDay);
    const daysElapsed = Math.max(0, Math.min(TOTAL_DAYS, TOTAL_DAYS - daysUntilDue));
    return Math.min(40, Math.floor(daysElapsed / 7));
  }

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

  // ── Doctor profile lookup for comment display ────────────────────
  // Keyed by authorUid when available, else by authorName -- matches
  // the same key DoctorProfileService itself caches under. undefined
  // = not yet resolved, null = resolved but no profile found.
  doctorProfiles: Record<string, DoctorProfile | null | undefined> = {};

  private doctorProfileKey(comment: SnapshotComment): string {
    return comment.authorUid || comment.authorName;
  }

  doctorAvatarUrl(comment: SnapshotComment): string | undefined {
    return this.doctorProfiles[this.doctorProfileKey(comment)]?.photoUrl;
  }

  doctorSpecialty(comment: SnapshotComment): string | undefined {
    return this.doctorProfiles[this.doctorProfileKey(comment)]?.specialty;
  }

  /** For a fallback avatar when there's no photo -- initials, and a
   *  color deterministically chosen from the name, reusing the exact
   *  same palette avatar.page.ts already uses for the patient's own
   *  avatar picker, rather than introducing a second color set. */
  private readonly avatarColors = [
    '#e07eb8', '#b57fd4', '#7acfcf', '#f0a050', '#5b8fd4',
    '#d44b7a', '#5bba8a', '#9b6fc4', '#e05580', '#6dbfbf',
  ];

  getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  getAvatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return this.avatarColors[hash % this.avatarColors.length];
  }

  /** Resolves and caches a profile for every doctor-authored comment
   *  in the current thread that hasn't been looked up yet. Marks each
   *  key with `null` immediately so a comment list re-emitting while a
   *  lookup is still in flight doesn't trigger a duplicate fetch. */
  private resolveDoctorProfiles(comments: SnapshotComment[]): void {
    for (const c of comments) {
      if (c.authorRole !== 'admin') continue;
      const key = this.doctorProfileKey(c);
      if (key in this.doctorProfiles) continue;
      this.doctorProfiles = { ...this.doctorProfiles, [key]: null };
      this.doctorProfileService.getDoctorProfile(c.authorUid, c.authorName).then(profile => {
        this.doctorProfiles = { ...this.doctorProfiles, [key]: profile };
      });
    }
  }

  openPhoto(photo: SnapshotPhoto): void {
    this.viewingPhoto = photo;
    this.cancelReply();

    this.commentsSub?.unsubscribe();
    if (this.currentUid) {
      this.commentsSub = this.commentService.getComments$(this.currentUid, photo.id)
        .subscribe(comments => {
          this.photoComments = comments;
          this.resolveDoctorProfiles(comments);
        });
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
    private doctorProfileService: DoctorProfileService,
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
          this.currentDueDate = profile?.dueDate ?? null;
        });
      } else {
        this.photos = [];
        this.currentDueDate = null;
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