// insights.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ThemeService } from '../../services/theme';
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
  pregnancyWeek = 20;

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

  weeklyTips = [
    'Eat iron-rich foods with vitamin C to boost absorption',
    '30 min of gentle walking daily benefits both of you',
    'Aim for 8–10 glasses of water to support amniotic fluid',
    'Diaphragmatic breathing reduces cortisol in minutes',
  ];

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

  todayInsights = [
    { text: 'Your blood volume has increased by nearly 50% during pregnancy — this is why your heart works harder and you may feel warmer than usual.', source: 'MomsCare Health · Body Changes' },
    { text: 'Relaxin, the hormone that loosens your ligaments for birth, also affects other joints — which is why your hips, knees, and ankles may feel different.', source: 'MomsCare Health · Hormones' },
    { text: 'Your sense of smell sharpens significantly in pregnancy — a protective mechanism that may help you avoid foods potentially harmful to your baby.', source: 'MomsCare Health · Senses' },
    { text: 'Babies in the womb can taste the flavors of the foods you eat through the amniotic fluid — a great time to introduce a variety of healthy foods.', source: 'MomsCare Health · Baby Development' },
    { text: 'Pregnancy brain is real — hormonal changes temporarily affect memory and concentration. Rest, hydration, and gentle exercise all help.', source: 'MomsCare Health · Mind & Body' },
  ];

  get todayInsight() {
    return this.todayInsights[new Date().getDate() % this.todayInsights.length];
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  constructor(
    private router: Router,
    private theme: ThemeService,
    private insightsService: InsightsService,
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));

    this.articlesSub = this.insightsService.getArticles$().subscribe(data => {
      this.articles = data;
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