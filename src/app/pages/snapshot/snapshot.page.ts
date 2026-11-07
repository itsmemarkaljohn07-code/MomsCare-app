// snapshot.page.ts
import { Component, HostListener, NgZone, OnInit, OnDestroy } from '@angular/core';
import { Platform } from '@ionic/angular/standalone';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ThemeService } from '../../services/theme';
import { AuthService } from '../../services/auth.service';
import { ProfileStoreService } from '../../services/profile-store.service';
import { parseStoredDate } from '../../shared/date-utils';
import { pregnancyStatus } from '../../shared/pregnancy-status';
import { WeightUnit, kgToUnit, weightUnitOf } from '../../shared/weight-units';
import { HealthFormDraft, HealthFormErrors, buildHealthEntry, realValue, validateHealthForm } from '../../shared/health-form';
import { HealthService, HealthData, ClinicReading } from '../../services/health.service';
import { HealthGraphComponent } from './health-graph/health-graph.component';
import { SelfLogInput } from '../../shared/health-series';
import { localYmd } from '../../shared/appointment-request';
import { PhotoService, SnapshotPhotoRecord, HealthSnapshotAtUpload, PickerProblem } from '../../services/photo.service';
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
  imports: [IonicModule, CommonModule, FormsModule, HealthGraphComponent],
})
export class SnapshotPage implements OnInit, OnDestroy {

  animReady = false;
  darkMode  = false;
  private themeSub!: Subscription;
  private userSub!: Subscription;
  private healthSub!: Subscription;
  private historySub!: Subscription;
  private clinicSub?: Subscription;
  private routeSub?: Subscription;
  private profileSub?: Subscription;
  /** Photo whose comment thread a tapped push asked to open (?photoId=). */
  private pendingPhotoId: string | null = null;
  private photosLoaded = false;
  private photosSub?: Subscription;
  private commentsSub?: Subscription;
  private currentUid: string | null = null;
  currentUserName = 'You';

  // The patient's due date, from the live profile (ProfileStoreService),
  // so an edited due date shows here at once. pregnancyWeek below is
  // computed FROM it on every read.
  private currentDueDate: string | null = null;

  /** Current pregnancy week from the patient's due date: the shared
   *  formula (shared/pregnancy-status.ts), the same 280-day/40-week rule
   *  as the admin dashboard. Returns 0 if no due date is on file yet. */
  get pregnancyWeek(): number {
    return pregnancyStatus(parseStoredDate(this.currentDueDate)).week;
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
  /** A neutral note (cancelled picker, saved offline). */
  uploadNote = '';
  /** The photo whose upload failed, kept so "Try again" doesn't need a new pick. */
  private pendingDataUrl: string | null = null;
  get canRetryUpload(): boolean { return !!this.pendingDataUrl && !this.isUploadingPhoto; }

  photos: SnapshotPhoto[] = [];

  viewingPhoto: SnapshotPhoto | null = null;
  /** The open photo: loading, shown, or couldn't be loaded. */
  viewerImageState: 'loading' | 'loaded' | 'error' = 'loading';
  private viewerBackSub?: Subscription;

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
    if (!this.currentUid || this.isUploadingPhoto) return;
    this.uploadError = '';
    this.uploadNote = '';

    let dataUrl: string | null;
    try {
      dataUrl = await getDataUrl();
    } catch (err) {
      this.showPickerProblem(PhotoService.classifyPickerError(err), err);
      return;
    }
    if (!dataUrl) {
      this.uploadNote = 'No photo selected.';
      return;
    }
    this.pendingDataUrl = dataUrl;
    await this.uploadPending();
  }

  /** Uploads the kept photo again after a failure. */
  async retryUpload(): Promise<void> {
    if (!this.canRetryUpload) return;
    this.uploadError = '';
    this.uploadNote = '';
    await this.uploadPending();
  }

  private showPickerProblem(problem: PickerProblem, err: unknown): void {
    switch (problem) {
      case 'cancelled':
        this.uploadNote = 'No photo selected.';
        return;
      case 'no-camera':
        this.uploadError = "This phone has no camera MomCare can use. You can choose a photo from your gallery instead.";
        return;
      case 'denied':
        this.uploadError = "MomCare isn't allowed to use the camera. Allow it in Settings > Apps > MomCare > Permissions, then try again.";
        return;
      default:
        console.error('Camera or gallery failed:', err);
        this.uploadError = "Couldn't open the camera or gallery. Please try again.";
    }
  }

