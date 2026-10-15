// home.page.ts
import { Component, OnInit, OnDestroy, DoCheck, inject, EnvironmentInjector, runInInjectionContext, ViewChild, ElementRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Firestore, doc, setDoc, Timestamp } from '@angular/fire/firestore';
import { readSettledDoc, reconnectNow } from '../../shared/firestore-read';
import { ThemeService } from '../../services/theme';
import { AuthService, UserProfile } from '../../services/auth.service';
import { ProfileStoreService } from '../../services/profile-store.service';
import { parseStoredDate } from '../../shared/date-utils';
import { pregnancyStatus } from '../../shared/pregnancy-status';
import { WeightUnit, kgToUnit, weightUnitOf } from '../../shared/weight-units';
import { isMissedAppointment } from '../../shared/appointment-status';
import { NotificationsService, AppNotification } from '../../services/notifications.service';
import { AppointmentsService, AppointmentRecord } from '../../services/appointments.service';
import { HealthService, HealthData } from '../../services/health.service';
import { ChecklistRemindersService } from '../../services/checklist-reminders.service';
import { ChecklistState, dueChecklistBellSlots, localDateKey, uncheckedReminderItems } from '../../services/checklist-reminder-plan';
import type { PluginListenerHandle } from '@capacitor/core';
import { FETUS_IMAGES, FetusImage, FetusKeep, fetusImageFor } from '../../shared/fetus-images';
import { FALLBACK_EDGES, StageEdges, edgeStyle, sampleEdges } from '../../shared/stage-edges';
import { Subscription } from 'rxjs';

export interface AppUser {
  fullName:     string;
  email:        string;
  dueDate:      Date;
  firstTimeMom: boolean | null;
}

/** One image on the fetus stage (two while crossfading). */
interface FetusLayer {
  id: number;
  src: string;
  loaded: boolean;
  failed: boolean;
  /** Width / height, once loaded: sizes the image to its own shape. */
  ar: number;
  /** A soft oval around the fetus (percent of the image): never faded. */
  oval: { x: number; y: number; rx: number; ry: number };
}

/** Room around the fetus: the oval's radii are this much larger than half
 *  the fetus rectangle, so it is never tight. */
const FETUS_OVAL_ROOM = 1.25;

/** The soft oval kept solid around the fetus, from the manifest rectangle
 *  (a centred default for anything unlisted). Percent of the image. */
function fetusOvalFor(src: string): { x: number; y: number; rx: number; ry: number } {
  const k: FetusKeep = FETUS_IMAGES.find(i => i.file === src)?.keep ?? { left: 15, top: 10, right: 85, bottom: 90 };
  return {
    x: (k.left + k.right) / 2,
    y: (k.top + k.bottom) / 2,
    rx: ((k.right - k.left) / 2) * FETUS_OVAL_ROOM,
    ry: ((k.bottom - k.top) / 2) * FETUS_OVAL_ROOM,
  };
}

/** A Home checklist row; meals and rest have sub-items. */
interface ChecklistRow {
  id: number;
  task: string;
  done: boolean;
  icon: string;
  subs?: { id: number; task: string; done: boolean }[];
}

/** Crossfade between illustrations; keep in sync with home.page.scss. */
const FETUS_CROSSFADE_MS = 200;
/** How long Home waits for today's checklist before offering Retry. */
const CHECKLIST_LOAD_TIMEOUT_MS = 10000;

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  providers: [DatePipe],
})
export class HomePage implements OnInit, OnDestroy, DoCheck {

  animReady    = false;
  currentTime  = new Date();
  today        = new Date();
  darkMode     = false;
  isLoadingUser = true;
  private themeSub!: Subscription;
  private userSub!: Subscription;
  private profileSub?: Subscription;
  private notifSub!: Subscription;
  private apptSub!: Subscription;
  private healthSub!: Subscription;
  private currentUid: string | null = null;

  private clockInterval:    any;
  private countdownInterval: any;
  private midnightTimeout:  any;

  private envInjector = inject(EnvironmentInjector);

