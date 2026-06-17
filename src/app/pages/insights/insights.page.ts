// insights.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-insights',
  templateUrl: './insights.page.html',
  styleUrls: ['./insights.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class InsightsPage implements OnInit, OnDestroy {

  animReady = false;
  darkMode = false;
  private themeSub!: Subscription;

  pregnancyWeek = 20;

  // ── Article reader state ──
  articleOpen = false;
  articleAnimIn = false;
  currentArticle: 'body' | 'checkups' | null = null;
  activeWeekTab = 1;
  activeCheckupTab = 1;

  // ── "Your changing body" tabs ──
  articleWeekTabs = [
    { id: 1, label: 'Weeks 1–13', trimester: '1st Trimester' },
    { id: 2, label: 'Weeks 14–26', trimester: '2nd Trimester' },
    { id: 3, label: 'Weeks 27–42', trimester: '3rd Trimester' },
  ];

  articlePanels: Record<number, {
    tag: string;
    title: string;
    intro: string;
    highlight: { label: string; text: string };
    changes: { icon: string; iconBg: string; label: string; desc: string }[];
    tip: { text: string; source: string };
  }> = {
    1: {
      tag: '1st Trimester',
      title: 'The first wave of changes',
      intro: 'Your body begins transforming almost immediately after conception — often before you even know you\'re pregnant. Hormones surge, organs shift priorities, and nearly every system adjusts to support new life.',
      highlight: {
        label: 'Did you know?',
        text: 'Your blood volume starts increasing as early as week 6 and will grow by up to 50% by the third trimester.'
      },
      changes: [
        { icon: '🫀', iconBg: 'rgba(224,126,184,0.12)', label: 'Heart & circulation', desc: 'Your heart pumps harder to support growing blood volume. You may feel warmer and notice flushing more easily.' },
        { icon: '🤢', iconBg: 'rgba(181,127,212,0.12)', label: 'Nausea & digestion', desc: 'Rising hCG and estrogen slow digestion. Morning sickness can strike at any time of day and peaks around weeks 8–10.' },
        { icon: '😴', iconBg: 'rgba(185,225,240,0.35)', label: 'Fatigue', desc: 'Progesterone causes deep tiredness. Your body is building the placenta — one of the most energy-intensive tasks it will ever do.' },
        { icon: '🧠', iconBg: 'rgba(220,195,255,0.25)', label: 'Brain & mood', desc: 'Hormonal shifts can cause heightened emotions, vivid dreams, and temporary memory lapses — all completely normal.' },
      ],
      tip: {
        text: 'Small, frequent meals help with nausea. Ginger tea and cold foods are often better tolerated in the first trimester.',
        source: 'DailyMom Health · Nutrition'
      }
    },
    2: {
      tag: '2nd Trimester',
      title: 'The golden stretch',
      intro: 'For many, the second trimester brings welcome relief. Nausea often fades, energy returns, and your bump becomes beautifully visible. But new changes are quietly underway.',
      highlight: {
        label: 'Milestone',
        text: 'Around week 16–22 you\'ll likely feel baby\'s first movements — a flutter, a roll, or a gentle kick.'
      },
      changes: [
        { icon: '🌸', iconBg: 'rgba(224,126,184,0.12)', label: 'Skin & hair', desc: 'Increased blood flow gives many women a "pregnancy glow." Linea nigra may appear. Hair often grows thicker.' },
        { icon: '🦴', iconBg: 'rgba(181,127,212,0.12)', label: 'Joints & ligaments', desc: 'Relaxin loosens your pelvis for birth but also affects knees, hips, and ankles. You may notice subtle instability or aching.' },
        { icon: '👃', iconBg: 'rgba(185,225,240,0.35)', label: 'Heightened senses', desc: 'Your sense of smell sharpens significantly — an evolutionary mechanism to help avoid foods that may be harmful.' },
        { icon: '💤', iconBg: 'rgba(220,195,255,0.25)', label: 'Sleep shifts', desc: 'Finding a comfortable position becomes harder. Sleeping on your left side improves blood flow to baby and kidneys.' },
      ],
      tip: {
        text: 'A pregnancy pillow supporting your bump and back can dramatically improve sleep quality from mid-pregnancy onward.',
        source: 'DailyMom Health · Wellness'
      }
    },
    3: {
      tag: '3rd Trimester',
      title: 'The final stretch',
      intro: 'Your body is preparing in earnest now. Baby grows rapidly — gaining about 200g per week — and your organs accommodate by moving and compressing. Discomfort is common, but so is deep wonder.',
      highlight: {
        label: 'What\'s happening',
        text: 'Braxton Hicks contractions ramp up — practice runs for real labor. They\'re irregular and ease with rest or hydration.'
      },
      changes: [
        { icon: '🫁', iconBg: 'rgba(224,126,184,0.12)', label: 'Breathlessness', desc: 'Baby pressing against your diaphragm reduces lung capacity. Shortness of breath on exertion is common and normal.' },
        { icon: '🦶', iconBg: 'rgba(181,127,212,0.12)', label: 'Swelling', desc: 'Fluid retention in ankles, feet, and hands is very common. Elevating your feet and staying hydrated helps significantly.' },
        { icon: '⚡', iconBg: 'rgba(185,225,240,0.35)', label: 'Pelvic pressure', desc: 'As baby "drops" and engages in the pelvis, pressure below increases while breathing may momentarily ease.' },
        { icon: '🌙', iconBg: 'rgba(220,195,255,0.25)', label: 'Colostrum', desc: 'Your breasts begin producing colostrum — the first nutrient-rich milk — often from around week 28 onwards.' },
      ],
      tip: {
        text: 'Gentle movement like walking and swimming relieves third-trimester discomfort and helps baby get into position for birth.',
        source: 'DailyMom Health · Movement'
      }
    }
  };

  get activePanel() {
    return this.articlePanels[this.activeWeekTab];
  }

  // ── "Checkups" tabs ──
  checkupTabs = [
    { id: 1, label: '1st Trimester' },
    { id: 2, label: '2nd Trimester' },
    { id: 3, label: '3rd Trimester' },
  ];

  checkupPanels: Record<number, {
    tag: string;
    title: string;
    intro: string;
    highlight: { label: string; text: string };
    items: { icon: string; iconBg: string; label: string; desc: string }[];
    tip: { text: string; source: string };
  }> = {
    1: {
      tag: 'Weeks 4–13',
      title: 'Your first appointments',
      intro: 'The first trimester is packed with important appointments. These early visits confirm your pregnancy, establish your due date, and screen for potential concerns while there\'s the most time to act.',
      highlight: {
        label: 'Book early',
        text: 'Your first booking appointment ideally happens between weeks 8–10. Call your midwife or GP as soon as you get a positive test.'
      },
      items: [
        { icon: '📋', iconBg: 'rgba(185,225,240,0.35)', label: 'Booking appointment (wk 8–10)', desc: 'A long first visit covering your medical history, lifestyle, mental health, and blood pressure. Blood and urine samples are taken.' },
        { icon: '🩸', iconBg: 'rgba(224,126,184,0.12)', label: 'Blood tests', desc: 'Screens for blood type, anaemia, rubella immunity, STIs, and sickle cell disease. Results usually come back within a week.' },
        { icon: '🔬', iconBg: 'rgba(220,195,255,0.25)', label: 'Nuchal scan (wk 11–13)', desc: 'An ultrasound that measures the fluid at the back of baby\'s neck, combined with blood markers, to assess chromosomal risk.' },
        { icon: '💊', iconBg: 'rgba(181,127,212,0.12)', label: 'Supplements check', desc: 'Your midwife will confirm you\'re taking folic acid (400mcg) and discuss vitamin D, iron, and any prescription needs.' },
      ],
      tip: {
        text: 'Write down any symptoms, concerns, or questions before each appointment — it\'s easy to forget in the moment.',
        source: 'DailyMom Health · Medical'
      }
    },
    2: {
      tag: 'Weeks 14–27',
      title: 'Monitoring your progress',
      intro: 'The second trimester brings the most-anticipated scan of pregnancy. Appointments space out a little, but each one checks that both you and baby are growing well and on track.',
      highlight: {
        label: 'The big scan',
        text: 'The anomaly scan at 18–21 weeks checks baby\'s organs, spine, limbs, and placenta position in detail.'
      },
      items: [
        { icon: '🔊', iconBg: 'rgba(185,225,240,0.35)', label: 'Anomaly scan (wk 18–21)', desc: 'A detailed ultrasound checking baby\'s structure and development. You may find out the sex here if you wish.' },
        { icon: '📏', iconBg: 'rgba(224,126,184,0.12)', label: 'Fundal height checks', desc: 'From around week 24, your midwife measures the distance from your pubic bone to the top of your uterus to track baby\'s growth.' },
        { icon: '🩺', iconBg: 'rgba(220,195,255,0.25)', label: 'Blood pressure & urine', desc: 'Checked at every visit to watch for signs of pre-eclampsia — a serious condition that can develop from mid-pregnancy onward.' },
        { icon: '💉', iconBg: 'rgba(181,127,212,0.12)', label: 'Glucose tolerance test', desc: 'Offered around week 24–28 if you\'re at risk of gestational diabetes. Involves a fasting blood draw and a sugary drink.' },
      ],
      tip: {
        text: 'Bring your partner or a support person to the anomaly scan — it\'s one of the most emotional appointments of pregnancy.',
        source: 'DailyMom Health · Medical'
      }
    },
    3: {
      tag: 'Weeks 28–42',
      title: 'The final countdown',
      intro: 'Third-trimester appointments become more frequent as your due date approaches. Your care team will be watching baby\'s position, your blood pressure, and signs that labour may be near.',
      highlight: {
        label: 'Frequency increases',
        text: 'From week 36, most women see their midwife every one to two weeks until birth.'
      },
      items: [
        { icon: '🔄', iconBg: 'rgba(185,225,240,0.35)', label: 'Baby\'s position check', desc: 'From week 36, your midwife checks baby\'s position manually. If baby is breech, options like ECV or planned caesarean are discussed.' },
        { icon: '❤️', iconBg: 'rgba(224,126,184,0.12)', label: 'Fetal heartbeat monitoring', desc: 'A handheld Doppler is used at each visit to confirm baby\'s heart rate. Reduced movements should always be reported promptly.' },
        { icon: '📊', iconBg: 'rgba(220,195,255,0.25)', label: 'Group B Strep test', desc: 'An optional swab test offered around week 35–37 to check for GBS bacteria, which can affect newborns during delivery.' },
        { icon: '🗓️', iconBg: 'rgba(181,127,212,0.12)', label: 'Post-dates planning', desc: 'If you reach week 41, your midwife will discuss membrane sweeps and induction options to avoid going significantly overdue.' },
      ],
      tip: {
        text: 'Pack your hospital bag by week 36. Keep your birth plan, maternity notes, and insurance details together and easy to grab.',
        source: 'DailyMom Health · Planning'
      }
    }
  };

  get activeCheckupPanel() {
    return this.checkupPanels[this.activeCheckupTab];
  }

  openArticle(article: 'body' | 'checkups'): void {
    this.currentArticle = article;
    this.articleOpen = true;
    this.activeWeekTab = 1;
    this.activeCheckupTab = 1;
    requestAnimationFrame(() => {
      setTimeout(() => (this.articleAnimIn = true), 20);
    });
  }

  closeArticle(): void {
    this.articleAnimIn = false;
    setTimeout(() => {
      this.articleOpen = false;
      this.currentArticle = null;
    }, 380);
  }

  setWeekTab(id: number): void {
    this.activeWeekTab = id;
  }

  setCheckupTab(id: number): void {
    this.activeCheckupTab = id;
  }

  // ── Existing data ──

  babySizes: Record<number, { fruit: string }> = {
    8:  { fruit: 'blueberry' },
    10: { fruit: 'strawberry' },
    12: { fruit: 'lime' },
    14: { fruit: 'peach' },
    16: { fruit: 'avocado' },
    18: { fruit: 'sweet potato' },
    20: { fruit: 'mango' },
    22: { fruit: 'corn' },
    24: { fruit: 'corn' },
    26: { fruit: 'lettuce head' },
    28: { fruit: 'eggplant' },
    30: { fruit: 'broccoli' },
    32: { fruit: 'coconut' },
    34: { fruit: 'pineapple' },
    36: { fruit: 'romaine lettuce' },
    38: { fruit: 'small pumpkin' },
    40: { fruit: 'watermelon' },
  };

  get babySize() {
    const weeks = [8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40];
    let closest = weeks[0];
    for (const w of weeks) { if (this.pregnancyWeek >= w) closest = w; }
    return this.babySizes[closest];
  }

  get trimester(): string {
    if (this.pregnancyWeek <= 13) return '1st Trimester';
    if (this.pregnancyWeek <= 26) return '2nd Trimester';
    return '3rd Trimester';
  }

  todayInsights = [
    {
      text: 'Your blood volume has increased by nearly 50% during pregnancy — this is why your heart works harder and you may feel warmer than usual.',
      source: 'DailyMom Health · Body Changes'
    },
    {
      text: 'Relaxin, the hormone that loosens your ligaments for birth, also affects other joints — which is why your hips, knees, and ankles may feel different.',
      source: 'DailyMom Health · Hormones'
    },
    {
      text: 'Your sense of smell sharpens significantly in pregnancy — a protective mechanism that may help you avoid foods potentially harmful to your baby.',
      source: 'DailyMom Health · Senses'
    },
    {
      text: 'Babies in the womb can taste the flavors of the foods you eat through the amniotic fluid — making this a great time to introduce a variety of healthy foods.',
      source: 'DailyMom Health · Baby Development'
    },
    {
      text: 'Pregnancy brain is real — hormonal changes temporarily affect memory and concentration. Rest, hydration, and gentle exercise all help.',
      source: 'DailyMom Health · Mind & Body'
    },
  ];

  get todayInsight() {
    return this.todayInsights[new Date().getDate() % this.todayInsights.length];
  }

  popularArticles = [
  { 
    title: 'Your changing body: up to 42 weeks', 
    tag: 'Body Changes', 
    readTime: 6, 
    bgColor: 'linear-gradient(135deg, rgba(244,210,240,0.7), rgba(220,195,255,0.6))',
    image: 'assets/icon/yourchangingbody.jpg'
  },
  { 
    title: 'Checkups: when, how, and why', 
    tag: 'Medical', 
    readTime: 4, 
    bgColor: 'linear-gradient(135deg, rgba(185,225,240,0.6), rgba(200,210,255,0.6))',
    image: 'assets/icon/checkupswhenhowandwhy.jpg'
  },
  { 
    title: 'Why pregnancy fatigue hits so hard', 
    tag: 'Symptoms', 
    readTime: 3, 
    bgColor: 'linear-gradient(135deg, rgba(255,210,230,0.6), rgba(244,210,240,0.7))',
    image: null
  },
  { 
    title: 'Round ligament pain explained', 
    tag: 'Body Changes', 
    readTime: 3, 
    bgColor: 'linear-gradient(135deg, rgba(210,240,220,0.6), rgba(185,225,240,0.6))',
    image: null
  },
];

  bodyArticles = [
    { title: 'Why your skin is changing and what to do', tag: 'Skin & Hair', readTime: 4, bgColor: 'linear-gradient(135deg, rgba(255,230,210,0.7), rgba(255,210,230,0.6))' },
    { title: 'Understanding Braxton Hicks contractions', tag: 'Symptoms', readTime: 4, bgColor: 'linear-gradient(135deg, rgba(220,195,255,0.6), rgba(185,225,240,0.6))' },
    { title: 'Pregnancy hormones: a complete guide', tag: 'Hormones', readTime: 7, bgColor: 'linear-gradient(135deg, rgba(244,210,240,0.6), rgba(220,195,255,0.5))' },
    { title: 'Swelling in pregnancy: what is normal', tag: 'Body Changes', readTime: 3, bgColor: 'linear-gradient(135deg, rgba(185,225,240,0.7), rgba(210,240,220,0.6))' },
  ];

  babyArticles = [
    { title: 'How your baby\'s senses develop week by week', tag: 'Development', readTime: 5, bgColor: 'linear-gradient(135deg, rgba(255,220,180,0.6), rgba(255,200,210,0.6))' },
    { title: 'What your baby is doing in there right now', tag: 'Week ' + 20, readTime: 4, bgColor: 'linear-gradient(135deg, rgba(200,240,220,0.6), rgba(185,225,240,0.6))' },
    { title: 'The baby\'s brain: how it grows so fast', tag: 'Development', readTime: 6, bgColor: 'linear-gradient(135deg, rgba(220,195,255,0.6), rgba(244,210,240,0.6))' },
    { title: 'When does baby start to hear your voice?', tag: 'Bonding', readTime: 3, bgColor: 'linear-gradient(135deg, rgba(244,210,240,0.7), rgba(220,195,255,0.5))' },
  ];

  nutritionArticles = [
    { title: 'Foods that support your baby\'s brain development', tag: 'Nutrition', readTime: 5, bgColor: 'linear-gradient(135deg, rgba(200,240,200,0.7), rgba(185,225,210,0.6))' },
    { title: 'Iron in pregnancy: why it matters so much', tag: 'Vitamins', readTime: 4, bgColor: 'linear-gradient(135deg, rgba(255,230,190,0.7), rgba(255,210,180,0.6))' },
    { title: 'Staying hydrated: more important than you think', tag: 'Wellness', readTime: 3, bgColor: 'linear-gradient(135deg, rgba(185,225,240,0.7), rgba(200,215,255,0.6))' },
    { title: 'Morning sickness: foods that actually help', tag: 'Symptoms', readTime: 4, bgColor: 'linear-gradient(135deg, rgba(255,215,220,0.6), rgba(244,210,240,0.6))' },
  ];

  mindArticles = [
    { title: 'Pregnancy anxiety: what\'s normal and what\'s not', tag: 'Mental Health', readTime: 5, bgColor: 'linear-gradient(135deg, rgba(220,195,255,0.6), rgba(200,185,255,0.5))' },
    { title: 'How to prepare your relationship for a baby', tag: 'Relationships', readTime: 6, bgColor: 'linear-gradient(135deg, rgba(255,210,225,0.7), rgba(244,210,240,0.6))' },
    { title: 'Why you might feel more emotional right now', tag: 'Emotions', readTime: 4, bgColor: 'linear-gradient(135deg, rgba(255,230,200,0.6), rgba(255,210,225,0.6))' },
    { title: 'Building a support system before birth', tag: 'Wellness', readTime: 4, bgColor: 'linear-gradient(135deg, rgba(185,240,225,0.6), rgba(185,225,240,0.6))' },
  ];

  birthArticles = [
    { title: 'The stages of labor: what to expect', tag: 'Labor', readTime: 7, bgColor: 'linear-gradient(135deg, rgba(255,200,215,0.7), rgba(244,210,240,0.6))' },
    { title: 'Building your birth plan step by step', tag: 'Planning', readTime: 5, bgColor: 'linear-gradient(135deg, rgba(200,215,255,0.7), rgba(220,195,255,0.6))' },
    { title: 'Hospital bag essentials: the complete list', tag: 'Checklist', readTime: 4, bgColor: 'linear-gradient(135deg, rgba(185,240,220,0.6), rgba(200,215,255,0.6))' },
    { title: 'Pain relief options during labor explained', tag: 'Medical', readTime: 6, bgColor: 'linear-gradient(135deg, rgba(255,230,190,0.6), rgba(255,210,215,0.6))' },
  ];

  constructor(private router: Router, private theme: ThemeService) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe((val: boolean) => this.darkMode = val);
    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });
  }

  ngOnDestroy(): void {
    this.themeSub.unsubscribe();
  }

  navigate(route: string, tab?: string): void {
    this.router.navigate([route], {
      queryParams: tab ? { tab } : {}
    });
  }
}