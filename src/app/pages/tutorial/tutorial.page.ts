// tutorial.page.ts
import { Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChildren } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, Platform } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { ThemeService } from '../../services/theme';
import { AuthService } from '../../services/auth.service';
import { ProfileStoreService } from '../../services/profile-store.service';
import { FirstRunTutorialService } from '../../services/first-run-tutorial.service';
import { SAVE_SUCCESS_MESSAGE, SaveFeedbackService } from '../../services/save-feedback.service';

/** Longest "Get started" waits for the save before offering a retry. */
const FINISH_TIMEOUT_MS = 10000;
/** Horizontal distance (px) that counts as a swipe. */
const SWIPE_MIN_PX = 50;

type CardIcon = 'welcome' | 'home' | 'snapshot' | 'appointments' | 'insights' | 'profile';

interface TutorialCard {
  icon: CardIcon;
  title: string;
  lines: string[];
  /** Shown in its own box under the text (the safety note). */
  note?: string;
}

/**
 * First-run tutorial: six cards about the app, shown once after
 * registering on this phone (see FirstRunTutorialService), and again from
 * Profile ("How to use MomCare", ?mode=replay).
 *
 * First run: no Skip, it can only be finished from the last card, and
 * "Get started" saves ONLY { tutorialSeen: true }; if that fails or takes
 * too long the patient stays on the last card with a retry message.
 * Replay: a Close button, and nothing is saved.
 */
@Component({
  selector: 'app-tutorial',
  templateUrl: './tutorial.page.html',
  styleUrls: ['./tutorial.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class TutorialPage implements OnInit, OnDestroy {
  @ViewChildren('cardTitle') cardTitles!: QueryList<ElementRef<HTMLElement>>;

  // Every claim here was checked against the app's pages; keep it that way.
  readonly cards: TutorialCard[] = [
    {
      icon: 'welcome',
      title: 'Welcome to MomCare',
      lines: [
        "We're so glad you're here, Mommy. MomCare keeps your pregnancy journey in one place.",
        'Use the bar at the bottom to move between Home, Insights, Snapshot, Appointments and Profile.',
      ],
    },
    {
      icon: 'home',
      title: 'Home',
      lines: [
        "See which week you're in and how your baby is growing, week by week.",
        'Tick off your Daily Checklist, and tap the bell to see your notifications.',
      ],
    },
    {
      icon: 'snapshot',
      title: 'Snapshot',
      lines: [
        'Save photos of your journey and keep track of your blood pressure, weight, baby kicks and mood in the Health Tracker.',
        'Your care team can leave comments on your photos for you to read.',
      ],
    },
    {
      icon: 'appointments',
      title: 'Appointments',
      lines: [
        'See the visits your clinic has scheduled for you.',
        "If you can't make one, you can request a cancellation. MomCare can also remind you the day before and 2 hours before.",
      ],
    },
    {
      icon: 'insights',
      title: 'Insights',
      lines: [
        'Read articles and tips picked for your week of pregnancy.',
      ],
    },
    {
      icon: 'profile',
      title: 'Profile and settings',
      lines: [
        'In Pregnancy Settings you can update your dates, choose kg or lbs, and switch reminders and notifications on or off.',
      ],
      note: "MomCare supports your care but doesn't replace your clinic. If something feels urgent, contact your clinic or emergency services right away.",
    },
  ];

  index = 0;
  replay = false;
  darkMode = false;
  saving = false;
  retryMessage = '';

  private finished = false;
  private touchStart: { x: number; y: number } | null = null;
  private subs: Subscription[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private platform: Platform,
    private theme: ThemeService,
    private authService: AuthService,
    private profileStore: ProfileStoreService,
    private tutorial: FirstRunTutorialService,
    private feedback: SaveFeedbackService,
  ) {}

  get isLast(): boolean {
    return this.index === this.cards.length - 1;
  }

  ngOnInit(): void {
    this.replay = this.route.snapshot.queryParamMap.get('mode') === 'replay';
    this.subs.push(this.theme.isDark$.subscribe(val => (this.darkMode = val)));

    // Android back: the previous card. On the first card it closes a
    // replay, and does nothing on the first run (no way around it).
    this.subs.push(this.platform.backButton.subscribeWithPriority(101, () => {
      if (this.index > 0) this.back();
      else if (this.replay) this.close();
    }));

    if (!this.replay) void this.skipIfAlreadySeen();
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  next(): void {
    if (this.isLast) return;
    this.goTo(this.index + 1);
  }

  back(): void {
    if (this.index === 0) return;
    this.goTo(this.index - 1);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') { event.preventDefault(); this.next(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); this.back(); }
  }

  onTouchStart(event: TouchEvent): void {
    const t = event.touches[0];
    this.touchStart = t ? { x: t.clientX, y: t.clientY } : null;
  }

  /** A swipe moves one card; it never finishes the tutorial. */
  onTouchEnd(event: TouchEvent): void {
    const start = this.touchStart;
    this.touchStart = null;
    const t = event.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) this.next(); else this.back();
  }

  /** Replay only: back to where it was opened from. Saves nothing. */
  close(): void {
    this.location.back();
  }

  /** Last card, first run: saves { tutorialSeen: true } and goes Home. A
   *  failed or slow save keeps her here with a retry message; nothing
   *  retries on its own. */
  async getStarted(): Promise<void> {
    if (this.replay || !this.isLast || this.saving) return;
    this.saving = true;
    this.retryMessage = '';
    try {
      // updateProfile does nothing when signed out; that isn't a save.
      if (!this.authService.currentUid) throw new Error('not signed in');
      await this.withTimeout(this.authService.updateProfile({ tutorialSeen: true }));
      this.finished = true;
      this.tutorial.clear();
      void this.feedback.show(SAVE_SUCCESS_MESSAGE, 'success');
      await this.router.navigate(['/home'], { replaceUrl: true });
    } catch (err) {
      console.error('[tutorial] could not save tutorialSeen:', err);
      this.retryMessage = "We couldn't save that just now. Please check your connection and tap Get started again.";
    } finally {
      this.saving = false;
    }
  }

  // -- internals --------------------------------------------------------

  private goTo(index: number): void {
    this.index = index;
    this.retryMessage = '';
    // Move focus to the new card's title so screen readers and keyboard
    // users follow along (after the view has updated). preventScroll:
    // without it the browser also scrolls the carousel to the title,
    // which adds to the slide and shows the card after the right one.
    setTimeout(() => this.cardTitles?.get(this.index)?.nativeElement.focus({ preventScroll: true }), 0);
  }

  /** Finished already (e.g. on another phone, before a reinstall): only
   *  once the profile has really loaded and says so. A failed or
   *  still-loading read changes nothing. */
  private async skipIfAlreadySeen(): Promise<void> {
    try {
      const profile = await this.profileStore.whenLoaded();
      if (profile?.tutorialSeen === true && !this.saving && !this.finished) {
        this.tutorial.clear();
        await this.router.navigate(['/home'], { replaceUrl: true });
      }
    } catch {
      // Not known: stay on the tutorial.
    }
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), FINISH_TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
}