  get selectedAvatar() {
    try {
      const saved = localStorage.getItem('momscare_avatar');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { emoji: '🐻', bgColor: '#e07eb8' };
  }

  currentUser: AppUser = {
    fullName:     '',
    email:        '',
    dueDate:      new Date(),
    firstTimeMom: null,
  };

  pregnancyWeek = 0;
  pregnancyDays = 0;

  /** The week currently being DISPLAYED in the fetal illustration area —
   *  the single source for the image, length, weight, size text, message
   *  and progress bar, so they can never disagree. Defaults to the real
   *  pregnancyWeek; browsing weeks (selectWeek) changes only this, never
   *  pregnancyWeek/dueDate/any stored data. Only set from pregnancyWeek
   *  automatically once, on first load — never re-synced afterward, so
   *  browsing survives the 60s countdown refresh. */
  viewingWeek = 0;
  private viewingWeekInitialized = false;

  get isViewingCurrentWeek(): boolean {
    return this.viewingWeek === this.pregnancyWeek;
  }

  resetToCurrentWeek(): void {
    this.viewingWeek = this.pregnancyWeek;
    this.scrollSelectedWeekIntoView();
  }

  /** Recomputes week and days from the due date (shared formula, so every
   *  page agrees). Runs when the profile changes and every minute. If the
   *  patient was looking at the current week, the viewer follows the new
   *  current week; if she was browsing another week, that stays selected
   *  and the strip is re-centred on it. */
  private recomputePregnancyFromDueDate(): void {
    const wasViewingCurrent = this.viewingWeekInitialized && this.viewingWeek === this.pregnancyWeek;
    const previousWeek = this.pregnancyWeek;
    const status = pregnancyStatus(this.currentUser.dueDate);
    this.pregnancyWeek = status.week;
    this.pregnancyDays = status.days;

    if (!this.viewingWeekInitialized) {
      this.viewingWeek = this.pregnancyWeek;
      this.viewingWeekInitialized = true;
      this.scrollSelectedWeekIntoView();
    } else if (this.pregnancyWeek !== previousWeek) {
      if (wasViewingCurrent) this.viewingWeek = this.pregnancyWeek;
      this.scrollSelectedWeekIntoView();
    }
  }

  get dueDate(): Date { return this.currentUser.dueDate; }

  // ── Week selector ────────────────────────────────────
  // Every week 1-40 in one scrollable strip. Selecting a week changes only
  // viewingWeek.

  readonly weeks: readonly number[] = Array.from({ length: 40 }, (_, i) => i + 1);

  @ViewChild('weekScroller') private weekScroller?: ElementRef<HTMLElement>;

  selectWeek(week: number): void {
    this.viewingWeek = Math.max(1, Math.min(this.weeks.length, week));
    this.scrollSelectedWeekIntoView();
  }

  previousWeek(): void { this.selectWeek(this.viewingWeek - 1); }
  nextWeek(): void { this.selectWeek(this.viewingWeek + 1); }

  /** Centres the selected week in the strip by scrolling the strip
   *  itself (never the page). Waits a frame so the DOM reflects the new
   *  selection first. */
  private scrollSelectedWeekIntoView(): void {
    requestAnimationFrame(() => {
      const scroller = this.weekScroller?.nativeElement;
      const selected = scroller?.querySelector<HTMLElement>(`[data-week="${this.viewingWeek}"]`);
      if (!scroller || !selected) return;
      const scrollerBox = scroller.getBoundingClientRect();
      const selectedBox = selected.getBoundingClientRect();
      const left = scroller.scrollLeft + (selectedBox.left - scrollerBox.left)
        - (scroller.clientWidth - selectedBox.width) / 2;
      scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    });
  }

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

  // These now reflect the browsed viewingWeek, not the real pregnancyWeek
  // — so exploring other weeks shows accurate info for that week without
  // touching any stored data.
  get babySize() {
    const keys = Object.keys(this.babySizes).map(Number).sort((a, b) => a - b);
    let closest = keys[0];
    for (const w of keys) { if (this.viewingWeek >= w) closest = w; }
    return this.babySizes[closest];
  }

  get weeklyMessage(): string {
    const keys = Object.keys(this.weeklyMessages).map(Number).sort((a, b) => a - b);
    let closest = keys[0];
    for (const w of keys) { if (this.viewingWeek >= w) closest = w; }
    return this.weeklyMessages[closest];
  }

  get pregnancyProgress(): number {
    return Math.min(100, Math.round((this.viewingWeek / 40) * 100));
  }

  /** Trimester of the REAL pregnancy week, for the header chips. Browsing
   *  other weeks never changes it (it used to follow viewingWeek, so the
   *  header could read "Week 5" next to "3rd Trimester"). */
  get actualTrimester(): string {
    if (this.pregnancyWeek <= 13) return '1st Trimester';
    if (this.pregnancyWeek <= 26) return '2nd Trimester';
    return '3rd Trimester';
  }

  // ── Fetus illustration ───────────────────────────────
  // One image per illustrated week (shared/fetus-images.ts). Weeks in
  // between show the closest earlier image, with a caption saying so.
  //
  // The images have their own dark-red backgrounds, which CSS can't make
  // pale, so the viewer is a full-width "stage" painted in the image's own
  // edge colours: once an image loads, its outer border is sampled and the
  // stage (and the fades above and below it) use those colours, while the
  // image's edges are feathered into them. Images crossfade on a change.

  /** The images on the stage: the current one, plus the previous one while
   *  it fades out. Rebuilt in ngDoCheck when the shown week's image changes. */
  fetusLayers: FetusLayer[] = [];
  /** CSS variables for the stage background, from the shown image's edges. */
  stageEdgeStyle: Record<string, string> = edgeStyle(FALLBACK_EDGES);

  private fetusLayerSrc: string | null = null;
  private fetusLayerSeq = 0;
  private readonly fetusEdgeCache = new Map<string, StageEdges>();

  private get fetusImage(): FetusImage {
    return fetusImageFor(this.viewingWeek);
  }

  get fetusImageSrc(): string {
    return this.fetusImage.file;
  }

  /** True when the image was drawn for exactly the week being shown. */
  get fetusImageIsExact(): boolean {
    return this.fetusImage.week === this.viewingWeek;
  }

  /** The week the shown image illustrates (for the caption and alt text). */
  get fetusImageWeek(): number {
    return this.fetusImage.week;
  }

  /** Starts a new layer when the image to show changes. Cheap: one string
   *  comparison per change detection. */
  ngDoCheck(): void {
    const src = this.fetusImageSrc;
    if (src === this.fetusLayerSrc) return;
    this.fetusLayerSrc = src;
    // Keep only the layer currently visible (to fade out) plus the new one.
    const visible = this.fetusLayers.filter(l => l.loaded && !l.failed).slice(-1);
    this.fetusLayers = [...visible, { id: ++this.fetusLayerSeq, src, loaded: false, failed: false, ar: 4 / 3, oval: fetusOvalFor(src) }];
  }

  trackFetusLayer(_: number, layer: FetusLayer): number {
    return layer.id;
  }

  /** Width / height of the image currently shown (sizes the backplate). */
  get activeFetusAr(): number {
    const shown = this.fetusLayers.filter(l => l.loaded && !l.failed);
    return shown.length ? shown[shown.length - 1].ar : 4 / 3;
  }

  /** True for the layer that should be fully visible: the newest loaded one. */
  isActiveFetusLayer(layer: FetusLayer): boolean {
    const shown = this.fetusLayers.filter(l => l.loaded && !l.failed);
    return shown.length > 0 && shown[shown.length - 1] === layer;
  }

  onFetusImageLoad(layer: FetusLayer, event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) layer.ar = img.naturalWidth / img.naturalHeight;
    layer.loaded = true;
    this.stageEdgeStyle = edgeStyle(this.edgesFor(layer.src, img));
    this.dropOlderFetusLayers(layer);
    this.preloadNeighbouringFetusImages(layer.src);
  }