  private async uploadPending(): Promise<void> {
    const dataUrl = this.pendingDataUrl;
    if (!this.currentUid || !dataUrl) return;
    this.isUploadingPhoto = true;
    try {
      const outcome = await this.photoService.uploadPhoto(this.currentUid, dataUrl, {
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
      this.pendingDataUrl = null;
      if (outcome === 'queued') {
        this.uploadNote = "Photo uploaded. It will appear in your gallery when you're back online.";
      }
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

  // ── Staff identity shown on a comment ────────────────────────────
  // Read straight from the comment itself (authorSpecialty /
  // authorPhotoUrl, written by the dashboard when staff post). The
  // app deliberately does NOT look doctors up in Firestore: that
  // collection holds login emails and auth IDs and is locked down
  // to patients by the security rules. Absent fields simply fall
  // back to the initials avatar and no specialty line.
  /** The name patients see as the author of a comment. Admin accounts
   *  are stored under their login EMAIL, which patients should never be
   *  shown, so admin comments appear as the clinic itself. Doctors keep
   *  their own name. The '@' guard also covers any other staff comment
   *  that ended up with an email as its name. This only changes what is
   *  displayed; the stored value is fixed at the source in the
   *  dashboard (see photo-comment-thread). */
  private readonly clinicDisplayName = 'MomCare Clinic';

  commentAuthorName(comment: SnapshotComment): string {
    const name = comment.authorName ?? '';
    if (comment.authorRole === 'admin') return this.clinicDisplayName;
    if (comment.authorRole !== 'user' && name.includes('@')) return this.clinicDisplayName;
    return name;
  }

  doctorAvatarUrl(comment: SnapshotComment): string | undefined {
    return comment.authorPhotoUrl || undefined;
  }

  doctorSpecialty(comment: SnapshotComment): string | undefined {
    return comment.authorSpecialty || undefined;
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

  openPhoto(photo: SnapshotPhoto): void {
    this.viewingPhoto = photo;
    this.viewerImageState = photo.imageUrl ? 'loading' : 'error';
    this.cancelReply();
    // Android Back closes the viewer instead of leaving the page (above
    // Ionic's own handlers; run in the zone so the viewer really closes).
    this.viewerBackSub?.unsubscribe();
    this.viewerBackSub = this.platform.backButton.subscribeWithPriority(150, () =>
      this.zone.run(() => this.closePhoto()));

    this.commentsSub?.unsubscribe();
    if (this.currentUid) {
      this.commentsSub = this.commentService.getComments$(this.currentUid, photo.id)
        .subscribe(comments => {
          this.photoComments = comments;
        });
    }
  }

  /** Opens the requested photo's comment thread once the photos have
   *  loaded. If it no longer exists, the page simply stays open. */
  private openPendingPhoto(): void {
    if (!this.pendingPhotoId || !this.photosLoaded) return;
    const photo = this.photos.find(p => p.id === this.pendingPhotoId);
    this.pendingPhotoId = null;
    if (photo) this.openPhoto(photo);
  }

  /** Escape closes the viewer too (keyboard / desktop). */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.viewingPhoto) this.closePhoto();
  }

  closePhoto(): void {
    this.viewerBackSub?.unsubscribe();
    this.viewerBackSub = undefined;
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

  // The graph's data: every log she saved and the clinic's readings, live.
  graphLogs: SelfLogInput[] = [];
  clinicReadings: ClinicReading[] = [];
  private logsLoaded = false;
  private clinicLoaded = false;
  graphError = false;
  clinicError = false;
  get graphLoading(): boolean { return !this.logsLoaded || !this.clinicLoaded; }

  /** The due date as YYYY-MM-DD (for the graph's pregnancy weeks). */
  get dueDateYmd(): string | null {
    const d = parseStoredDate(this.currentDueDate);
    return d ? localYmd(d) : null;
  }

  /** The form starts blank: only what she types is saved. Kicks and mood
   *  open with her current values, as before. */
  healthDraft: HealthFormDraft = { weight: null, bpSys: null, bpDia: null, kicks: 0, mood: 2 };
  healthErrors: HealthFormErrors = {};
  /** Kicks and mood the form opened with (a save must change something). */
  private healthOpened = { kicks: 0, mood: 2 };
  /** Her last real stored values, shown only as placeholders. */
  lastReal: { weight: number | null; bpSys: number | null; bpDia: number | null } = { weight: null, bpSys: null, bpDia: null };
  healthSaving = false;
  /** Weight Unit from the live profile (Pregnancy Settings); stored values stay kg. */
  weightUnit: WeightUnit = 'kg';
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

  /** A stored (kg) weight in the patient's unit, e.g. "137.6". */
  showWeight(kg: number): number {
    return kgToUnit(kg, this.weightUnit);
  }

  get weightPlaceholder(): string {
    return this.lastReal.weight !== null
      ? String(kgToUnit(this.lastReal.weight, this.weightUnit))
      : (this.weightUnit === 'lbs' ? 'e.g. 137.6' : 'e.g. 62.4');
  }

  openHealthForm(): void {
    // The weight is typed in the patient's unit; it's stored in kg.
    this.healthDraft = {
      weight: null,
      bpSys:  null,
      bpDia:  null,
      kicks:  this.health.kicks,
      mood:   this.health.mood,
    };
    this.healthOpened = { kicks: this.health.kicks, mood: this.health.mood };
    this.healthErrors = {};
    this.showHealthForm = true;
  }

  /** Re-checks once a message is showing, so it clears as she fixes it. */
  revalidateHealth(): void {
    if (Object.keys(this.healthErrors).length) {
      this.healthErrors = validateHealthForm(this.healthDraft, this.weightUnit, this.healthOpened);
    }
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
    if (this.healthSaving) return;
    this.healthErrors = validateHealthForm(this.healthDraft, this.weightUnit, this.healthOpened);
    if (Object.keys(this.healthErrors).length) return;
    // Only the measures she entered (plus kicks and mood) are saved.
    const payload: HealthData = buildHealthEntry(this.healthDraft, this.weightUnit);
    this.healthSaving = true;
    try {
      await this.healthService.saveHealth(this.currentUid, payload);
    } catch (err) {
      console.error('Failed to save health data:', err);
    } finally {
      this.healthSaving = false;
    }
    this.closeHealthForm();
  }

  // ════════════════════════════════════════════════════════
  // LIFECYCLE
  // ════════════════════════════════════════════════════════
  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private theme: ThemeService,
    private authService: AuthService,
    private profileStore: ProfileStoreService,
    private healthService: HealthService,
    private photoService: PhotoService,
    private commentService: CommentService,
    private platform: Platform,
    private zone: NgZone,
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
      this.photosLoaded = false;
      if (this.currentUid) {
        this.photosSub = this.photoService.getPhotos$(this.currentUid).subscribe(records => {
          this.photos = records.map(r => this.toSnapshotPhoto(r));
          this.photosLoaded = true;
          this.openPendingPhoto();
        });

      } else {
        this.photos = [];
        this.photosLoaded = false;
      }
    });

    this.profileSub = this.profileStore.profile$.subscribe(profile => {
      if (profile?.fullName) this.currentUserName = profile.fullName;
      this.currentDueDate = profile?.dueDate ?? null;
      this.weightUnit = weightUnitOf(profile?.weightUnit);
    });

    // Read on every visit (Ionic keeps this page alive), so a push tapped
    // while the page is already open still opens its photo.
    this.routeSub = this.route.queryParamMap.subscribe(params => {
      this.pendingPhotoId = params.get('photoId');
      this.openPendingPhoto();
    });

    this.healthSub = this.healthService.getCurrentHealth$().subscribe(data => {
      this.lastReal = {
        weight: realValue(data?.weight),
        bpSys:  realValue(data?.bpSys),
        bpDia:  realValue(data?.bpDia),
      };
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

    this.historySub = this.healthService.getAllHistory$().subscribe({
      next: list => {
        this.graphLogs = list.map(h => ({
          // A log saved offline has no server time yet: it counts as now.
          loggedAt: h.loggedAt?.toDate ? h.loggedAt.toDate() : new Date(),
          weight: h.weight,
          bpSys:  h.bpSys,
          bpDia:  h.bpDia,
          kicks:  h.kicks,
          mood:   h.mood,
        }));
        this.logsLoaded = true;
        this.graphError = false;
      },
      error: err => {
        console.error('Failed to load health logs:', err);
        this.graphError = true;
      },
    });

    // Kept apart from her own logs: if these can't be read, her own
    // readings still show.
    this.clinicSub = this.healthService.getClinicReadings$().subscribe({
      next: list => {
        this.clinicReadings = list;
        this.clinicLoaded = true;
        this.clinicError = false;
      },
      error: err => {
        console.warn('Clinic readings unavailable:', err?.code ?? err);
        this.clinicReadings = [];
        this.clinicLoaded = true;
        this.clinicError = true;
      },
    });

    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }

  ngOnDestroy(): void {
    this.viewerBackSub?.unsubscribe();
    this.themeSub?.unsubscribe();
    this.userSub?.unsubscribe();
    this.healthSub?.unsubscribe();
    this.historySub?.unsubscribe();
    this.clinicSub?.unsubscribe();
    this.routeSub?.unsubscribe();
    this.profileSub?.unsubscribe();
    this.photosSub?.unsubscribe();
    this.commentsSub?.unsubscribe();
  }
}