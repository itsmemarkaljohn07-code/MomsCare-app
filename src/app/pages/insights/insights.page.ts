// insights.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ThemeService } from '../../services/theme';
import { AuthService } from '../../services/auth.service';
import { InsightsService } from '../../services/insights.service';
import { Subscription } from 'rxjs';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ArticleItem {
  label: string;
  desc: string;
  iconBg: string;
  svgKey: string;
}

export interface ArticlePanel {
  tag: string;
  title: string;
  intro: string;
  highlight: { label: string; text: string };
  items: ArticleItem[];
  tip: { text: string; source: string };
}

export interface ArticleDefinition {
  title: string;
  readTime: number;
  heroTag: string;
  heroImage: string | null;
  heroBg: string;
  accentColor: string;
  accentBg: string;
  highlightBg: string;
  highlightBorder: string;
  tipBg: string;
  tipBorder: string;
  tabs: { id: number; label: string }[];
  panels: Record<number, ArticlePanel>;
  youTubeUrl: string;
  citation: { source: string; author: string; year: string; url: string };
  // Added when this data moved to Firestore — used to derive the
  // section card grids below without a second hardcoded data source.
  excerpt?: string;
  sections?: string[];
  order?: number;
}

export interface ArticleCard {
  title: string;
  tag: string;
  readTime: number;
  bgColor: string;
  image?: string | null;
  excerpt?: string;
  articleKey: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

@Component({
  selector: 'app-insights',
  templateUrl: './insights.page.html',
  styleUrls: ['./insights.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class InsightsPage implements OnInit, OnDestroy {

  animReady     = false;
  darkMode      = false;
  private themeSub!: Subscription;
  private articlesSub!: Subscription;
  // The patient's due date, fetched once in ngOnInit. pregnancyWeek
  // below is computed FROM this on every read, using the exact same
  // 280-day formula as snapshot.page.ts's pregnancyWeek getter and the
  // admin dashboard's computePregnancyWeek — one shared calculation,
  // not a second one that could drift out of sync.
  private currentDueDate: string | null = null;

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

  // ── Bottom nav active state ──────────────────────────────────────────────
  activeTab = 'insights';

  // ── Article reader state ──────────────────────────────────────────────────
  articleOpen    = false;
  articleAnimIn  = false;
  currentArticle: string | null = null;
  activeTabId    = 1;

  // ── "Specialized for this week" auto-sliding carousel ──
  get weekHighlights() {
    const keys = ['body', 'checkups', 'senses', 'movement', 'braxton'].filter(k => this.articles[k]);
    return keys.slice(0, 5).map(key => ({
      key,
      tag: 'This Week',
      title: this.articles[key].title,
      excerpt: `Week ${this.pregnancyWeek} · ${this.articles[key].heroTag}`,
      image: this.articles[key].heroImage,
    }));
  }

  currentSlide = 0;
  private carouselTimer: any;

  private startCarousel(): void {
    clearInterval(this.carouselTimer);
    this.carouselTimer = setInterval(() => {
      const total = this.weekHighlights.length;
      if (total === 0) return;
      this.currentSlide = (this.currentSlide + 1) % total;
    }, 5000);
  }

  goToSlide(i: number): void {
    this.currentSlide = i;
    this.startCarousel();
  }

  get activeArticleData(): ArticleDefinition | null {
    return this.currentArticle ? (this.articles[this.currentArticle] ?? null) : null;
  }

  get activePanelData(): ArticlePanel | null {
    return this.activeArticleData?.panels[this.activeTabId] ?? null;
  }

  openArticle(key: string): void {
    if (!this.articles[key]) return;
    this.currentArticle = key;
    this.activeTabId    = 1;
    this.articleOpen    = true;
    requestAnimationFrame(() => setTimeout(() => (this.articleAnimIn = true), 20));
  }

  closeArticle(): void {
    this.articleAnimIn = false;
    setTimeout(() => { this.articleOpen = false; this.currentArticle = null; }, 380);
  }

  setTab(id: number): void { this.activeTabId = id; }

  // ══════════════════════════════════════════════════════════════════════════
  // ARTICLE LIBRARY — loaded live from Firestore (users/{uid}-independent,
  // shared `insights` collection). Starts empty and populates once the
  // subscription in ngOnInit resolves; every getter below already reads
  // from `this.articles` reactively, so nothing else needs a loading guard.
  // ══════════════════════════════════════════════════════════════════════════
  articles: Record<string, ArticleDefinition> = {};

  // ── Section card grids — derived from `articles`' `sections`/`order`/
  // `excerpt` fields instead of separately hardcoded arrays, so editing
  // an article in one place (the admin dashboard) can never leave these
  // lists out of sync with the full article content. ──
  private cardsForSection(section: string): ArticleCard[] {
    return Object.entries(this.articles)
      .filter(([, a]) => a.sections?.includes(section))
      .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
      .map(([key, a]) => ({
        title: a.title,
        tag: a.heroTag,
        readTime: a.readTime,
        bgColor: a.heroBg,
        image: a.heroImage,
        excerpt: a.excerpt ?? '',
        articleKey: key,
      }));
  }

  get popularArticles():   ArticleCard[] { return this.cardsForSection('popular'); }
  get bodyArticles():      ArticleCard[] { return this.cardsForSection('body'); }
  get babyArticles():      ArticleCard[] { return this.cardsForSection('baby'); }
  get nutritionArticles(): ArticleCard[] { return this.cardsForSection('nutrition'); }
  get mindArticles():      ArticleCard[] { return this.cardsForSection('mind'); }
  get birthArticles():     ArticleCard[] { return this.cardsForSection('birth'); }

  // Checkpoints at the same weeks as babySizes below, for a consistent
  // pattern across the file. General educational information only —
  // not medical advice, and phrased to defer to a provider on anything
  // symptom- or decision-related rather than instructing directly.
  weeklyTipsByWeek: Record<number, string[]> = {
    4:  ['Ask your provider about starting a prenatal vitamin with folic acid', 'Small, frequent meals can help if nausea begins', 'A good time to schedule your first prenatal appointment'],
    8:  ['Rest when your body asks for it — fatigue is common this trimester', 'Ask your provider about any foods or drinks worth limiting for now', "Baby's major organs are forming, which is why early care matters"],
    10: ['Nausea often peaks around now for many and tends to ease with time', 'Gentle walks can help with energy, if your provider has cleared activity', 'Ask your clinic what to expect from your first ultrasound'],
    12: ['Many people feel less nauseous as the first trimester wraps up', 'A small bump may start to show as your uterus grows', 'First-trimester screening is often discussed around now'],
    14: ['Energy often improves in the second trimester', 'Stay hydrated — your needs increase as blood volume grows', 'Baby can now make facial expressions, even before you feel movement'],
    16: ['Some feel early flutters of movement now, though it varies widely', 'Side-sleeping, especially on the left, is commonly recommended', 'A good time to check with your clinic about scheduling the anatomy scan'],
    18: ["Movement may feel more noticeable — it's different for everyone", 'Quick stretches can ease round-ligament pain on your sides', "The anatomy scan often happens around this stage"],
    20: ["You're at the halfway point — a good time for a mid-pregnancy check-up", 'Gentle stretching and hydration may help with leg cramps', "Baby can now hear sounds from outside the womb"],
    22: ['Supportive shoes can help as your center of gravity shifts', "Baby's movements may feel stronger and more regular now", 'Keep up a balanced diet rich in iron and calcium'],
    24: ['Ask your provider about timing for the glucose screening test', 'Mild, irregular tightening (Braxton Hicks) can start — mention it at your next visit', "Baby's hearing is more developed; some enjoy talking or playing music for them"],
    26: ['Elevating your legs can help with swelling in your feet and ankles', 'A good time to look into childbirth classes if you\'re interested', "Stay mindful of your baby's regular movement pattern"],
    28: ['Welcome to the third trimester — appointments often become more frequent', 'Pacing yourself can help as shortness of breath increases', 'A common time to start discussing birth plan preferences'],
    30: ['Rest when you can — fatigue often returns in the third trimester', "Mention any noticeable change in baby's movements to your provider", 'Consider starting to pack your hospital bag over the coming weeks'],
    32: ['Contact your provider if contractions become regular or painful', 'Sleeping slightly propped up may ease common heartburn', 'Baby is practicing breathing movements ahead of birth'],
    34: ["Your provider will start checking baby's position at appointments", 'Side-rest and hydration continue to help with swelling', 'A good time to finalize your hospital bag and birth plan details'],
    36: ['Weekly appointments often begin around now for closer monitoring', 'Contact your provider promptly for reduced movement, unusual swelling, or severe headaches', 'Baby is considered early term soon, with most development complete'],
    38: ['Ask your provider what early labor signs to watch for', 'Rest as much as you can — labor can begin any time from here', "Keep your provider's contact info and hospital route easy to find"],
    40: ["You've reached your due date — many pregnancies go a little earlier or later", "Your provider will discuss next steps if labor hasn't started yet", "Don't hesitate to reach out to your care team with any concerns"],
  };

  /** Picks the tip set for the closest checkpoint at or before the
   *  current pregnancyWeek — same "closest match" pattern babySize
   *  below already uses, so the two stay visually/behaviorally
   *  consistent with each other. */
  get weeklyTips(): string[] {
    const keys = Object.keys(this.weeklyTipsByWeek).map(Number).sort((a, b) => a - b);
    let closest = keys[0];
    for (const w of keys) { if (this.pregnancyWeek >= w) closest = w; }
    return this.weeklyTipsByWeek[closest];
  }

  babySizes: Record<number, { fruit: string }> = {
    4: { fruit: 'poppy seed' }, 8: { fruit: 'raspberry' }, 10: { fruit: 'strawberry' },
    12: { fruit: 'lime' }, 14: { fruit: 'peach' }, 16: { fruit: 'avocado' },
    18: { fruit: 'sweet potato' }, 20: { fruit: 'mango' }, 22: { fruit: 'corn' },
    24: { fruit: 'corn' }, 26: { fruit: 'lettuce head' }, 28: { fruit: 'eggplant' },
    30: { fruit: 'broccoli' }, 32: { fruit: 'coconut' }, 34: { fruit: 'pineapple' },
    36: { fruit: 'romaine lettuce' }, 38: { fruit: 'small pumpkin' }, 40: { fruit: 'watermelon' },
  };

  get babySize() {
    const keys = Object.keys(this.babySizes).map(Number).sort((a, b) => a - b);
    let c = keys[0];
    for (const w of keys) { if (this.pregnancyWeek >= w) c = w; }
    return this.babySizes[c];
  }

  get trimester(): string {
    if (this.pregnancyWeek <= 13) return '1st Trimester';
    if (this.pregnancyWeek <= 26) return '2nd Trimester';
    return '3rd Trimester';
  }

  // Up to 5 general, stage-independent insights (distinct from the
  // week-specific Quick Tips below), spread across the categories a
  // mother actually benefits from during pregnancy rather than
  // clustering on one theme. General educational information only —
  // not a substitute for a healthcare provider's guidance.
  todayInsights = [
    { text: "Your baby's fingerprints are fully formed by around week 17 — completely unique, just like yours.", source: 'MomCare Health · Baby Development' },
    { text: 'Foods rich in folate, iron, and calcium support both your health and your growing baby throughout pregnancy.', source: 'MomCare Health · Nutrition' },
    { text: "Gentle activities like walking, swimming, and prenatal yoga are generally considered safe for most pregnancies — ask your provider what's right for you.", source: 'MomCare Health · Safe Activity' },
    { text: 'Increased blood volume during pregnancy is why your heart works harder and you may feel warmer than usual.', source: 'MomCare Health · Body Changes' },
    { text: "It's completely normal for your emotions to shift throughout pregnancy — rest, hydration, and talking to someone you trust can help on harder days.", source: 'MomCare Health · Mind & Body' },
  ];

  // ── "Today's Insight" manual swipe slider ──────────────────────────
  // Deliberately separate from the hero-carousel's auto-playing state
  // above (startCarousel/currentSlide) — this one never advances on
  // its own; it only moves when the user swipes or taps a dot.
  // Starting on the day-of-month pick preserves a bit of the old
  // "changes daily" feel as a starting point, while still being fully
  // manually browsable from there.
  insightSlideIndex = new Date().getDate() % this.todayInsights.length;
  insightIsDragging = false;
  private insightDragStartX = 0;
  insightDragDeltaX = 0;

  private clampInsightIndex(i: number): number {
    const max = this.todayInsights.length - 1;
    return Math.max(0, Math.min(max, i));
  }

  goToInsightSlide(i: number): void {
    this.insightSlideIndex = this.clampInsightIndex(i);
  }

  onInsightPointerDown(event: PointerEvent): void {
    this.insightIsDragging = true;
    this.insightDragStartX = event.clientX;
    this.insightDragDeltaX = 0;
  }

  onInsightPointerMove(event: PointerEvent): void {
    if (!this.insightIsDragging) return;
    this.insightDragDeltaX = event.clientX - this.insightDragStartX;
  }

  onInsightPointerUp(): void {
    if (!this.insightIsDragging) return;
    // Must move a deliberate distance to count as a swipe, so an
    // accidental tap-and-twitch doesn't change the slide.
    const SWIPE_THRESHOLD = 45;
    if (this.insightDragDeltaX > SWIPE_THRESHOLD) {
      this.goToInsightSlide(this.insightSlideIndex - 1);
    } else if (this.insightDragDeltaX < -SWIPE_THRESHOLD) {
      this.goToInsightSlide(this.insightSlideIndex + 1);
    }
    this.insightIsDragging = false;
    this.insightDragDeltaX = 0;
  }

  /** The live track position: a percentage base for which slide is
   *  "home", plus the raw pixel drag offset layered on top so the
   *  track visually follows the finger/cursor while dragging, then
   *  snaps cleanly to the nearest slide on release. */
  get insightTrackTransform(): string {
    const base = -(this.insightSlideIndex * 100);
    const dragPx = this.insightIsDragging ? this.insightDragDeltaX : 0;
    return `translateX(calc(${base}% + ${dragPx}px))`;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  constructor(
    private router: Router,
    private theme: ThemeService,
    private authService: AuthService,
    private insightsService: InsightsService,
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));

    this.articlesSub = this.insightsService.getArticles$().subscribe(data => {
      this.articles = data;
    });

    this.authService.getProfile().then(profile => {
      this.currentDueDate = profile?.dueDate ?? null;
    });

    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
    this.startCarousel();
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
    this.articlesSub?.unsubscribe();
    clearInterval(this.carouselTimer);
  }

  navigate(route: string): void { this.router.navigate([route]); }

  openUrl(url: string): void {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }
}