  /** A missing or broken file: hidden (no broken-image icon), logged, and
   *  the stage falls back to its default colour. The chart keeps working. */
  onFetusImageError(layer: FetusLayer): void {
    console.warn('[home] fetus image failed to load:', layer.src);
    layer.failed = true;
    if (layer.src === this.fetusLayerSrc) {
      this.stageEdgeStyle = edgeStyle(FALLBACK_EDGES);
      this.fetusLayers = this.fetusLayers.filter(l => l === layer);
    }
  }

  /** Removes the layers behind `layer` once its crossfade has finished. */
  private dropOlderFetusLayers(layer: FetusLayer): void {
    setTimeout(() => {
      const i = this.fetusLayers.indexOf(layer);
      if (i > 0) this.fetusLayers = this.fetusLayers.slice(i);
    }, FETUS_CROSSFADE_MS + 100);
  }

  /** The image's edge colours, sampled once per file and cached. */
  private edgesFor(src: string, img: HTMLImageElement): StageEdges {
    const cached = this.fetusEdgeCache.get(src);
    if (cached) return cached;
    const edges = sampleEdges(img) ?? FALLBACK_EDGES;
    this.fetusEdgeCache.set(src, edges);
    return edges;
  }

  /** Warms the cache with the images either side of the one shown, so
   *  stepping a week either way swaps without a visible load. */
  private preloadNeighbouringFetusImages(src: string): void {
    const i = FETUS_IMAGES.findIndex(img => img.file === src);
    if (i < 0) return;
    for (const neighbour of [FETUS_IMAGES[i - 1], FETUS_IMAGES[i + 1]]) {
      if (neighbour) new Image().src = neighbour.file;
    }
  }

  activeTab = 'home';

  setTab(tab: string): void { this.activeTab = tab; }

  navigate(route: string): void {
    this.router.navigate([route]);
  }

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

  showNotifPanel = false;
  notifications: AppNotification[] = [];

  get unreadCount(): number { return this.notifications.filter(n => !n.read).length; }

  /** The time under a bell entry. Entries from the clinic dashboard don't
   *  store the display text, so it comes from when they were created, in
   *  the same format ("Oct 14, 5:00 PM"). */
  notifTime(n: AppNotification): string {
    if (n.time) return n.time;
    const created: Date | undefined = n.createdAt?.toDate?.();
    return created && !isNaN(created.getTime())
      ? created.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : '';
  }

  /** Which minimal icon a bell entry shows. Dashboard entries carry a
   *  type; the app's own (checklist, appointment reminders) are known by
   *  their stored emoji or title. The stored data is not changed. */
  notifIcon(n: AppNotification): 'checklist' | 'calendar' | 'calendar-check' | 'calendar-x' | 'clock' | 'message' | 'bell' {
    switch (n.type) {
      case 'appointment_missed':   return 'clock';
      case 'doctor_comment':       return 'message';
      case 'appointment_created':  return 'calendar';
      case 'appointment_approved': return 'calendar-check';
      case 'appointment_declined': return 'calendar-x';
      // Approved = the appointment is cancelled; declined = it still stands.
      case 'cancellation_update':  return n.icon === '✅' ? 'calendar-x' : 'calendar-check';
    }
    if (n.icon === '📅') return 'calendar';
    if (n.icon === '✅' || /checklist|reminder for mommy/i.test(n.title ?? '')) return 'checklist';
    return 'bell';
  }

  toggleNotifPanel(): void {
    this.showNotifPanel = !this.showNotifPanel;
  }
  closeNotifPanel(): void {
    this.showNotifPanel = false;
  }

  onNotifTap(n: AppNotification): void {
    if (!n.read && this.currentUid) {
      this.notificationsService.markRead(this.currentUid, n.id);
    }
    if (n.route) {
      this.closeNotifPanel();
      this.router.navigate([n.route]);
    }
  }

  clearAllNotifs(): void {
    if (!this.currentUid || this.notifications.length === 0) return;
    this.notificationsService.markAllRead(this.currentUid, this.notifications.map(n => n.id));
  }

  // ════════════════════════════════════════════════════════
  // APPOINTMENTS — real-time from Firestore via AppointmentsService.
  // ════════════════════════════════════════════════════════
  private readonly MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  private readonly DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  private allAppointments: AppointmentRecord[] = [];

  private toApptDisplay(rec: AppointmentRecord) {
    const d = new Date(rec.date + 'T00:00:00');
    return {
      id: rec.id,
      date: `${this.MONTHS[d.getMonth()]} ${d.getDate()}`,
      day: this.DAYS[d.getDay()],
      label: rec.label,
      doctor: rec.doctor,
      icon: rec.icon,
      accentColor: rec.accentColor,
    };
  }

  get upcomingAppointments() {
    // Same rule as the Appointments page: gone 3 hours after the start.
    const now = new Date();
    return this.allAppointments
      .filter(r => r.status === 'upcoming' && !isMissedAppointment(r, now))
      .slice(0, 2)
      .map(r => this.toApptDisplay(r));
  }

  goToAppointments(): void {
    this.router.navigate(['/appointments']);
  }

  // ════════════════════════════════════════════════════════
  // HEALTH TRACKER — compact, display-only shortcut to the full
  // Health Tracker on the Snapshot page. Still reads live from the
  // exact same shared HealthService as Snapshot, so it's never a
  // separate data source — editing happens only on Snapshot, tapping
  // this card navigates there.
  // ════════════════════════════════════════════════════════
  health: HealthData = { weight: 0, bpSys: 0, bpDia: 0, kicks: 0, mood: 2 };
  /** Weight Unit from the live profile (Pregnancy Settings); health data stays in kg. */
  weightUnit: WeightUnit = 'kg';
  showWeight(kg: number): number { return kgToUnit(kg, this.weightUnit); }

  get bpDisplay(): string {
    return this.health.bpSys && this.health.bpDia
      ? `${this.health.bpSys}/${this.health.bpDia}`
      : '--/--';
  }

  moodNames = ['Low', 'Okay', 'Good', 'Great', 'Amazing'];

  /** Minimalist mood-face mouth curve per mood index (0-4) — replaces
   *  colorful emoji with a single consistent line-art face icon whose
   *  expression changes, used identically here and on Snapshot. */
  moodMouthPaths: string[] = [
    'M6 11.5 Q9 8.5 12 11.5',
    'M6.5 11.3 Q9 10.3 11.5 11.3',
    'M6.5 11 Q9 11.8 11.5 11',
    'M6 11 Q9 13.2 12 11',
    'M5.5 10.5 Q9 14.5 12.5 10.5',
  ];

  goToHealthTracker(): void {
    this.router.navigate(['/snapshot'], { state: { tab: 'health' } });
  }

  // ════════════════════════════════════════════════════════
  // DAILY CHECKLIST — stored per-user in Firestore
  // (users/{uid}/checklist/current), auto-resets daily, and drives each
  // activity's own reminders while it is unchecked (checklist-reminders).
  // Meals and rest are split into sub-items; a parent with sub-items is done
  // only when all of them are, and isn't ticked itself.
  // ════════════════════════════════════════════════════════
  checklist: ChecklistRow[] = [
    { id: 1, task: 'Take prenatal vitamins',   done: false, icon: '💊' },
    { id: 2, task: 'Drink 8 glasses of water', done: false, icon: '💧' },
    { id: 3, task: 'Light walk or stretching', done: false, icon: '🚶' },
    { id: 4, task: 'Eat a veggie-rich meal',   done: false, icon: '🥗', subs: [
      { id: 41, task: 'Breakfast', done: false },
      { id: 42, task: 'Lunch',     done: false },
      { id: 43, task: 'Dinner',    done: false },
    ] },
    { id: 5, task: 'Rest for 30 minutes',      done: false, icon: '😴', subs: [
      { id: 51, task: 'Morning rest',   done: false },
      { id: 52, task: 'Afternoon rest', done: false },
    ] },
  ];

  /** Ticking and saving wait for 'ready': today's saved state has loaded,
   *  or the server confirmed there is none. Until then the list above is
   *  only a placeholder and must never be written over the saved one. */
  checklistStatus: 'loading' | 'ready' | 'failed' = 'loading';
  /** Bumped by every load, so an older load that finishes late is ignored. */
  private checklistLoadId = 0;
  /** A tap while the last one is still saving is ignored (no double writes). */
  private checklistSaving = false;
  /** App 'resume' listener for catchUpChecklistBell, removed on destroy. */
  private resumeListener?: PluginListenerHandle;
  private destroyed = false;

  get checklistDone():    number { return this.checklist.filter(c => c.done).length; }
  get checklistPercent(): number { return Math.round((this.checklistDone / this.checklist.length) * 100); }

  /** Every row as saved: the items, their sub-items, parents computed. */
  private checklistEntries(): { id: number; done: boolean }[] {
    const entries: { id: number; done: boolean }[] = [];
    for (const c of this.checklist) {
      entries.push({ id: c.id, done: c.done });
      for (const s of c.subs ?? []) entries.push({ id: s.id, done: s.done });
    }
    return entries;
  }

  /** A parent with sub-items is done only when all of them are. */
  private updateChecklistParents(): void {
    for (const c of this.checklist) if (c.subs) c.done = c.subs.every(s => s.done);
  }

  /** Today's saved items onto the list. An older record with only a meal or
   *  rest parent marked done counts as all its sub-items done; the record
   *  itself is not rewritten. */
  private applySavedChecklist(items: any[]): void {
    const saved = (id: number) => items.some((s: any) => s.id === id && s.done === true);
    for (const c of this.checklist) {
      if (c.subs) for (const s of c.subs) s.done = saved(s.id) || saved(c.id);
      else c.done = saved(c.id);
    }
    this.updateChecklistParents();
  }

  private resetChecklist(): void {
    for (const c of this.checklist) {
      c.done = false;
      for (const s of c.subs ?? []) s.done = false;
    }
  }

  /** The reminder items still unchecked today (see checklist-reminder-plan). */
  private checklistReminderState(): ChecklistState {
    return { unchecked: uncheckedReminderItems(this.checklistEntries()) };
  }

  private getTodayDateString(): string {
    // Local date: the checklist resets at local midnight (scheduleMidnightReset).
    // toISOString() gave the UTC date, so in UTC+8 anything ticked before
    // 08:00 was saved under the previous day and wiped on the next load.
    return localDateKey();
  }

  private checklistDocRef() {
    return doc(this.firestore, `users/${this.currentUid}/checklist/current`);
  }

  /** Waits for the connection (readSettledDoc) instead of failing at once
   *  while Firestore counts itself offline after a cold start. If it still
   *  can't be read, nothing is written and the reminders are left alone;
   *  the card offers Retry. */
  private async loadChecklistFromFirestore(): Promise<void> {
    if (!this.currentUid) return;
    const loadId = ++this.checklistLoadId;
    const uid = this.currentUid;
    this.checklistStatus = 'loading';
    const today = this.getTodayDateString();
    let data: any = null;
    try {
      const snap = await runInInjectionContext(this.envInjector, () =>
        readSettledDoc(this.checklistDocRef(), CHECKLIST_LOAD_TIMEOUT_MS));
      data = snap.exists() ? snap.data() : null;
    } catch (err: any) {
      if (loadId !== this.checklistLoadId) return;
      console.error('Failed to load checklist:', err?.code ?? err);
      this.checklistStatus = 'failed';
      return;
    }
    // Signed out, switched account, or a newer load started meanwhile.
    if (loadId !== this.checklistLoadId || uid !== this.currentUid) return;

    if (data && data.date === today && Array.isArray(data.items)) {
      this.applySavedChecklist(data.items);
      this.checklistStatus = 'ready';
    } else {
      // Confirmed: no checklist yet, or it is from an earlier day.
      this.resetChecklist();
      this.checklistStatus = 'ready';
      await this.saveChecklistState();
    }
    this.updateChecklistReminders();
    void this.catchUpChecklistBell();
  }

  /** The phone's checklist reminders run no app code when they fire, so
   *  they never reach the bell. When Home loads (and when the app returns
   *  to the foreground), today's slots that have passed are added to the
   *  bell, once each (dueChecklistBellSlots + createIfMissing). Only from
   *  the loaded checklist and the saved switch; nothing on a failed read.
   *  Phone only: in a browser sendInAppChecklistReminder() covers it. */
  private async catchUpChecklistBell(): Promise<void> {
    if (this.checklistStatus !== 'ready' || !this.currentUid) return;
    const uid = this.currentUid;
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;
      const profile = await this.profileStore.whenLoaded();
      // Signed out, switched account or reloading meanwhile: skip.
      if (uid !== this.currentUid || this.checklistStatus !== 'ready') return;
      const slots = dueChecklistBellSlots(
        new Date(),
        this.checklistReminderState(),
        profile?.notificationPrefs?.checklistReminders !== false,
        // Nothing from before the account existed (a new account signing
        // up at night got every earlier slot of the day).
        parseStoredDate(profile?.createdAt),
      );
      for (const slot of slots) {
        await this.notificationsService.createIfMissing(uid, slot.id,
          { icon: '✅', title: slot.title, message: slot.body, route: '/home' }, slot.at);
      }
    } catch (err: any) {
      console.error('Checklist bell catch-up failed:', err?.code ?? err?.reason ?? err);
    }
  }

  retryChecklist(): void {
    // Reconnect now rather than after Firestore's growing wait between attempts.
    void runInInjectionContext(this.envInjector, () => reconnectNow(this.firestore));
    void this.loadChecklistFromFirestore();
  }

  private async saveChecklistState(): Promise<void> {
    if (!this.currentUid || this.checklistStatus !== 'ready') return;
    try {
      await runInInjectionContext(this.envInjector, () =>
        setDoc(this.checklistDocRef(), {
          date: this.getTodayDateString(),
          items: this.checklistEntries(),
          updatedAt: Timestamp.now(),
        })
      );
    } catch (err) {
      console.error('Failed to save checklist:', err);
    }
  }

  /** Ticks a row or a sub-item. A parent with sub-items is ticked through
   *  them, and each sub-item is independent of the others. */
  async toggleChecklist(item: { done: boolean; subs?: unknown[] }): Promise<void> {
    if (this.checklistStatus !== 'ready' || this.checklistSaving || item.subs) return;
    item.done = !item.done;
    this.updateChecklistParents();
    this.checklistSaving = true;
    try {
      await this.saveChecklistState();
    } finally {
      this.checklistSaving = false;
    }
    this.updateChecklistReminders();
  }

  /** On the phone: replaces the whole Daily Checklist reminder range from
   *  the current checklist (ChecklistRemindersService). Never asks for
   *  notification permission here; only saving Pregnancy Settings asks.
   *  In a browser: the existing once-a-day in-app notification. */
  private async updateChecklistReminders(): Promise<void> {
    // Only from the real checklist and saved switch; otherwise leave the
    // reminders already scheduled as they are.
    if (this.checklistStatus !== 'ready') return;
    const state = this.checklistReminderState();
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        if (!this.currentUid) return;
        const profile = await this.profileStore.whenLoaded();
        await this.checklistReminders.sync(
          state,
          { enabled: profile?.notificationPrefs?.checklistReminders !== false, requestPermission: false },
        );
        return;
      }
    } catch (err) {
      console.error('Failed to update checklist reminders:', err);
      return;
    }
    if (state.unchecked.length > 0) await this.sendInAppChecklistReminder();
  }

  /** Browser fallback: one in-app notification a day while items remain. */
  private async sendInAppChecklistReminder(): Promise<void> {
    if (!this.currentUid) return;
    const today   = this.getTodayDateString();
    const flagKey = `momscare_checklist_reminder_sent_${today}`;
    if (localStorage.getItem(flagKey)) return;

    try {
      await this.notificationsService.createNotification(this.currentUid, {
        icon: '✅',
        title: 'Daily Checklist Reminder',
        message: "You still have items to complete on today's checklist.",
        route: '/home',
      });
      localStorage.setItem(flagKey, '1');
    } catch (err) {
      console.error('Failed to send checklist reminder notification:', err);
    }
  }

  private scheduleMidnightReset(): void {
    const now       = new Date();
    const midnight  = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    this.midnightTimeout = setTimeout(() => {
      if (this.checklistStatus === 'ready') {
        this.resetChecklist();
        this.saveChecklistState();
        this.updateChecklistReminders();
      } else {
        // Never loaded: load now; a checklist from yesterday resets there.
        void this.loadChecklistFromFirestore();
      }
      this.scheduleMidnightReset();
    }, msUntilMidnight);
  }

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

  get greetingName(): string {
    const first = this.currentUser.fullName?.trim().split(/\s+/)[0];
    return first || 'Mama';
  }

  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private theme: ThemeService,
    private authService: AuthService,
    private profileStore: ProfileStoreService,
    private notificationsService: NotificationsService,
    private appointmentsService: AppointmentsService,
    private healthService: HealthService,
    private firestore: Firestore,
    private checklistReminders: ChecklistRemindersService,
  ) {}

  /** Applies the live profile (ProfileStoreService): runs on first load and
   *  again whenever users/{uid} changes, e.g. after the due date is edited
   *  in Pregnancy Settings while this page stays alive in the background. */
  private applyProfile(profile: UserProfile | null): void {
    this.isLoadingUser = false;
    this.weightUnit = weightUnitOf(profile?.weightUnit);
    if (!profile) return;
    this.currentUser = {
      fullName:     profile.fullName || '',
      email:        profile.email    || '',
      dueDate:      parseStoredDate(profile.dueDate) ?? new Date(),
      firstTimeMom: profile.firstTimeMom ?? null,
    };
    this.recomputePregnancyFromDueDate();
    this.updateCountdown();
  }

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));

    this.userSub = this.authService.user$.subscribe(fbUser => {
      this.currentUid = fbUser?.uid ?? null;
      if (fbUser) {
        this.loadChecklistFromFirestore();
      } else {
        // Signed out: drop any load still running for the previous account.
        this.checklistLoadId++;
        this.checklistStatus = 'loading';
      }
    });

    this.profileSub = this.profileStore.profile$.subscribe(profile => this.applyProfile(profile));

    this.notifSub = this.notificationsService.notifications$()
      .subscribe((list: AppNotification[]) => (this.notifications = list));

    // Back in the foreground: add any checklist reminder slots that passed
    // meanwhile to the bell (the gates are inside catchUpChecklistBell).
    void import('@capacitor/app')
      .then(({ App }) => App.addListener('resume', () => void this.catchUpChecklistBell()))
      .then(handle => {
        if (this.destroyed) void handle.remove();
        else this.resumeListener = handle;
      })
      .catch(err => console.error('Resume listener failed:', err));

    this.apptSub = this.appointmentsService.getAppointments$()
      .subscribe((records: AppointmentRecord[]) => (this.allAppointments = records));

    this.healthSub = this.healthService.getCurrentHealth$().subscribe(data => {
      if (data) {
        this.health = {
          weight: data.weight ?? 0,
          bpSys:  data.bpSys  ?? 0,
          bpDia:  data.bpDia  ?? 0,
          kicks:  data.kicks  ?? 0,
          mood:   data.mood   ?? 2,
        };
      }
    });

    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });

    this.clockInterval = setInterval(() => {
      this.currentTime = new Date();
    }, 60000);

    this.updateCountdown();
    this.countdownInterval = setInterval(() => {
      this.updateCountdown();
      this.recomputePregnancyFromDueDate();
    }, 60000);

    this.scheduleMidnightReset();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    void this.resumeListener?.remove();
    this.themeSub?.unsubscribe();
    this.userSub?.unsubscribe();
    this.profileSub?.unsubscribe();
    this.notifSub?.unsubscribe();
    this.apptSub?.unsubscribe();
    this.healthSub?.unsubscribe();
    if (this.clockInterval)     clearInterval(this.clockInterval);
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    if (this.midnightTimeout)   clearTimeout(this.midnightTimeout);
  }
}