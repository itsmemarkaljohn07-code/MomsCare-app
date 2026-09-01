// insights.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ThemeService } from '../../services/theme';
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
  pregnancyWeek = 20;

  // ── Bottom nav active state ──────────────────────────────────────────────
  activeTab = 'insights';

  // ── Article reader state ──────────────────────────────────────────────────
  articleOpen    = false;
  articleAnimIn  = false;
  currentArticle: string | null = null;
  activeTabId    = 1;

  // ── "Specialized for this week" auto-sliding carousel ──
  // Sourced from the existing articles library, filtered to the most
  // relevant keys for now. Swap this getter's source for a Firestore
  // query keyed by pregnancyWeek once weekly-tagged content exists —
  // the carousel template/logic below does not need to change.
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
  // ARTICLE LIBRARY — 25 unique articles, one per card
  // ══════════════════════════════════════════════════════════════════════════
  articles: Record<string, ArticleDefinition> = {


    // ── 1. Your changing body ─────────────────────────────────────────────
    body: {
      title: 'Your changing body: up to 42 weeks',
      readTime: 6,
      heroTag: 'Body Changes',
      heroImage: 'assets/icon/yourchangingbody.jpg',
      heroBg: 'linear-gradient(135deg, rgba(244,210,240,0.9), rgba(220,195,255,0.8))',
      accentColor: '#e07eb8',
      accentBg: 'rgba(224,126,184,0.10)',
      highlightBg: 'rgba(224,126,184,0.07)',
      highlightBorder: 'rgba(224,126,184,0.20)',
      tipBg: 'rgba(181,127,212,0.07)',
      tipBorder: 'rgba(181,127,212,0.18)',
      tabs: [
        { id: 1, label: 'Weeks 1–13' },
        { id: 2, label: 'Weeks 14–26' },
        { id: 3, label: 'Weeks 27–42' },
      ],
      panels: {
        1: {
          tag: '1st Trimester',
          title: 'The first wave of changes',
          intro: 'Your body begins transforming almost immediately after conception — often before you even know you\'re pregnant. Hormones surge, organs shift priorities, and nearly every system adjusts to support new life.',
          highlight: { label: 'Did you know?', text: 'Your blood volume starts increasing as early as week 6 and will grow by up to 50% by the third trimester.' },
          items: [
            { label: 'Heart & circulation', desc: 'Your heart pumps harder to support growing blood volume. You may feel warmer and notice flushing more easily.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'heart' },
            { label: 'Nausea & digestion', desc: 'Rising hCG and estrogen slow digestion. Morning sickness can strike at any time of day and peaks around weeks 8–10.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'star' },
            { label: 'Fatigue', desc: 'Progesterone causes deep tiredness. Your body is building the placenta — one of the most energy-intensive tasks it will ever do.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'moon' },
            { label: 'Brain & mood', desc: 'Hormonal shifts can cause heightened emotions, vivid dreams, and temporary memory lapses — all completely normal.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'brain' },
          ],
          tip: { text: 'Small, frequent meals help with nausea. Ginger tea and cold foods are often better tolerated in the first trimester.', source: 'MomsCare Health · Nutrition' },
        },
        2: {
          tag: '2nd Trimester',
          title: 'The golden stretch',
          intro: 'For many, the second trimester brings welcome relief. Nausea often fades, energy returns, and your bump becomes beautifully visible. But new changes are quietly underway.',
          highlight: { label: 'Milestone', text: 'Around week 16–22 you\'ll likely feel baby\'s first movements — a flutter, a roll, or a gentle kick.' },
          items: [
            { label: 'Skin & hair', desc: 'Increased blood flow gives many women a "pregnancy glow." Linea nigra may appear. Hair often grows thicker.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'star' },
            { label: 'Joints & ligaments', desc: 'Relaxin loosens your pelvis for birth but also affects knees, hips, and ankles. You may notice subtle instability or aching.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'bone' },
            { label: 'Heightened senses', desc: 'Your sense of smell sharpens significantly — an evolutionary mechanism to help avoid foods that may be harmful.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'eye' },
            { label: 'Sleep shifts', desc: 'Finding a comfortable position becomes harder. Sleeping on your left side improves blood flow to baby and kidneys.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'moon' },
          ],
          tip: { text: 'A pregnancy pillow supporting your bump and back can dramatically improve sleep quality from mid-pregnancy onward.', source: 'MomsCare Health · Wellness' },
        },
        3: {
          tag: '3rd Trimester',
          title: 'The final stretch',
          intro: 'Your body is preparing in earnest now. Baby grows rapidly — gaining about 200g per week — and your organs accommodate by moving and compressing. Discomfort is common, but so is deep wonder.',
          highlight: { label: 'What\'s happening', text: 'Braxton Hicks contractions ramp up — practice runs for real labor. They\'re irregular and ease with rest or hydration.' },
          items: [
            { label: 'Breathlessness', desc: 'Baby pressing against your diaphragm reduces lung capacity. Shortness of breath on exertion is common and normal.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'breath' },
            { label: 'Swelling', desc: 'Fluid retention in ankles, feet, and hands is very common. Elevating your feet and staying hydrated helps significantly.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'drop' },
            { label: 'Pelvic pressure', desc: 'As baby "drops" and engages in the pelvis, pressure below increases while breathing may momentarily ease.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'wave' },
            { label: 'Colostrum', desc: 'Your breasts begin producing colostrum — the first nutrient-rich milk — often from around week 28 onwards.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'heart' },
          ],
          tip: { text: 'Gentle movement like walking and swimming relieves third-trimester discomfort and helps baby get into position for birth.', source: 'MomsCare Health · Movement' },
        },
      },
      youTubeUrl: "https://www.youtube.com/watch?v=F_ssj7-8rYg",
      citation: { source: "Mayo Clinic — Pregnancy Week by Week", author: "Mayo Clinic Staff", year: "2024", url: "https://www.mayoclinic.org/healthy-lifestyle/pregnancy-week-by-week/basics/healthy-pregnancy/hlv-20049471" },
    },

    // ── 2. Checkups ───────────────────────────────────────────────────────
    checkups: {
      title: 'Checkups: when, how, and why',
      readTime: 4,
      heroTag: 'Medical',
      heroImage: 'assets/icon/checkupswhenhowandwhy.jpg',
      heroBg: 'linear-gradient(135deg, rgba(185,225,240,0.9), rgba(200,210,255,0.8))',
      accentColor: '#5b8fd4',
      accentBg: 'rgba(91,143,212,0.10)',
      highlightBg: 'rgba(91,143,212,0.06)',
      highlightBorder: 'rgba(91,143,212,0.20)',
      tipBg: 'rgba(91,143,212,0.06)',
      tipBorder: 'rgba(91,143,212,0.18)',
      tabs: [
        { id: 1, label: '1st Trimester' },
        { id: 2, label: '2nd Trimester' },
        { id: 3, label: '3rd Trimester' },
      ],
      panels: {
        1: {
          tag: 'Weeks 4–13',
          title: 'Your first appointments',
          intro: 'The first trimester is packed with important appointments. These early visits confirm your pregnancy, establish your due date, and screen for potential concerns while there\'s the most time to act.',
          highlight: { label: 'Book early', text: 'Your first booking appointment ideally happens between weeks 8–10. Call your midwife or GP as soon as you get a positive test.' },
          items: [
            { label: 'Booking appointment (wk 8–10)', desc: 'A long first visit covering your medical history, lifestyle, mental health, and blood pressure. Blood and urine samples are taken.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'doc' },
            { label: 'Blood tests', desc: 'Screens for blood type, anaemia, rubella immunity, STIs, and sickle cell disease. Results usually come back within a week.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'heart' },
            { label: 'Nuchal scan (wk 11–13)', desc: 'An ultrasound that measures the fluid at the back of baby\'s neck, combined with blood markers, to assess chromosomal risk.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'scan' },
            { label: 'Supplements check', desc: 'Your midwife will confirm you\'re taking folic acid (400mcg) and discuss vitamin D, iron, and any prescription needs.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'pill' },
          ],
          tip: { text: 'Write down any symptoms, concerns, or questions before each appointment — it\'s easy to forget in the moment.', source: 'MomsCare Health · Medical' }
    },
        2: {
          tag: 'Weeks 14–27',
          title: 'Monitoring your progress',
          intro: 'The second trimester brings the most-anticipated scan of pregnancy. Appointments space out a little, but each one checks that both you and baby are growing well and on track.',
          highlight: { label: 'The big scan', text: 'The anomaly scan at 18–21 weeks checks baby\'s organs, spine, limbs, and placenta position in detail.' },
          items: [
            { label: 'Anomaly scan (wk 18–21)', desc: 'A detailed ultrasound checking baby\'s structure and development. You may find out the sex here if you wish.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'scan' },
            { label: 'Fundal height checks', desc: 'From around week 24, your midwife measures the distance from your pubic bone to the top of your uterus to track baby\'s growth.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'chart' },
            { label: 'Blood pressure & urine', desc: 'Checked at every visit to watch for signs of pre-eclampsia — a serious condition that can develop from mid-pregnancy onward.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'shield' },
            { label: 'Glucose tolerance test', desc: 'Offered around week 24–28 if you\'re at risk of gestational diabetes. Involves a fasting blood draw and a sugary drink.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'doc' },
          ],
          tip: { text: 'Bring your partner or a support person to the anomaly scan — it\'s one of the most emotional appointments of pregnancy.', source: 'MomsCare Health · Medical' },
        },
        3: {
          tag: 'Weeks 28–42',
          title: 'The final countdown',
          intro: 'Third-trimester appointments become more frequent as your due date approaches. Your care team will be watching baby\'s position, your blood pressure, and signs that labour may be near.',
          highlight: { label: 'Frequency increases', text: 'From week 36, most women see their midwife every one to two weeks until birth.' },
          items: [
            { label: 'Baby\'s position check', desc: 'From week 36, your midwife checks baby\'s position manually. If baby is breech, options like ECV or planned caesarean are discussed.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'check' },
            { label: 'Fetal heartbeat monitoring', desc: 'A handheld Doppler is used at each visit to confirm baby\'s heart rate. Reduced movements should always be reported promptly.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'heart' },
            { label: 'Group B Strep test', desc: 'An optional swab test offered around week 35–37 to check for GBS bacteria, which can affect newborns during delivery.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'shield' },
            { label: 'Post-dates planning', desc: 'If you reach week 41, your midwife will discuss membrane sweeps and induction options to avoid going significantly overdue.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'clock' },
          ],
          tip: { text: 'Pack your hospital bag by week 36. Keep your birth plan, maternity notes, and insurance details together and easy to grab.', source: 'MomsCare Health · Planning' },
        },
      },
      youTubeUrl: "https://www.youtube.com/watch?v=UzEHC-oLQDw",
      citation: { source: "NHS — Your Antenatal Care", author: "NHS UK", year: "2024", url: "https://www.nhs.uk/pregnancy/your-pregnancy-care/your-antenatal-care" },
    },

    // ── 3. Pregnancy fatigue ──────────────────────────────────────────────
    fatigue: {
      title: 'Why pregnancy fatigue hits so hard',
      readTime: 3,
      heroTag: 'Symptoms',
      heroImage: 'assets/icon/pregnancy_fatiuge.jpg',
      heroBg: 'linear-gradient(135deg, #ffeaf5 0%, #f3e0ff 100%)',
      accentColor: '#b57fd4',
      accentBg: 'rgba(181,127,212,0.10)',
      highlightBg: 'rgba(181,127,212,0.07)',
      highlightBorder: 'rgba(181,127,212,0.20)',
      tipBg: 'rgba(181,127,212,0.07)',
      tipBorder: 'rgba(181,127,212,0.18)',
      tabs: [
        { id: 1, label: '1st Trimester' },
        { id: 2, label: '2nd Trimester' },
        { id: 3, label: '3rd Trimester' },
      ],
      panels: {
        1: {
          tag: 'First Trimester Fatigue',
          title: 'Why you feel exhausted so early',
          intro: 'First-trimester fatigue can be overwhelming — even debilitating. This isn\'t ordinary tiredness. Your body is performing extraordinary work: building the placenta from scratch, increasing blood volume, and surging with hormones that have direct effects on your brain and energy systems.',
          highlight: { label: 'Key fact', text: 'Progesterone has a sedative-like effect on the nervous system. Levels rise sharply in early pregnancy and peak around week 10.' },
          items: [
            { label: 'Placenta construction', desc: 'Building the placenta is one of the most energy-intensive biological processes. Your body diverts resources away from you to support it.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'heart' },
            { label: 'Blood volume expansion', desc: 'Your blood volume will increase by up to 50%. Producing this extra blood requires iron, nutrients, and significant energy output.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'drop' },
            { label: 'Progesterone surge', desc: 'This hormone rises dramatically in early pregnancy and has a sedative effect on your central nervous system — causing real, physiological sleepiness.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'moon' },
            { label: 'Emotional processing', desc: 'Anxiety, excitement, and the mental weight of early pregnancy are emotionally taxing — adding to physical exhaustion.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'brain' },
          ],
          tip: { text: 'Rest without guilt. First-trimester fatigue is a signal your body is working incredibly hard. Short naps of 20 minutes can restore alertness without disrupting night sleep.', source: 'MomsCare Health · Wellness' }
    },
        2: {
          tag: 'Second Trimester Energy',
          title: 'The return of energy',
          intro: 'For most women, the second trimester brings a welcome energy revival. Progesterone levels stabilize, morning sickness fades, and many feel more like themselves. However, fatigue can return or persist, especially with the demands of work and daily life.',
          highlight: { label: 'Good news', text: 'Most women report a significant improvement in energy levels between weeks 14–16 as hCG levels plateau and the placenta takes over hormone production.' },
          items: [
            { label: 'Placenta takes over', desc: 'The placenta now produces most pregnancy hormones, reducing the burden on your own glands and often improving energy noticeably.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'star' },
            { label: 'Iron levels', desc: 'Mid-pregnancy anaemia is very common. If fatigue persists into the second trimester, ask your midwife to check your iron levels at your next visit.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'heart' },
            { label: 'Sleep quality', desc: 'Despite feeling more awake in the day, sleep becomes lighter. Vivid dreams, frequent urination, and early bump discomfort can disrupt overnight rest.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'moon' },
            { label: 'Physical demands', desc: 'Your growing bump shifts your centre of gravity, increasing muscle effort for basic movement. Even sitting upright uses more energy than before.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'bone' },
          ],
          tip: { text: 'Iron-rich foods combined with vitamin C significantly improve absorption. Try spinach with lemon juice, or lentils with tomatoes.', source: 'MomsCare Health · Nutrition' },
        },
        3: {
          tag: 'Third Trimester Fatigue',
          title: 'When tiredness returns',
          intro: 'Third-trimester fatigue is different in character from early pregnancy tiredness. It is physical in nature — the result of carrying additional weight, disrupted sleep, and organs working overtime. Many women also experience anxiety about the approaching birth.',
          highlight: { label: 'Normal weight gain', text: 'By 36 weeks, your uterus weighs approximately 1 kg, your baby around 2.5 kg, plus placenta, amniotic fluid, and expanded blood volume.' },
          items: [
            { label: 'Physical load', desc: 'Carrying an additional 10–15 kg alters your posture, increases joint strain, and elevates the effort required for all movement.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'bone' },
            { label: 'Disrupted sleep', desc: 'Frequent urination, restless legs, heartburn, and difficulty finding a comfortable position all fragment overnight sleep in the third trimester.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'bed' },
            { label: 'Breathlessness', desc: 'Baby pressing against your diaphragm means even mild exertion can leave you breathless — which is exhausting and often anxiety-inducing.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'breath' },
            { label: 'Birth preparation', desc: 'Your body is quietly preparing for labour — hormonal shifts, ligament softening, and cervical changes all use biological energy.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'labor' },
          ],
          tip: { text: 'Prioritise sleep above socialising and non-essential tasks. A bedroom temperature of 16–18°C and a left-side sleeping position improves sleep quality significantly.', source: 'MomsCare Health · Wellness' },
        },
      },
      youTubeUrl: "https://www.youtube.com/watch?v=yAjpSgDmaLs",
      citation: { source: "Cleveland Clinic — Fatigue During Pregnancy", author: "Cleveland Clinic", year: "2024", url: "https://my.clevelandclinic.org/health/symptoms/21213-fatigue" },
    },

    // ── 4. Round ligament pain ────────────────────────────────────────────
    ligament: {
      title: 'Round ligament pain explained',
      readTime: 3,
      heroTag: 'Body Changes',
      heroImage: 'assets/icon/round_ligament_pain.jpg',
      heroBg: 'linear-gradient(135deg, #e8f8f0 0%, #d8f0ff 100%)',
      accentColor: '#6dbfbf',
      accentBg: 'rgba(109,191,191,0.10)',
      highlightBg: 'rgba(109,191,191,0.07)',
      highlightBorder: 'rgba(109,191,191,0.22)',
      tipBg: 'rgba(109,191,191,0.07)',
      tipBorder: 'rgba(109,191,191,0.20)',
      tabs: [{ id: 1, label: 'What & Why' }, { id: 2, label: 'Relief' }],
      panels: {
        1: {
          tag: 'Body Changes',
          title: 'What is round ligament pain?',
          intro: 'Round ligament pain is one of the most common complaints of the second trimester. It presents as sharp, shooting, or cramping pain in the lower abdomen or groin — often striking suddenly during movement. While alarming when first experienced, it is completely normal.',
          highlight: { label: 'What causes it', text: 'The round ligaments support your uterus. As it grows and shifts forward, these ligaments stretch and become sensitive — especially to sudden movement.' },
          items: [
            { label: 'Anatomy', desc: 'Two thick ligaments run from either side of your uterus through the groin. In pregnancy they stretch from approximately 10cm to over 30cm to support the growing uterus.', iconBg: 'rgba(109,191,191,0.12)', svgKey: 'bone' },
            { label: 'Trigger movements', desc: 'Sudden changes in position — rolling over in bed, sneezing, coughing, laughing, or standing up quickly — are the most common triggers for a sharp pain episode.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'wave' },
            { label: 'When it peaks', desc: 'Most women first notice round ligament pain between weeks 14–20, when the uterus is rising out of the pelvis and the bump becomes more prominent.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'clock' },
            { label: 'When to seek help', desc: 'Pain lasting more than a few minutes, accompanied by fever, bleeding, difficulty walking, or severe cramping should always be assessed by your midwife or doctor.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'shield' },
          ],
          tip: { text: 'Moving slowly and deliberately — especially when changing position — dramatically reduces the frequency and severity of round ligament pain episodes.', source: 'MomsCare Health · Body Changes' }
    },
        2: {
          tag: 'Management',
          title: 'How to find relief',
          intro: 'Round ligament pain cannot be prevented entirely, but it can be managed effectively. Most episodes resolve within seconds to minutes. Understanding your triggers and building simple habits significantly reduces how often it strikes.',
          highlight: { label: 'Simple technique', text: 'When you feel a sneeze or cough coming, bend slightly at the hips and support your lower abdomen with your hands — this reduces the sudden ligament stretch.' },
          items: [
            { label: 'Support belt', desc: 'A pregnancy support belt lifts the bump and takes pressure off the round ligaments. Many women find significant relief from wearing one from week 16 onwards.', iconBg: 'rgba(109,191,191,0.12)', svgKey: 'shield' },
            { label: 'Warm compress', desc: 'A warm (not hot) compress applied to the affected side for 10–15 minutes relaxes the ligament and reduces spasm. Avoid heat packs on the bump itself.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'sun' },
            { label: 'Prenatal yoga', desc: 'Gentle hip-opening stretches and prenatal yoga postures designed for round ligament support reduce frequency of episodes significantly for many women.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'breath' },
            { label: 'Movement adjustments', desc: 'Roll onto your side before sitting up from lying down. When standing, use a deliberate, slow movement. Avoid twisting your torso suddenly.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'check' },
          ],
          tip: { text: 'If pain is persistent or one-sided, always mention it to your midwife. Round ligament pain is common, but it is a diagnosis of exclusion — other causes should be ruled out.', source: 'MomsCare Health · Body Changes' },
        },
      },
      youTubeUrl: "https://www.youtube.com/watch?v=TEFMQ5HaFoU",
      citation: { source: "Cleveland Clinic — Round Ligament Pain", author: "Cleveland Clinic", year: "2023", url: "https://my.clevelandclinic.org/health/diseases/12451-round-ligament-pain" },
    },

    // ── 5. Skin changes ───────────────────────────────────────────────────
    skin: {
      title: 'Why your skin changes and what helps',
      readTime: 4,
      heroTag: 'Skin & Hair',
      heroImage: 'assets/icon/skinchanges_pregnancy.jpg',
      heroBg: 'linear-gradient(135deg, #fff0e8 0%, #ffe0f0 100%)',
      accentColor: '#e07eb8',
      accentBg: 'rgba(224,126,184,0.10)',
      highlightBg: 'rgba(224,126,184,0.07)',
      highlightBorder: 'rgba(224,126,184,0.20)',
      tipBg: 'rgba(224,126,184,0.07)',
      tipBorder: 'rgba(224,126,184,0.18)',
      tabs: [{ id: 1, label: 'Skin Changes' }, { id: 2, label: 'Hair & Nails' }],
      panels: {
        1: {
          tag: 'Skin Changes',
          title: 'The science of pregnancy skin',
          intro: 'Pregnancy hormones affect virtually every aspect of your skin. Oestrogen, progesterone, and melanocyte-stimulating hormone all play roles — producing effects that range from the famous glow to pigmentation changes and stretch marks.',
          highlight: { label: 'The pregnancy glow', text: 'Increased blood flow to the skin\'s surface combined with higher oil production is the physiological basis of the "pregnancy glow" many women experience.' },
          items: [
            { label: 'Melasma (mask of pregnancy)', desc: 'Dark patches on the forehead, cheeks, and upper lip affect up to 70% of pregnant women. Caused by MSH, it often fades postpartum but is worsened by sun exposure.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'sun' },
            { label: 'Linea nigra', desc: 'A dark vertical line running down the centre of your abdomen appears in most pregnancies. It is caused by excess melanin and fades gradually after birth.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'star' },
            { label: 'Stretch marks', desc: 'Caused by rapid skin stretching, stretch marks typically appear on the abdomen, breasts, hips, and thighs. Genetics play a large role in susceptibility.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'wave' },
            { label: 'Acne & oiliness', desc: 'Some women experience clearer skin in pregnancy; others see acne worsen. Avoid retinoids and salicylic acid — many common acne treatments are not safe in pregnancy.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'drop' },
          ],
          tip: { text: 'Apply broad-spectrum SPF 30+ daily to prevent melasma from darkening. A zinc-based mineral sunscreen is the safest choice during pregnancy.', source: 'MomsCare Health · Skin & Hair' }
    },
        2: {
          tag: 'Hair & Nails',
          title: 'Changes to hair and nails',
          intro: 'Many women notice significant changes to their hair and nails during pregnancy. Higher oestrogen levels extend the growth phase of hair follicles — meaning less shedding and noticeably thicker, lusher hair. Nails frequently grow faster and stronger.',
          highlight: { label: 'Postpartum note', text: 'The hair thickening you enjoy in pregnancy reverses after birth. Postpartum hair shedding (telogen effluvium) typically peaks at 3–4 months postpartum and is entirely normal.' },
          items: [
            { label: 'Thicker hair', desc: 'Oestrogen extends the anagen (growth) phase and suppresses the telogen (resting/shedding) phase — causing significantly less hair loss during pregnancy.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'star' },
            { label: 'Texture changes', desc: 'Hair may become straighter or curlier, and oilier or drier, depending on the hormonal balance. These changes usually reverse after birth.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'leaf' },
            { label: 'Faster nail growth', desc: 'Nails grow more quickly in pregnancy. They may also become stronger, though some women find their nails become more brittle or develop ridges.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'check' },
            { label: 'Body hair', desc: 'Increased androgens can cause more noticeable growth on the face, abdomen, or thighs in some women. This usually reduces significantly after birth.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'sun' },
          ],
          tip: { text: 'If you choose to dye your hair in pregnancy, wait until after the first trimester and opt for semi-permanent, ammonia-free products in a well-ventilated salon.', source: 'MomsCare Health · Skin & Hair' },
        },
      },
      youTubeUrl: "https://www.youtube.com/watch?v=qD8-eTHbHBs",
      citation: { source: "American Academy of Dermatology — Skin Conditions During Pregnancy", author: "AAD", year: "2024", url: "https://www.aad.org/public/diseases/a-z/stretch-marks-treatment" },
    },

    // ── 6. Braxton Hicks ─────────────────────────────────────────────────
    braxton: {
      title: 'Understanding Braxton Hicks contractions',
      readTime: 4,
      heroTag: 'Symptoms',
      heroImage: 'assets/icon/Braxton-Hicks contractions.jpg',
      heroBg: 'linear-gradient(135deg, #e8eeff 0%, #f0e0ff 100%)',
      accentColor: '#9b6fc4',
      accentBg: 'rgba(155,111,196,0.10)',
      highlightBg: 'rgba(155,111,196,0.07)',
      highlightBorder: 'rgba(155,111,196,0.20)',
      tipBg: 'rgba(155,111,196,0.07)',
      tipBorder: 'rgba(155,111,196,0.18)',
      tabs: [{ id: 1, label: 'What They Are' }, { id: 2, label: 'vs Real Labour' }],
      panels: {
        1: {
          tag: 'Symptoms',
          title: 'Practice contractions explained',
          intro: 'Braxton Hicks contractions are sporadic, irregular tightenings of the uterus that occur throughout pregnancy — often from as early as week 6, though most women don\'t feel them until the second or third trimester. They are a normal part of pregnancy.',
          highlight: { label: 'Named after', text: 'John Braxton Hicks, an English obstetrician, described these contractions in 1872 — recognizing that the uterus begins practising long before labour actually begins.' },
          items: [
            { label: 'What they feel like', desc: 'A tightening or squeezing sensation across the front of your abdomen. They are usually painless, though uncomfortable. Your bump may visibly harden or change shape momentarily.', iconBg: 'rgba(155,111,196,0.12)', svgKey: 'wave' },
            { label: 'Common triggers', desc: 'Dehydration, a full bladder, physical activity, sex, touching your bump, and baby\'s movements can all trigger a Braxton Hicks episode.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'star' },
            { label: 'Why they happen', desc: 'The uterus is a muscle. Braxton Hicks contractions keep it toned, improve blood flow to the placenta, and prime the cervix for eventual dilation.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'heart' },
            { label: 'When to call your midwife', desc: 'Contractions that are regular, intensifying, closer than 10 minutes apart, or accompanied by fluid, bleeding, or back pain should always be assessed promptly.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'shield' },
          ],
          tip: { text: 'Dehydration is the most common trigger for Braxton Hicks. If you notice an increase in frequency, drink a large glass of water, rest, and monitor whether they ease.', source: 'MomsCare Health · Symptoms' }
    },
        2: {
          tag: 'Differentiation',
          title: 'Practice vs real labour',
          intro: 'As you approach your due date, distinguishing Braxton Hicks from true labour contractions becomes increasingly important. The key differences lie in pattern, intensity, and response to movement or rest.',
          highlight: { label: 'The walk test', text: 'True labour contractions continue or intensify when you walk around. Braxton Hicks typically ease with movement or a change of position.' },
          items: [
            { label: 'Pattern', desc: 'Braxton Hicks are irregular — varying in frequency and duration. True labour contractions follow an increasingly regular pattern that shortens in interval over time.', iconBg: 'rgba(155,111,196,0.12)', svgKey: 'clock' },
            { label: 'Intensity', desc: 'Braxton Hicks usually remain consistently mild. True labour contractions build progressively in intensity and do not ease with rest.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'wave' },
            { label: 'Location', desc: 'Braxton Hicks are typically felt only at the front. Labour contractions often begin in the lower back and wrap around to the front — the "belt" pattern.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'bone' },
            { label: 'Response to hydration', desc: 'Drinking water and resting often relieves Braxton Hicks within 30 minutes. True labour continues and intensifies regardless.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'drop' },
          ],
          tip: { text: 'If you are ever uncertain whether you are in true labour, contact your midwife or maternity unit — they would always rather receive a call than have you wait alone.', source: 'MomsCare Health · Labor & Birth' },
        },
      },
      youTubeUrl: "https://www.youtube.com/watch?v=5WsxNnOrkZE",
      citation: { source: "Mayo Clinic — Braxton Hicks Contractions", author: "Mayo Clinic Staff", year: "2024", url: "https://www.mayoclinic.org/healthy-lifestyle/pregnancy-week-by-week/expert-answers/braxton-hicks/faq-20058257" },
    },

    // ── 7. Baby senses ────────────────────────────────────────────────────
    senses: {
      title: 'How your baby\'s senses develop week by week',
      readTime: 5,
      heroTag: 'Development',
      heroImage: 'assets/icon/babys_senses.jpg',
      heroBg: 'linear-gradient(135deg, #fff5e0 0%, #ffe0d0 100%)',
      accentColor: '#d9609a',
      accentBg: 'rgba(217,96,154,0.10)',
      highlightBg: 'rgba(217,96,154,0.07)',
      highlightBorder: 'rgba(217,96,154,0.20)',
      tipBg: 'rgba(217,96,154,0.07)',
      tipBorder: 'rgba(217,96,154,0.18)',
      tabs: [{ id: 1, label: 'Touch & Taste' }, { id: 2, label: 'Hearing & Sight' }],
      panels: {
        1: {
          tag: 'Baby\'s Senses',
          title: 'Touch and taste in the womb',
          intro: 'Your baby\'s sensory development begins far earlier than most parents realise. Touch receptors form before many organs, and by the second trimester your baby is actively tasting and responding to the world inside the womb.',
          highlight: { label: 'First sense to develop', text: 'Touch receptors begin forming around week 8. By week 16, your baby can feel sensations throughout most of the body — and responds to gentle pressure on your abdomen.' },
          items: [
            { label: 'Touch development (wk 8–16)', desc: 'Sensitivity begins around the mouth and spreads across the face, palms, and soles of the feet before extending across the body. Your baby will reflexively pull away from stimuli.', iconBg: 'rgba(217,96,154,0.12)', svgKey: 'hand' },
            { label: 'Taste buds form (wk 14–16)', desc: 'Taste buds appear on the tongue by week 14. Your baby swallows amniotic fluid continuously — and can detect the flavours of what you eat. Research shows preferences form before birth.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'leaf' },
            { label: 'Sucking & swallowing (wk 16)', desc: 'From around week 16, your baby practices sucking and swallowing movements — both preparing for feeding after birth and regulating amniotic fluid levels.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'drop' },
            { label: 'Pain sensitivity (wk 24+)', desc: 'While the neurological basis of fetal pain perception is scientifically debated, the pain pathways to the brain are largely connected by the end of the second trimester.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'brain' },
          ],
          tip: { text: 'Eating a varied diet of vegetables, herbs, and whole foods during pregnancy exposes your baby to diverse flavours — research suggests this may influence food acceptance in early childhood.', source: 'MomsCare Health · Baby Development' }
    },
        2: {
          tag: 'Baby\'s Senses',
          title: 'Hearing and sight in the womb',
          intro: 'Your baby begins hearing your voice before they are born — and can see light filtering through your skin in the third trimester. These developing senses allow your baby to begin recognising you long before delivery.',
          highlight: { label: 'Recognition at birth', text: 'Newborns consistently prefer their mother\'s voice over a stranger\'s voice — demonstrating that auditory learning and memory begin before birth.' },
          items: [
            { label: 'Hearing develops (wk 18–25)', desc: 'The inner ear structures are functional by around week 18. By week 25, your baby responds to sounds with movement and heart rate changes. Your voice is the most familiar sound.', iconBg: 'rgba(217,96,154,0.12)', svgKey: 'ear' },
            { label: 'What baby hears', desc: 'The uterus is not silent. Baby hears your heartbeat, your digestion, your breathing, and muffled versions of voices and music from the outside world.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'wave' },
            { label: 'Sight development (wk 22+)', desc: 'The eyes begin to open around week 26–28. While the womb is dark, light that penetrates the abdominal wall is visible — baby will move away from a bright torch held against your skin.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'eye' },
            { label: 'Visual readiness at birth', desc: 'At birth, babies can see clearly at 20–30cm — approximately the distance from breast to parent\'s face during feeding. Faces and high contrast patterns are most visually stimulating to newborns.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'eye' },
          ],
          tip: { text: 'Reading aloud, singing, and talking to your bump from mid-pregnancy helps your baby recognise your voice and cadence. Many parents find it meaningful and calming too.', source: 'MomsCare Health · Baby Development' },
        },
      },
      youTubeUrl: "https://www.youtube.com/watch?v=HlxWaqBYFok",
      citation: { source: "Stanford Children's Health — Fetal Development", author: "Stanford Children's Health", year: "2024", url: "https://www.stanfordchildrens.org/en/topic/default?id=fetal-development-stages-of-growth-90-P02542" },
    },

    // ── 8. Fetal movement ─────────────────────────────────────────────────
    movement: {
      title: 'Fetal movement: what\'s normal to feel',
      readTime: 4,
      heroTag: 'Development',
      heroImage: 'assets/icon/fatal_movement.jpg',
      heroBg: 'linear-gradient(135deg, #e0f5ee 0%, #d0e8ff 100%)',
      accentColor: '#6dbfbf',
      accentBg: 'rgba(109,191,191,0.10)',
      highlightBg: 'rgba(109,191,191,0.07)',
      highlightBorder: 'rgba(109,191,191,0.22)',
      tipBg: 'rgba(109,191,191,0.07)',
      tipBorder: 'rgba(109,191,191,0.20)',
      tabs: [{ id: 1, label: 'First Movements' }, { id: 2, label: 'Kick Counting' }],
      panels: {
        1: {
          tag: 'Baby Development',
          title: 'Your baby\'s movements explained',
          intro: 'Feeling your baby move for the first time is one of the most profound experiences of pregnancy. But what you feel evolves significantly across the trimesters — from the faintest flutter to clearly visible kicks that take your breath away.',
          highlight: { label: 'Quickening', text: 'The first-time sensation of baby moving — called quickening — is often described as bubbles, butterflies, or a light fluttering. First-time mothers typically feel it between weeks 18–22.' },
          items: [
            { label: 'Early movements (wk 7–16)', desc: 'Your baby begins moving spontaneously from week 7–8, but the uterus is still small and cushioned by fluid. You\'re unlikely to feel anything until week 16 at the earliest.', iconBg: 'rgba(109,191,191,0.12)', svgKey: 'leaf' },
            { label: 'Flutters (wk 16–20)', desc: 'First movements feel like gas bubbles, twitches, or flickers deep in the lower abdomen. Second-time mothers often recognize them earlier because they know what to expect.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'wave' },
            { label: 'Definite kicks (wk 20–28)', desc: 'By week 24, movements are strong enough to feel from outside. Partners can feel kicks by placing a hand on your bump. Baby has defined sleep–wake cycles by this point.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'heart' },
            { label: 'Third-trimester movement', desc: 'Space becomes limited, so movements shift from kicks to rolls and stretches. Movement should remain regular — a change in your baby\'s usual pattern should always be reported.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'clock' },
          ],
          tip: { text: 'Baby tends to be most active 1–2 hours after you eat and often responds to cold or sweet drinks. Some babies are most active at night when the rocking motion of your movement during the day has stopped.', source: 'MomsCare Health · Baby Development' },
        },
        2: {
          tag: 'Safety',
          title: 'Monitoring movements safely',
          intro: 'Monitoring your baby\'s movements is one of the most important things you can do in the second half of pregnancy. A reduction in movement can be an early sign that baby needs assessment. Trust your instincts — you know your baby\'s patterns best.',
          highlight: { label: 'Important', text: 'There is no set number of movements that is "normal" — what matters is consistency. Get to know your baby\'s individual pattern and report any change promptly.' },
          items: [
            { label: 'When to start monitoring', desc: 'From week 28, you should be aware of your baby\'s movements daily. You do not need to count them formally — just notice whether the overall pattern feels the same as usual.', iconBg: 'rgba(109,191,191,0.12)', svgKey: 'clock' },
            { label: 'Kick counting method', desc: 'If you wish to count formally, many clinicians recommend noting the time taken to feel 10 movements. Most babies achieve 10 movements within 1–2 hours when actively awake.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'check' },
            { label: 'What to do if concerned', desc: 'Do not wait to see if movement increases. Do not use a home doppler as reassurance — it cannot confirm baby is well. Contact your midwife or maternity unit immediately.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'shield' },
            { label: 'Common myths', desc: 'Babies do not run out of room in the third trimester. Movement should not decrease as you near your due date. This myth has unfortunately delayed care in some situations.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'star' },
          ],
          tip: { text: 'Apps like "Count the Kicks" can help you log movement patterns over time. Sharing this data with your midwife gives them a clearer picture of your baby\'s individual baseline.', source: 'MomsCare Health · Safety' },
        },
      },
      youTubeUrl: "https://www.youtube.com/watch?v=3M-bQ_B4E9M",
      citation: { source: "Mayo Clinic — Fetal Movement: Feeling Your Baby Kick", author: "Mayo Clinic Staff", year: "2024", url: "https://www.mayoclinic.org/healthy-lifestyle/pregnancy-week-by-week/in-depth/fetal-movements/art-20044328" },
    },

    // ── 9. Iron in pregnancy ──────────────────────────────────────────────
    iron: {
      title: 'Iron in pregnancy: why it matters so much',
      readTime: 4,
      heroTag: 'Nutrition',
      heroImage: 'assets/icon/foods_rich in iron.jpg',
      heroBg: 'linear-gradient(135deg, #fff5e0 0%, #ffe8cc 100%)',
      accentColor: '#d9609a',
      accentBg: 'rgba(217,96,154,0.10)',
      highlightBg: 'rgba(217,96,154,0.07)',
      highlightBorder: 'rgba(217,96,154,0.20)',
      tipBg: 'rgba(217,96,154,0.07)',
      tipBorder: 'rgba(217,96,154,0.18)',
      tabs: [{ id: 1, label: 'Why Iron Matters' }, { id: 2, label: 'Sources & Absorption' }],
      panels: {
        1: {
          tag: 'Nutrition',
          title: 'Iron and anaemia in pregnancy',
          intro: 'Iron deficiency anaemia is the most common nutritional deficiency in pregnant women worldwide — affecting approximately 1 in 3. Understanding why iron is so critical and how to recognise deficiency can protect both your health and your baby\'s development.',
          highlight: { label: 'Increased need', text: 'Your iron requirement nearly doubles during pregnancy — from 18mg/day to approximately 27mg/day — to support your expanding blood volume and baby\'s iron stores.' },
          items: [
            { label: 'What iron does', desc: 'Iron is essential for producing haemoglobin — the protein in red blood cells that carries oxygen. During pregnancy, you produce significantly more blood to supply the placenta and baby.', iconBg: 'rgba(217,96,154,0.12)', svgKey: 'heart' },
            { label: 'Symptoms of deficiency', desc: 'Extreme fatigue, breathlessness on mild exertion, pale skin, dizziness, heart palpitations, and difficulty concentrating are all signs of iron deficiency anaemia.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'star' },
            { label: 'Impact on baby', desc: 'Severe maternal anaemia is associated with premature birth, low birth weight, and reduced iron stores in the newborn — affecting their own development in the first year.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'check' },
            { label: 'When to test', desc: 'Blood tests for haemoglobin and ferritin are routine in the booking appointment and at around 28 weeks. Ask for results proactively — don\'t assume no news is good news.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'doc' },
          ],
          tip: { text: 'If prescribed iron supplements, take them on an empty stomach with orange juice for maximum absorption. If they cause constipation, ask your midwife about a lower-dose, gentler formulation.', source: 'MomsCare Health · Nutrition' }
    },
        2: {
          tag: 'Food Sources',
          title: 'Getting iron from food',
          intro: 'Iron comes in two forms — haem iron from animal sources, and non-haem iron from plant sources. Haem iron is significantly more bioavailable, but non-haem sources can be optimised through smart food pairing.',
          highlight: { label: 'Absorption booster', text: 'Vitamin C dramatically increases non-haem iron absorption — eating iron-rich plant foods alongside citrus, tomatoes, or peppers can increase absorption by up to 300%.' },
          items: [
            { label: 'Haem iron sources', desc: 'Red meat, liver (limit to once weekly due to vitamin A), poultry, and fish provide the most easily absorbed iron. Lean beef provides approximately 2.5mg per 100g serving.', iconBg: 'rgba(217,96,154,0.12)', svgKey: 'lunch' },
            { label: 'Plant-based iron sources', desc: 'Lentils, chickpeas, kidney beans, tofu, pumpkin seeds, quinoa, and dark leafy greens like spinach and kale are the best plant sources.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'leaf' },
            { label: 'Absorption inhibitors', desc: 'Tea, coffee, calcium, and phytates (found in whole grains and legumes) reduce iron absorption. Avoid tea or coffee within an hour of iron-rich meals.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'drop' },
            { label: 'Fortified foods', desc: 'Many breakfast cereals, breads, and plant milks are fortified with iron. Check labels — fortified cereals can provide 5–8mg per serving.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'vitamin' },
          ],
          tip: { text: 'A simple daily habit: add a small glass of orange juice to any iron-rich meal. This single change can meaningfully improve your iron status over weeks without any supplements.', source: 'MomsCare Health · Nutrition' },
        },
      },
      youTubeUrl: "https://www.youtube.com/watch?v=UKPsA6DDZEM",
      citation: { source: "WHO — Anaemia in Women and Children", author: "World Health Organization", year: "2024", url: "https://www.who.int/data/nutrition/nlis/info/anaemia" },
    },

    // ── 10. Pregnancy anxiety ─────────────────────────────────────────────
    anxiety: {
      title: 'Pregnancy anxiety: what\'s normal and what\'s not',
      readTime: 5,
      heroTag: 'Mental Health',
      heroImage: 'assets/icon/pregnancy anxiety.jpg',
      heroBg: 'linear-gradient(135deg, #f0e8ff 0%, #e0d8ff 100%)',
      accentColor: '#9b6fc4',
      accentBg: 'rgba(155,111,196,0.10)',
      highlightBg: 'rgba(155,111,196,0.07)',
      highlightBorder: 'rgba(155,111,196,0.20)',
      tipBg: 'rgba(155,111,196,0.07)',
      tipBorder: 'rgba(155,111,196,0.18)',
      tabs: [{ id: 1, label: 'Understanding It' }, { id: 2, label: 'Coping Strategies' }],
      panels: {
        1: {
          tag: 'Mental Health',
          title: 'Anxiety during pregnancy',
          intro: 'Worry is a near-universal experience in pregnancy. Concerns about the baby\'s health, birth, parenting, finances, and relationships are all common. But for some women, anxiety goes beyond ordinary worry and requires support.',
          highlight: { label: 'How common is it', text: 'Research suggests up to 20% of pregnant women experience clinically significant anxiety. Prenatal anxiety is actually more common than prenatal depression — but far less talked about.' },
          items: [
            { label: 'Normal pregnancy worry', desc: 'Concerns about the baby\'s health, upcoming birth, or ability to parent are extremely common and do not in themselves constitute an anxiety disorder.', iconBg: 'rgba(155,111,196,0.12)', svgKey: 'heart' },
            { label: 'When it becomes clinical', desc: 'Persistent worry that is difficult to control, disrupts daily life, causes physical symptoms, or intrudes on sleep and relationships may indicate an anxiety disorder.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'brain' },
            { label: 'Tokophobia', desc: 'An intense, specific fear of childbirth affects approximately 14% of pregnant women. It is a recognised phobia and can be effectively treated with psychological support.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'shield' },
            { label: 'Impact on pregnancy', desc: 'Severe untreated anxiety is associated with higher cortisol levels, which can affect fetal development and increase the risk of preterm birth. Seeking support is protective.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'star' },
          ],
          tip: { text: 'Tell your midwife how you are feeling at every appointment. There is no threshold of distress you need to reach before mentioning it — and effective support is available.', source: 'MomsCare Health · Mental Health' },
        },
        2: {
          tag: 'Coping',
          title: 'Evidence-based coping strategies',
          intro: 'Multiple effective strategies exist for managing anxiety in pregnancy. These range from self-help techniques grounded in evidence to professional support that can make a significant and lasting difference.',
          highlight: { label: 'CBT in pregnancy', text: 'Cognitive Behavioural Therapy (CBT) has the strongest evidence base for treating anxiety in pregnancy. Even brief courses of 6–8 sessions produce meaningful, lasting results.' },
          items: [
            { label: 'Diaphragmatic breathing', desc: 'Slow, deep breathing activates the parasympathetic nervous system and lowers cortisol within minutes. Practice 4 seconds in, hold 4, out for 6 — several times daily.', iconBg: 'rgba(155,111,196,0.12)', svgKey: 'breath' },
            { label: 'Information-seeking (with limits)', desc: 'Researching your worries can be reassuring, but excessive "googling" often amplifies anxiety. Set a rule: one trusted source, once per day, then close the tab.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'doc' },
            { label: 'Mindfulness practice', desc: 'Mindfulness-based cognitive therapy (MBCT) adapted for pregnancy is effective for both anxiety and depression. Apps like Headspace have specific pregnancy programmes.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'leaf' },
            { label: 'Professional support', desc: 'Your GP, midwife, or a perinatal mental health team can refer you for CBT, counselling, or medication if needed. Certain antidepressants are considered safe in pregnancy.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'talk' },
          ],
          tip: { text: 'Physical activity is one of the most effective anxiolytics available. Even a 20-minute daily walk significantly reduces anxiety symptoms by lowering cortisol and increasing endorphins.', source: 'MomsCare Health · Mental Health' },
        },
      },
      youTubeUrl: "https://www.youtube.com/watch?v=WWloIAQpMcQ",
      citation: { source: "Mind UK — Anxiety During Pregnancy", author: "Mind UK", year: "2024", url: "https://www.mind.org.uk/information-support/types-of-mental-health-problems/anxiety-and-panic-attacks/anxiety-and-pregnancy" },
    },

    // ── 11. Stages of labour ──────────────────────────────────────────────
    labour: {
      title: 'The stages of labour: what to expect',
      readTime: 7,
      heroTag: 'Labor',
      heroImage: 'assets/icon/stages of labour.jpg',
      heroBg: 'linear-gradient(135deg, #ffe0f0 0%, #f0d8ff 100%)',
      accentColor: '#e07eb8',
      accentBg: 'rgba(224,126,184,0.10)',
      highlightBg: 'rgba(224,126,184,0.07)',
      highlightBorder: 'rgba(224,126,184,0.20)',
      tipBg: 'rgba(224,126,184,0.07)',
      tipBorder: 'rgba(224,126,184,0.18)',
      tabs: [{ id: 1, label: 'Early & Active' }, { id: 2, label: 'Transition & Birth' }],
      panels: {
        1: {
          tag: 'Labour Stages',
          title: 'Early and active labour',
          intro: 'Labour unfolds in distinct stages, each with its own character and demands. Understanding what to expect at each stage helps you respond appropriately, reduces fear, and allows you to conserve energy for when it\'s needed most.',
          highlight: { label: 'When to go to hospital', text: 'Most midwives advise going to hospital when contractions are 3–4 minutes apart, lasting 45–60 seconds, and consistently strong for at least an hour — the "4-1-1" rule.' },
          items: [
            { label: 'Early labour (0–6cm)', desc: 'Contractions begin to establish a pattern — irregular at first, then gradually more frequent. The cervix effaces (thins) and begins to dilate. This phase can last many hours. Stay home, rest, and eat lightly.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'clock' },
            { label: 'Active labour (6–10cm)', desc: 'Contractions become longer, stronger, and closer together. You will need to focus through them. This is the most intense part of the first stage. Pain relief is most commonly requested here.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'wave' },
            { label: 'Position and movement', desc: 'Staying mobile and upright in early labour uses gravity to help baby descend and rotate. Rocking, kneeling, and walking all help progress and manage pain.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'breath' },
            { label: 'Pain relief options', desc: 'Gas and air (Entonox), warm water immersion, TENS machines, and epidurals are all available depending on your setting. Discuss your preferences in your birth plan.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'pill' },
          ],
          tip: { text: 'In early labour, rest as much as possible, eat easily digestible foods, and time contractions using an app. There is no benefit to going to hospital before active labour is established.', source: 'MomsCare Health · Labour & Birth' },
        },
        2: {
          tag: 'Birth',
          title: 'Transition and the birth of your baby',
          intro: 'The transition phase — typically between 8–10cm dilation — is the shortest and most intense part of labour. It is followed by the pushing phase, then the birth itself, then delivery of the placenta. Each phase has its own distinct character.',
          highlight: { label: 'Transition', text: 'Many women feel a sudden urge to give up or go home at transition. This is a reliable sign that birth is very close. Your support team and midwife can recognise and respond to this moment.' },
          items: [
            { label: 'Transition phase', desc: 'Contractions peak in intensity and frequency. Many women feel shaky, cold, nauseous, or overwhelmed. This phase rarely lasts longer than 30–60 minutes.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'wave' },
            { label: 'Pushing phase (2nd stage)', desc: 'Once fully dilated, you will feel the urge to push with contractions. This phase can last from minutes to a couple of hours. Breathing through pushes rather than "purple pushing" reduces perineal trauma.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'heart' },
            { label: 'The birth', desc: 'Your midwife will guide you through the final pushes. Skin-to-skin contact immediately after birth is strongly associated with breastfeeding success and bonding.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'hand' },
            { label: 'Third stage (placenta)', desc: 'The placenta is delivered 5–60 minutes after baby. A managed third stage (an injection to speed delivery) reduces postpartum haemorrhage risk by up to 60%.', iconBg: 'rgba(220,195,255,0.25)', svgKey: 'doc' },
          ],
          tip: { text: 'Delayed cord clamping — waiting at least 1–3 minutes before cutting the cord — allows significant transfer of iron-rich blood to your baby and is now standard practice in most hospitals.', source: 'MomsCare Health · Labour & Birth' },
        },
      },
      youTubeUrl: "https://www.youtube.com/watch?v=8YtCTFPBRFE",
      citation: { source: "NHS — Stages of Labour and Birth", author: "NHS UK", year: "2024", url: "https://www.nhs.uk/pregnancy/labour-and-birth/what-happens/the-stages-of-labour-and-birth" },
    },

    // ── 12. Hospital bag ──────────────────────────────────────────────────
    hospitalbag: {
      title: 'Hospital bag essentials: the complete list',
      readTime: 4,
      heroTag: 'Checklist',
      heroImage: 'assets/icon/Hospital Bag Essentials.jpg',
      heroBg: 'linear-gradient(135deg, #e0f5e8 0%, #d8f0ff 100%)',
      accentColor: '#6dbfbf',
      accentBg: 'rgba(109,191,191,0.10)',
      highlightBg: 'rgba(109,191,191,0.07)',
      highlightBorder: 'rgba(109,191,191,0.22)',
      tipBg: 'rgba(109,191,191,0.07)',
      tipBorder: 'rgba(109,191,191,0.20)',
      tabs: [{ id: 1, label: 'For You' }, { id: 2, label: 'For Baby' }],
      panels: {
        1: {
          tag: 'Preparation',
          title: 'What to pack for yourself',
          intro: 'Your hospital bag should be packed by week 36. Labour is unpredictable — having everything ready removes a source of stress and ensures you have what you need regardless of when or how quickly things progress.',
          highlight: { label: 'Pack early', text: 'Pack your bag by 36 weeks. One in five women delivers before their due date — premature labour can give little warning.' },
          items: [
            { label: 'Documentation', desc: 'Your maternity notes, birth plan, insurance card or health facility details, and a list of important contact numbers. Keep these together in a clear folder at the top of your bag.', iconBg: 'rgba(109,191,191,0.12)', svgKey: 'doc' },
            { label: 'Labour essentials', desc: 'TENS machine and spare batteries, a small speaker for music, massage oil or a massage roller, a small heat pack, lip balm (for gas-and-air dryness), and snacks for you and your birth partner.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'heart' },
            { label: 'Clothing', desc: 'A comfortable, loose labour gown or old nightdress, warm socks, a dressing gown, two to three changes of comfortable clothing for after birth, and a going-home outfit.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'bag' },
            { label: 'Postnatal essentials', desc: 'Maternity pads (take more than you think), comfortable underwear (disposable or dark cotton), nipple pads and lanolin cream if breastfeeding, and your usual toiletries and skincare.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'list' },
          ],
          tip: { text: 'Pack two bags if possible — one for labour and one for postnatal. Your birth partner can leave the postnatal bag in the car so the labour bag is light and easy to access in the early stages.', source: 'MomsCare Health · Birth Preparation' }
    },
        2: {
          tag: 'For Baby',
          title: 'What to pack for your baby',
          intro: 'Newborns need surprisingly little in the hospital, but having the right items ensures those first precious hours and days are as comfortable and smooth as possible.',
          highlight: { label: 'Car seat first', text: 'You cannot leave the hospital by car without an infant car seat properly fitted. Have it installed and checked before your due date — many fire stations offer free fitting checks.' },
          items: [
            { label: 'Clothing', desc: 'Vests (short-sleeved), sleepsuits with feet, and a going-home outfit appropriate for the season. Newborn sizing is often skipped — many babies fit 0–3 months from birth.', iconBg: 'rgba(109,191,191,0.12)', svgKey: 'check' },
            { label: 'Feeding supplies', desc: 'If breastfeeding: nursing bra and pads, breast shells if concerned about flat nipples. If formula feeding: pre-made formula cartons for hospital (easiest option), sterilised bottle and teat.', iconBg: 'rgba(224,126,184,0.12)', svgKey: 'drop' },
            { label: 'Nappies & wipes', desc: 'A pack of newborn nappies and unscented, alcohol-free water wipes. Hospitals often provide some, but bringing your own avoids any shortages on busy wards.', iconBg: 'rgba(181,127,212,0.12)', svgKey: 'leaf' },
            { label: 'Comfort & warmth', desc: 'A cellular cotton blanket for swaddling, a hat for immediately after birth (babies lose significant heat through their heads), and a muslin or two.', iconBg: 'rgba(185,225,240,0.35)', svgKey: 'heart' },
          ],
          tip: { text: 'Pre-wash all baby clothing and blankets in a gentle, fragrance-free detergent before packing. Newborn skin is extremely sensitive and can react to standard laundry products.', source: 'MomsCare Health · Birth Preparation' },
        },
      },
      youTubeUrl: "https://www.youtube.com/watch?v=ELqLTQSTANc",
      citation: { source: "NHS — What to Pack in Your Hospital Bag", author: "NHS UK", year: "2024", url: "https://www.nhs.uk/pregnancy/labour-and-birth/preparing-for-the-birth/what-to-pack-in-your-hospital-bag" },
    },

    // ── 13. BABY BRAIN DEVELOPMENT ───────────────────────────────────────
    babybrain: {
      title: 'The baby\'s brain: how it grows so fast',
      readTime: 6, heroTag: 'Development', heroImage: "assets/icon/baby brain growth.jpg",
      heroBg: 'linear-gradient(135deg,#ede8ff 0%,#d8e8ff 100%)',
      accentColor: '#9b6fc4', accentBg: 'rgba(155,111,196,0.10)',
      highlightBg: 'rgba(155,111,196,0.07)', highlightBorder: 'rgba(155,111,196,0.20)',
      tipBg: 'rgba(155,111,196,0.07)', tipBorder: 'rgba(155,111,196,0.18)',
      tabs: [{id:1,label:'Neural Growth'},{id:2,label:'What You Can Do'}],
      panels: {
        1: { tag:'Baby Development', title:'100 billion neurons before birth',
          intro:'Your baby\'s brain is the most complex structure in the known universe — and it is being assembled before birth, starting with a simple neural tube at just 3 weeks and growing to a fully formed brain with billions of connections by the third trimester.',
          highlight:{label:'Staggering speed',text:'During peak brain development, your baby\'s brain produces approximately 250,000 neurons per minute — that\'s more than 4,000 new brain cells every second.'},
          items:[
            {label:'Neural tube (wk 3–4)',desc:'The brain and spinal cord begin as a flat neural plate that folds and closes to form a tube. This is why folic acid is critical before and immediately after conception.',iconBg:'rgba(155,111,196,0.12)',svgKey:'brain'},
            {label:'Basic brain regions (wk 5–10)',desc:'The three primary brain regions — forebrain, midbrain, and hindbrain — are established by week 5. By week 10, the cortex begins to fold into its characteristic ridges.',iconBg:'rgba(224,126,184,0.12)',svgKey:'star'},
            {label:'Synaptic connections (wk 24+)',desc:'Neurons begin forming connections (synapses) at a rapid rate in the second half of pregnancy. The number of synapses formed prenatally rivals those formed in the first two years of life.',iconBg:'rgba(185,225,240,0.35)',svgKey:'eye'},
            {label:'Myelination (wk 28+)',desc:'The protective myelin sheath forms around nerve fibres in the third trimester, dramatically speeding up signal transmission. This process continues for years after birth.',iconBg:'rgba(220,195,255,0.25)',svgKey:'clock'},
          ],
          tip:{text:'DHA — a type of omega-3 fat — accounts for approximately 40% of the brain\'s total fat content. Found in oily fish and algae supplements, it is the most critical nutrient for fetal brain growth.',source:'MomsCare Health · Baby Development'}},
        2: { tag:'Nurturing Brain Growth', title:'How you can support your baby\'s brain',
          intro:'While genetics set the blueprint, the prenatal environment you create has measurable effects on your baby\'s brain development. Diet, stress levels, music, and language exposure all play documented roles.',
          highlight:{label:'Nutrition first',text:'Choline, found in eggs, liver, and soybeans, is essential for brain cell membrane formation. Most prenatal vitamins contain insufficient choline — check your supplement label.'},
          items:[
            {label:'Omega-3 fatty acids',desc:'DHA and EPA, found in oily fish and algae-based supplements, are the primary building blocks of neural tissue. Aim for two portions of low-mercury fish per week.',iconBg:'rgba(155,111,196,0.12)',svgKey:'fish'},
            {label:'Stress reduction',desc:'Chronic high cortisol crosses the placenta and can affect the developing stress response system in your baby\'s brain. Mindfulness, yoga, and social support measurably lower cortisol.',iconBg:'rgba(224,126,184,0.12)',svgKey:'leaf'},
            {label:'Language exposure',desc:'Reading aloud and talking to your bump in the third trimester exposes your baby to the rhythm and cadence of your language — a head-start that is measurably present at birth.',iconBg:'rgba(185,225,240,0.35)',svgKey:'talk'},
            {label:'Music and stimulation',desc:'Babies in the womb respond to music with heart rate changes and movement. Familiar melodies heard in utero are recognised and calming to newborns after birth.',iconBg:'rgba(220,195,255,0.25)',svgKey:'ear'},
          ],
          tip:{text:'Iodine is critical for thyroid function, which directly regulates fetal brain development. Many women are iodine-deficient without knowing it — check your prenatal vitamin contains at least 150mcg.',source:'MomsCare Health · Nutrition'}},
      },
      youTubeUrl: "https://www.youtube.com/watch?v=rpDhG-bMJiw",
      citation: { source: "Zero to Three — Brain Development", author: "Zero to Three", year: "2024", url: "https://www.zerotothree.org/resource/brain-development" },
    },

    // ── 14. WHEN BABY HEARS YOUR VOICE ───────────────────────────────────
    hearingvoice: {
      title: 'When does baby start to hear your voice?',
      readTime: 3, heroTag: 'Bonding', heroImage: "assets/icon/Baby's_hearing.jpg",
      heroBg: 'linear-gradient(135deg,#ffeef5 0%,#eee8ff 100%)',
      accentColor: '#d9609a', accentBg: 'rgba(217,96,154,0.10)',
      highlightBg: 'rgba(217,96,154,0.07)', highlightBorder: 'rgba(217,96,154,0.20)',
      tipBg: 'rgba(217,96,154,0.07)', tipBorder: 'rgba(217,96,154,0.18)',
      tabs: [{id:1,label:'Hearing Development'},{id:2,label:'Bonding Through Sound'}],
      panels: {
        1: { tag:'Bonding', title:'Your voice: your baby\'s first sound',
          intro:'Your voice is the first human sound your baby will ever hear — and they are listening long before they are born. The auditory system develops remarkably early, and your baby\'s hearing is functional well before the third trimester begins.',
          highlight:{label:'Recognition at birth',text:'In controlled studies, newborns consistently prefer recordings of their mother\'s voice over a stranger\'s — proving that auditory memory forms in the womb.'},
          items:[
            {label:'Cochlea forms (wk 10–14)',desc:'The inner ear begins its complex formation at week 10. The cochlea — the spiral structure responsible for converting sound to nerve signals — is structurally complete by week 20.',iconBg:'rgba(217,96,154,0.12)',svgKey:'ear'},
            {label:'First responses (wk 16–18)',desc:'At approximately week 16, babies begin responding to sound with body movements. By week 18, heart rate changes in response to sudden sounds are measurable.',iconBg:'rgba(224,126,184,0.12)',svgKey:'heart'},
            {label:'Full hearing (wk 24–28)',desc:'By week 24, the auditory cortex connects to the cochlea. Your baby can now process and react to complex sounds — including the melody of your voice.',iconBg:'rgba(185,225,240,0.35)',svgKey:'brain'},
            {label:'Sound filtering',desc:'Your voice is transmitted partly through your bones and body fluid, giving it a warmth and resonance that no external sound can replicate. It is the most familiar sound in your baby\'s world.',iconBg:'rgba(220,195,255,0.25)',svgKey:'wave'},
          ],
          tip:{text:'Your baby can distinguish your voice from your partner\'s by the third trimester. Having your partner speak regularly to the bump creates a second recognised voice that may ease the newborn\'s transition to the outside world.',source:'MomsCare Health · Bonding'}},
        2: { tag:'Bonding', title:'Using sound to bond before birth',
          intro:'The prenatal period offers a unique opportunity to begin forming the bond between you and your baby through sound. Research consistently shows that sound-based prenatal bonding has measurable effects on newborn behaviour and early attachment.',
          highlight:{label:'Language acquisition',text:'Babies born to mothers who read the same story aloud repeatedly in the third trimester show measurable recognition of that story\'s rhythm and cadence at birth.'},
          items:[
            {label:'Talking to your bump',desc:'From week 24, talking to your baby is meaningful. Use their name if you\'ve chosen one. Your baby hears the emotional cadence of your voice even if not every word.',iconBg:'rgba(217,96,154,0.12)',svgKey:'talk'},
            {label:'Reading aloud',desc:'Choose a short book to read regularly — the same one, consistently. By the third trimester, the familiar rhythm will be recognised at birth and can serve as a calming stimulus for your newborn.',iconBg:'rgba(224,126,184,0.12)',svgKey:'doc'},
            {label:'Singing',desc:'You do not need to be musical — your baby cannot evaluate pitch. Singing to your bump stimulates auditory development and creates an emotional connection that persists after birth.',iconBg:'rgba(185,225,240,0.35)',svgKey:'star'},
            {label:'Music choices',desc:'Calm, melodic music is most associated with positive fetal heart rate responses. Lullabies played consistently in the third trimester are recognisable calming stimuli to newborns.',iconBg:'rgba(220,195,255,0.25)',svgKey:'ear'},
          ],
          tip:{text:'Ask your partner or another key caregiver to also talk or sing to your bump regularly. Newborns show recognition of familiar voices beyond the mother, making early bonding easier for the whole family.',source:'MomsCare Health · Bonding'}},
      },
      youTubeUrl: "https://www.youtube.com/watch?v=Rba4pRu1P04",
      citation: { source: "Mayo Clinic — Fetal Development: MRI in Pregnancy", author: "Mayo Clinic Staff", year: "2024", url: "https://www.mayoclinic.org/healthy-lifestyle/pregnancy-week-by-week/in-depth/fetal-development/art-20046151" },
    },

    // ── 15. WHAT BABY IS DOING RIGHT NOW ─────────────────────────────────
    babynow: {
      title: 'What your baby is doing right now',
      readTime: 4, heroTag: 'Development', heroImage: 'assets/icon/fatal_movement2.jpg',
      heroBg: 'linear-gradient(135deg,#e8faf0 0%,#e0eeff 100%)',
      accentColor: '#6dbfbf', accentBg: 'rgba(109,191,191,0.10)',
      highlightBg: 'rgba(109,191,191,0.07)', highlightBorder: 'rgba(109,191,191,0.22)',
      tipBg: 'rgba(109,191,191,0.07)', tipBorder: 'rgba(109,191,191,0.20)',
      tabs: [{id:1,label:'Daily Activities'},{id:2,label:'Week 20 Focus'}],
      panels: {
        1: { tag:'Baby Development', title:'Life inside the womb',
          intro:'The womb is far from a quiet or still environment. Your baby is constantly active — moving, breathing, swallowing, sleeping, and even dreaming. Understanding what your baby does daily deepens the bond before birth.',
          highlight:{label:'Sleep cycles',text:'By the third trimester, your baby has defined sleep–wake cycles of approximately 20–40 minutes. You may notice predictable patterns of activity and quiet throughout the day.'},
          items:[
            {label:'Practising breathing',desc:'From around week 10, your baby makes breathing movements even though the lungs are filled with amniotic fluid. These movements strengthen the respiratory muscles for breathing at birth.',iconBg:'rgba(109,191,191,0.12)',svgKey:'breath'},
            {label:'Swallowing and tasting',desc:'Your baby swallows up to a litre of amniotic fluid per day in the third trimester, tasting the flavours of what you eat and regulating the fluid level around them.',iconBg:'rgba(224,126,184,0.12)',svgKey:'drop'},
            {label:'Sucking and hand-to-mouth',desc:'From week 15, babies bring their hands to their mouths and practise sucking — the reflex that will allow them to feed immediately after birth.',iconBg:'rgba(181,127,212,0.12)',svgKey:'hand'},
            {label:'Dreaming (wk 28+)',desc:'REM sleep — the stage in which dreaming occurs — is present in your baby from approximately week 28. The neural activity is measurably similar to adult REM sleep.',iconBg:'rgba(185,225,240,0.35)',svgKey:'moon'},
          ],
          tip:{text:'Your baby responds to your emotional state. When you laugh, your body\'s rhythmic movement is calming to baby. High-stress episodes release cortisol that crosses the placenta — another reason to prioritise your own wellbeing.',source:'MomsCare Health · Baby Development'}},
        2: { tag:'Week 20', title:'Development at the halfway point',
          intro:'At week 20, you are exactly at the halfway point of your pregnancy. Your baby is now about 16cm long and weighs approximately 300g — and is remarkably busy inside the womb with new developmental milestones every day.',
          highlight:{label:'The anatomy scan',text:'Week 18–21 is the window for the detailed anomaly scan, which checks all of your baby\'s major organs, the spine, limbs, placenta position, and amniotic fluid levels.'},
          items:[
            {label:'Vernix caseosa',desc:'A thick, waxy coating now covers your baby\'s skin. This protective layer prevents the skin from becoming waterlogged in the amniotic fluid and provides protection during delivery.',iconBg:'rgba(109,191,191,0.12)',svgKey:'star'},
            {label:'Lanugo hair',desc:'Fine, downy lanugo hair covers your baby\'s entire body at week 20. It helps the vernix stick to the skin and is usually shed before birth, though some babies are born with patches.',iconBg:'rgba(224,126,184,0.12)',svgKey:'leaf'},
            {label:'Gender development',desc:'By week 20, the external genitalia are well-formed and visible on ultrasound. If you choose to find out the sex, this is typically visible at the anomaly scan.',iconBg:'rgba(181,127,212,0.12)',svgKey:'eye'},
            {label:'Fingerprints forming',desc:'Your baby\'s unique fingerprints form between weeks 17–20, determined by the unique pressure and growth patterns of each individual finger during development.',iconBg:'rgba(185,225,240,0.35)',svgKey:'hand'},
          ],
          tip:{text:'At the anomaly scan, ask your sonographer to explain what they are seeing as they go. Most parents find the scan deeply emotional — taking video or still images to share with family is a meaningful keepsake.',source:'MomsCare Health · Baby Development'}},
      },
      youTubeUrl: "https://www.youtube.com/watch?v=x6GX4ZY-Rp0",
      citation: { source: "Mayo Clinic — Fetal Development Week by Week", author: "Mayo Clinic Staff", year: "2024", url: "https://www.mayoclinic.org/healthy-lifestyle/pregnancy-week-by-week/in-depth/fetal-development/art-20046151" },
    },

    // ── 16. FOODS THAT SUPPORT BABY'S BRAIN ─────────────────────────────
    brainfoods: {
      title: 'Foods that support baby\'s brain development',
      readTime: 5, heroTag: 'Nutrition', heroImage: 'assets/icon/foods_brain development.jpg',
      heroBg: 'linear-gradient(135deg,#e8ffe8 0%,#d8f5e8 100%)',
      accentColor: '#5bba8a', accentBg: 'rgba(91,186,138,0.10)',
      highlightBg: 'rgba(91,186,138,0.07)', highlightBorder: 'rgba(91,186,138,0.22)',
      tipBg: 'rgba(91,186,138,0.07)', tipBorder: 'rgba(91,186,138,0.20)',
      tabs: [{id:1,label:'Key Nutrients'},{id:2,label:'Best Food Sources'}],
      panels: {
        1: { tag:'Nutrition', title:'The nutrients that build your baby\'s brain',
          intro:'Your baby\'s brain undergoes its most critical development during pregnancy. What you eat directly influences the quantity and quality of neural connections being formed — making nutrition one of the most powerful tools you have.',
          highlight:{label:'Most critical window',text:'The third trimester sees the most rapid brain growth. DHA — a type of omega-3 fat — accounts for approximately 40% of the brain\'s total fat content and must come from your diet.'},
          items:[
            {label:'DHA (omega-3)',desc:'The most critical structural fat for neural development. DHA is incorporated directly into brain cell membranes and the retina. Found in oily fish, algae oil, and walnuts.',iconBg:'rgba(91,186,138,0.12)',svgKey:'fish'},
            {label:'Choline',desc:'Essential for the formation of the neural tube and brain cell membranes. Most prenatal vitamins contain insufficient choline. Found in eggs (especially yolk), liver, and soybeans.',iconBg:'rgba(224,126,184,0.12)',svgKey:'vitamin'},
            {label:'Iodine',desc:'Regulates thyroid hormones essential for brain development. Deficiency is one of the leading preventable causes of cognitive impairment. Found in dairy, seafood, and iodised salt.',iconBg:'rgba(185,225,240,0.35)',svgKey:'star'},
            {label:'Folate',desc:'Critical for neural tube closure in the first 28 days of pregnancy — often before a woman knows she is pregnant. Also supports ongoing neural development throughout pregnancy.',iconBg:'rgba(220,195,255,0.25)',svgKey:'leaf'},
          ],
          tip:{text:'If you do not eat fish, an algae-based DHA supplement provides the same omega-3 as fish (fish get their DHA from algae). Look for a supplement providing at least 200mg DHA per day.',source:'MomsCare Health · Nutrition'}},
        2: { tag:'Food Sources', title:'Building a brain-supporting diet',
          intro:'Meeting your baby\'s brain development needs does not require an exotic or expensive diet. A varied, whole-food diet built around these key food groups will deliver the nutrients needed for optimal neural development.',
          highlight:{label:'Eggs — nature\'s prenatal supplement',text:'Two eggs provide approximately 250mg of choline, significant DHA, and nearly all essential vitamins and minerals. They are one of the most nutritionally complete foods available in pregnancy.'},
          items:[
            {label:'Oily fish (2x weekly)',desc:'Salmon, sardines, mackerel, and trout are the richest sources of DHA. Limit tuna to 2 cans or one fresh steak per week due to mercury. Avoid shark, swordfish, and marlin entirely.',iconBg:'rgba(91,186,138,0.12)',svgKey:'fish'},
            {label:'Eggs and dairy',desc:'Two eggs daily provides significant choline and DHA. Full-fat dairy provides iodine, calcium, and vitamin D — all essential for bone and brain development.',iconBg:'rgba(224,126,184,0.12)',svgKey:'lunch'},
            {label:'Dark leafy greens',desc:'Spinach, kale, and broccoli provide folate, iron, and calcium. Steam or lightly sauté rather than boiling to preserve water-soluble nutrients.',iconBg:'rgba(185,225,240,0.35)',svgKey:'leaf'},
            {label:'Nuts and seeds',desc:'Walnuts are the richest plant source of ALA omega-3. Pumpkin seeds provide zinc and magnesium. Brazil nuts provide selenium — important for thyroid function and immune health.',iconBg:'rgba(220,195,255,0.25)',svgKey:'star'},
          ],
          tip:{text:'A Mediterranean-style diet — rich in oily fish, olive oil, legumes, whole grains, and vegetables — is consistently associated with the best pregnancy and developmental outcomes in research.',source:'MomsCare Health · Nutrition'}},
      },
      youTubeUrl: "https://www.youtube.com/watch?v=o7HNKvWqNQw",
      citation: { source: "Harvard Health — Nutrition During Pregnancy", author: "Harvard Health Publishing", year: "2024", url: "https://www.health.harvard.edu/blog/nutrition-during-pregnancy-2017112612666" },
    },

    // ── 17. STAYING HYDRATED ─────────────────────────────────────────────
    hydration: {
      title: 'Staying hydrated: more important than you think',
      readTime: 3, heroTag: 'Wellness', heroImage: 'assets/icon/Hydration and Pregnancy.jpg',
      heroBg: 'linear-gradient(135deg,#e0f5ff 0%,#d5eeff 100%)',
      accentColor: '#5b8fd4', accentBg: 'rgba(91,143,212,0.10)',
      highlightBg: 'rgba(91,143,212,0.06)', highlightBorder: 'rgba(91,143,212,0.20)',
      tipBg: 'rgba(91,143,212,0.06)', tipBorder: 'rgba(91,143,212,0.18)',
      tabs: [{id:1,label:'Why Water Matters'},{id:2,label:'Staying on Track'}],
      panels: {
        1: { tag:'Wellness', title:'Hydration and your pregnancy',
          intro:'Water requirements increase significantly during pregnancy. Your body is producing additional blood, supporting the amniotic fluid, and fuelling the placenta. Even mild dehydration has measurable effects on pregnancy.',
          highlight:{label:'Amniotic fluid',text:'Your amniotic fluid is almost entirely water and is completely replenished every three hours. Your fluid intake directly and immediately affects the volume of amniotic fluid surrounding your baby.'},
          items:[
            {label:'Blood volume support',desc:'Your blood volume increases by up to 50% in pregnancy. Adequate water intake is essential to produce this additional blood and maintain healthy circulation to the placenta.',iconBg:'rgba(91,143,212,0.12)',svgKey:'heart'},
            {label:'Nutrient transport',desc:'Vitamins, minerals, and oxygen are transported to your baby via the bloodstream. Dehydration reduces blood volume and can impair nutrient delivery to the placenta.',iconBg:'rgba(224,126,184,0.12)',svgKey:'drop'},
            {label:'Constipation prevention',desc:'Progesterone slows digestion, making constipation very common in pregnancy. Adequate hydration is the single most effective non-pharmacological way to prevent it.',iconBg:'rgba(185,225,240,0.35)',svgKey:'leaf'},
            {label:'Braxton Hicks and UTIs',desc:'Dehydration is a leading trigger of Braxton Hicks contractions and significantly increases the risk of urinary tract infections — which are both more common and more dangerous in pregnancy.',iconBg:'rgba(220,195,255,0.25)',svgKey:'shield'},
          ],
          tip:{text:'Urine colour is the easiest hydration indicator. Aim for pale straw-yellow. Dark yellow indicates dehydration. Clear urine may indicate overhydration, which can dilute essential electrolytes.',source:'MomsCare Health · Wellness'}},
        2: { tag:'Practical Tips', title:'How to meet your daily hydration needs',
          intro:'The recommended water intake during pregnancy is approximately 2.3 litres (around 8–10 glasses) per day, including water in food. This increases further in hot weather, during exercise, or when experiencing vomiting.',
          highlight:{label:'Not just water',text:'All fluids count towards your daily intake — including herbal teas, milk, fruit-infused water, soups, and the water content in food (fruits and vegetables are 80–95% water).'},
          items:[
            {label:'Morning hydration habit',desc:'Begin each day with a large glass of water before anything else. This replaces fluid lost overnight and establishes a positive routine that carries through the day.',iconBg:'rgba(91,143,212,0.12)',svgKey:'sun'},
            {label:'Safe drinks in pregnancy',desc:'Water, pasteurised milk, coconut water, and most herbal teas are safe. Limit caffeinated beverages to 200mg caffeine per day (approximately 2 cups of coffee). Avoid unpasteurised juices.',iconBg:'rgba(224,126,184,0.12)',svgKey:'check'},
            {label:'Making water more appealing',desc:'If plain water is unappealing — common with nausea — try cold water with cucumber and mint, lemon slices, or diluted fruit juice. Ice chips can help if liquid aversion is severe.',iconBg:'rgba(185,225,240,0.35)',svgKey:'star'},
            {label:'Signs of dehydration',desc:'Headache, dizziness, dark urine, reduced fetal movement, Braxton Hicks, and extreme thirst are all signs to increase your fluid intake immediately and rest.',iconBg:'rgba(220,195,255,0.25)',svgKey:'shield'},
          ],
          tip:{text:'Keep a 1-litre water bottle visible at your desk, bedside, and in your bag. Visual cues are one of the most effective strategies for increasing water intake consistently throughout the day.',source:'MomsCare Health · Wellness'}},
      },
      youTubeUrl: "https://www.youtube.com/watch?v=GiUZ-jEfmH4",
      citation: { source: "American College of Obstetricians and Gynecologists — Nutrition During Pregnancy", author: "ACOG", year: "2024", url: "https://www.acog.org/womens-health/faqs/nutrition-during-pregnancy" },
    },

    // ── 18. MORNING SICKNESS ─────────────────────────────────────────────
    morningsickness: {
      title: 'Morning sickness: foods that actually help',
      readTime: 4, heroTag: 'Symptoms', heroImage: 'assets/icon/morning sickness foods.jpg',
      heroBg: 'linear-gradient(135deg,#fff5e8 0%,#ffe8e8 100%)',
      accentColor: '#e07eb8', accentBg: 'rgba(224,126,184,0.10)',
      highlightBg: 'rgba(224,126,184,0.07)', highlightBorder: 'rgba(224,126,184,0.20)',
      tipBg: 'rgba(224,126,184,0.07)', tipBorder: 'rgba(224,126,184,0.18)',
      tabs: [{id:1,label:'Why It Happens'},{id:2,label:'Relief Strategies'}],
      panels: {
        1: { tag:'Symptoms', title:'Understanding morning sickness',
          intro:'Morning sickness — despite its misleading name — can strike at any time of day or night and affects up to 80% of pregnant women. For most it peaks between weeks 6–12, but for some it persists much longer.',
          highlight:{label:'Hyperemesis gravidarum',text:'Approximately 1–3% of pregnant women develop severe, unrelenting vomiting that causes dehydration and weight loss requiring medical treatment. If you cannot keep any fluids down for 24 hours, contact your midwife immediately.'},
          items:[
            {label:'The hCG connection',desc:'Human chorionic gonadotropin (hCG) — the hormone detected by pregnancy tests — is the primary driver of nausea. It peaks around weeks 9–10, which correlates with when nausea is typically worst.',iconBg:'rgba(224,126,184,0.12)',svgKey:'star'},
            {label:'Heightened smell sensitivity',desc:'Oestrogen dramatically amplifies your sense of smell in early pregnancy. Smells that previously seemed neutral — cooking oil, coffee, cleaning products — can trigger immediate nausea.',iconBg:'rgba(181,127,212,0.12)',svgKey:'wave'},
            {label:'Slow gastric emptying',desc:'Progesterone slows the movement of food through your digestive system. Food sitting in your stomach longer increases nausea, which is why eating small amounts frequently often helps.',iconBg:'rgba(185,225,240,0.35)',svgKey:'clock'},
            {label:'Blood sugar fluctuations',desc:'Low blood sugar — common when the stomach is empty, particularly in the morning after overnight fasting — significantly worsens nausea. Eating before getting out of bed can help.',iconBg:'rgba(220,195,255,0.25)',svgKey:'chart'},
          ],
          tip:{text:'Keep plain crackers or dry toast on your bedside table. Eating a few before getting up in the morning prevents the blood sugar dip that makes morning nausea significantly worse.',source:'MomsCare Health · Symptoms'}},
        2: { tag:'Relief', title:'Practical nausea management',
          intro:'While there is no single solution that works for every woman, a combination of dietary adjustments, lifestyle changes, and safe remedies can significantly reduce the impact of morning sickness on daily life.',
          highlight:{label:'Ginger — the evidence is strong',text:'Multiple randomised controlled trials have shown ginger to be significantly more effective than placebo for reducing nausea in pregnancy. 1g of ginger daily in any form is the researched dose.'},
          items:[
            {label:'Small, frequent meals',desc:'Eating every 1–2 hours prevents the empty-stomach blood sugar drops that trigger nausea. Choose bland, low-fat, easily digestible foods such as crackers, rice, toast, and banana.',iconBg:'rgba(224,126,184,0.12)',svgKey:'lunch'},
            {label:'Cold foods over hot',desc:'Hot food releases more aroma — and smell is a powerful nausea trigger. Cold or room-temperature foods like yoghurt, sandwiches, and cold pasta are often much better tolerated.',iconBg:'rgba(181,127,212,0.12)',svgKey:'star'},
            {label:'Ginger in all forms',desc:'Ginger tea, ginger biscuits, crystallised ginger, and ginger capsules have all been shown effective. Avoid ginger tablets exceeding 1g per day without medical advice.',iconBg:'rgba(185,225,240,0.35)',svgKey:'leaf'},
            {label:'Vitamin B6 supplementation',desc:'Vitamin B6 (pyridoxine) at 25mg three times daily is recommended by many obstetric guidelines for nausea in pregnancy. It can be taken alongside antihistamines if symptoms are severe.',iconBg:'rgba(220,195,255,0.25)',svgKey:'vitamin'},
          ],
          tip:{text:'Identify your specific smell triggers and eliminate them where possible — ask your partner to cook if cooking smells trigger nausea, and switch to fragrance-free toiletries and cleaning products.',source:'MomsCare Health · Symptoms'}},
      },
      youTubeUrl: "https://www.youtube.com/watch?v=u0EFfmq8qSg",
      citation: { source: "NHS — Vomiting and Morning Sickness in Pregnancy", author: "NHS UK", year: "2024", url: "https://www.nhs.uk/pregnancy/related-conditions/common-symptoms/vomiting-and-morning-sickness" },
    },

    // ── 19. EMOTIONAL CHANGES ────────────────────────────────────────────
    emotions: {
      title: 'Why you might feel more emotional right now',
      readTime: 4, heroTag: 'Emotions', heroImage: 'assets/icon/emotional during pregnancy.jpg',
      heroBg: 'linear-gradient(135deg,#ffe8f0 0%,#f0e0ff 100%)',
      accentColor: '#e07eb8', accentBg: 'rgba(224,126,184,0.10)',
      highlightBg: 'rgba(224,126,184,0.07)', highlightBorder: 'rgba(224,126,184,0.20)',
      tipBg: 'rgba(224,126,184,0.07)', tipBorder: 'rgba(224,126,184,0.18)',
      tabs: [{id:1,label:'The Hormone Story'},{id:2,label:'Emotional Wellbeing'}],
      panels: {
        1: { tag:'Emotions', title:'Your emotional landscape in pregnancy',
          intro:'Heightened emotions during pregnancy are not a sign of weakness or instability — they are a direct physiological consequence of the most dramatic hormonal environment the human body ever experiences.',
          highlight:{label:'The scale of change',text:'Oestrogen levels increase 100-fold during pregnancy. Progesterone increases 10-fold. These are the same hormones that drive emotional changes of the menstrual cycle — multiplied enormously.'},
          items:[
            {label:'Oestrogen and mood',desc:'Oestrogen influences serotonin, dopamine, and noradrenaline — the brain\'s key mood-regulating neurotransmitters. The dramatic rise in oestrogen in pregnancy directly affects emotional sensitivity and reactivity.',iconBg:'rgba(224,126,184,0.12)',svgKey:'brain'},
            {label:'Progesterone and tearfulness',desc:'Progesterone has a GABAergic effect — similar to a mild sedative or anxiolytic. As levels fluctuate, they can cause tearfulness, low mood, and heightened sensitivity.',iconBg:'rgba(181,127,212,0.12)',svgKey:'moon'},
            {label:'Oxytocin surges',desc:'Oxytocin — the bonding hormone — rises throughout pregnancy. This can create powerful waves of love and protectiveness, but also amplified grief or sadness in difficult moments.',iconBg:'rgba(185,225,240,0.35)',svgKey:'heart'},
            {label:'Identity and grief',desc:'Becoming a parent involves the loss of a previous identity — a psychological phenomenon called matrescence. Feeling grief, ambivalence, or fear alongside joy is entirely normal.',iconBg:'rgba(220,195,255,0.25)',svgKey:'star'},
          ],
          tip:{text:'Naming your emotions — literally saying "I am feeling overwhelmed" — activates the prefrontal cortex and reduces the intensity of limbic emotional responses. It is a scientifically validated technique.',source:'MomsCare Health · Emotions'}},
        2: { tag:'Support', title:'Protecting your emotional wellbeing',
          intro:'Your emotional health is as important as your physical health in pregnancy. The two are not separate — chronic psychological distress has measurable physical effects on both you and your developing baby.',
          highlight:{label:'Seek help without threshold',text:'You do not need to be in crisis to ask for support. Mentioning low mood or anxiety to your midwife at any appointment opens the door to resources you may not know are available.'},
          items:[
            {label:'Social connection',desc:'Isolation amplifies negative emotions. Even one meaningful conversation per day provides measurable protection against prenatal depression.',iconBg:'rgba(224,126,184,0.12)',svgKey:'couple'},
            {label:'Journaling',desc:'Expressive writing — 20 minutes describing your thoughts and feelings — reduces cortisol and processes difficult emotions more effectively than suppression.',iconBg:'rgba(181,127,212,0.12)',svgKey:'doc'},
            {label:'Physical activity',desc:'Exercise releases endorphins, reduces cortisol, and improves sleep quality — three of the most powerful influences on emotional wellbeing. Even gentle walking delivers these benefits.',iconBg:'rgba(185,225,240,0.35)',svgKey:'breath'},
            {label:'Perinatal support services',desc:'Specialist perinatal mental health services support women with depression, anxiety, OCD, trauma history, and other mental health challenges during pregnancy and the postpartum period.',iconBg:'rgba(220,195,255,0.25)',svgKey:'talk'},
          ],
          tip:{text:'If your partner is struggling to understand your emotional experience, share information about the hormonal changes happening in your body. Most people respond with far more empathy when they understand the biological basis.',source:'MomsCare Health · Emotions'}},
      },
      youTubeUrl: "https://www.youtube.com/watch?v=F5BHGhB4A5g",
      citation: { source: "Mind UK — Perinatal Mental Health", author: "Mind UK", year: "2024", url: "https://www.mind.org.uk/information-support/types-of-mental-health-problems/postnatal-depression-and-perinatal-mental-health/about-perinatal-mental-health" },
    },

    // ── 20. PREGNANCY INSOMNIA ────────────────────────────────────────────
    insomnia: {
      title: 'Pregnancy insomnia: causes and solutions',
      readTime: 4, heroTag: 'Sleep', heroImage: 'assets/icon/pregnancy insonnia.jpg',
      heroBg: 'linear-gradient(135deg,#eae8ff 0%,#d8e4ff 100%)',
      accentColor: '#9b6fc4', accentBg: 'rgba(155,111,196,0.10)',
      highlightBg: 'rgba(155,111,196,0.07)', highlightBorder: 'rgba(155,111,196,0.20)',
      tipBg: 'rgba(155,111,196,0.07)', tipBorder: 'rgba(155,111,196,0.18)',
      tabs: [{id:1,label:'Why Sleep Changes'},{id:2,label:'Better Sleep Solutions'}],
      panels: {
        1: { tag:'Sleep', title:'Why pregnancy disrupts your sleep',
          intro:'Poor sleep is among the most common complaints of pregnancy — affecting approximately 78% of pregnant women at some point. Sleep architecture changes significantly during pregnancy, and different trimesters bring different challenges.',
          highlight:{label:'Sleep matters',text:'Chronic sleep deprivation in the third trimester is associated with longer labours, higher rates of caesarean section, and slower postpartum recovery. Protecting your sleep is a medical priority.'},
          items:[
            {label:'First trimester: progesterone',desc:'Progesterone has a sedating effect during the day but disrupts deep sleep at night. You may feel constantly tired yet unable to achieve restorative sleep quality.',iconBg:'rgba(155,111,196,0.12)',svgKey:'moon'},
            {label:'Physical discomfort (all trimesters)',desc:'Back pain, pelvic pressure, round ligament pain, heartburn, and leg cramps all disrupt overnight sleep. These issues compound as the pregnancy progresses.',iconBg:'rgba(224,126,184,0.12)',svgKey:'bone'},
            {label:'Frequent urination',desc:'Increased kidney filtration and, later, direct pressure on the bladder from your growing uterus causes frequent night waking. This is one of the most disruptive sleep factors.',iconBg:'rgba(185,225,240,0.35)',svgKey:'drop'},
            {label:'Restless legs syndrome',desc:'RLS affects approximately 26% of pregnant women — causing an uncomfortable urge to move the legs, particularly at night. It is associated with iron and folate deficiency.',iconBg:'rgba(220,195,255,0.25)',svgKey:'wave'},
          ],
          tip:{text:'Reduce fluid intake in the 2–3 hours before bed to minimise night-time urination while still meeting your daily hydration needs by drinking more in the morning and afternoon.',source:'MomsCare Health · Sleep'}},
        2: { tag:'Sleep Solutions', title:'Evidence-based sleep improvements',
          intro:'While pregnancy sleep disruption cannot be entirely eliminated, a combination of sleep hygiene practices, positioning strategies, and physical adjustments can make a significant difference to sleep quality and duration.',
          highlight:{label:'Left-side sleeping',text:'Sleeping on your left side after 28 weeks is recommended to maximise blood flow to the placenta and kidneys. A pillow between your knees and under your bump makes this position easier.'},
          items:[
            {label:'Pregnancy pillow',desc:'A full-length body pillow or C-shaped pregnancy pillow provides support for the bump, back, hips, and knees simultaneously — significantly improving comfort and reducing position changes.',iconBg:'rgba(155,111,196,0.12)',svgKey:'bed'},
            {label:'Heartburn management',desc:'Eat your last meal at least 3 hours before bed. Elevate your head by 15–20cm using a wedge pillow. Avoid trigger foods (spicy, fatty, citrus) in the evening.',iconBg:'rgba(224,126,184,0.12)',svgKey:'shield'},
            {label:'Temperature regulation',desc:'Your metabolic rate is elevated in pregnancy, making you feel warmer. A bedroom temperature of 16–18°C is optimal for sleep. A fan, lighter bedding, and moisture-wicking sleepwear all help.',iconBg:'rgba(185,225,240,0.35)',svgKey:'sun'},
            {label:'Anxiety and the mind',desc:'Worry about the birth, baby\'s health, and parenthood are common causes of lying awake. A 10-minute "worry journal" before bed — writing concerns and planned responses — significantly reduces overnight rumination.',iconBg:'rgba(220,195,255,0.25)',svgKey:'brain'},
          ],
          tip:{text:'Daytime naps of 20–30 minutes can compensate for fragmented overnight sleep without disrupting your circadian rhythm. The early afternoon is the ideal nap window — avoid napping after 3pm.',source:'MomsCare Health · Sleep'}},
      },
      youTubeUrl: "https://www.youtube.com/watch?v=0sBoQL0MZMU",
      citation: { source: "Sleep Foundation — Pregnancy and Sleep", author: "Sleep Foundation", year: "2024", url: "https://www.sleepfoundation.org/pregnancy" },
    },

    // ── 21. BUILDING A SUPPORT SYSTEM ────────────────────────────────────
    supportsystem: {
      title: 'Building a support system before birth',
      readTime: 4, heroTag: 'Wellness', heroImage: 'assets/icon/building support system.jpg',
      heroBg: 'linear-gradient(135deg,#e8f5f0 0%,#e0f0ff 100%)',
      accentColor: '#6dbfbf', accentBg: 'rgba(109,191,191,0.10)',
      highlightBg: 'rgba(109,191,191,0.07)', highlightBorder: 'rgba(109,191,191,0.22)',
      tipBg: 'rgba(109,191,191,0.07)', tipBorder: 'rgba(109,191,191,0.20)',
      tabs: [{id:1,label:'Why It Matters'},{id:2,label:'Building Your Network'}],
      panels: {
        1: { tag:'Wellness', title:'The importance of your support network',
          intro:'Research consistently shows that social support is one of the most protective factors in pregnancy — reducing stress hormones, lowering the risk of preterm birth, and significantly improving postpartum outcomes. Building it before birth is far easier than building it after.',
          highlight:{label:'Research finding',text:'Women with strong social support networks have significantly lower rates of preterm birth, postpartum depression, and breastfeeding difficulties than those who report feeling isolated.'},
          items:[
            {label:'Cortisol reduction',desc:'Feeling genuinely supported lowers cortisol — the stress hormone that, at chronically elevated levels, is associated with preterm labour and low birth weight. Social connection is biologically protective.',iconBg:'rgba(109,191,191,0.12)',svgKey:'heart'},
            {label:'Practical help',desc:'The postpartum period brings a genuine physical and logistical challenge. Having people identified and willing to help with meals, household tasks, and errands makes a measurable difference.',iconBg:'rgba(224,126,184,0.12)',svgKey:'check'},
            {label:'Emotional buffer',desc:'People with at least one person who truly understands their experience report lower rates of perinatal anxiety and depression. Being heard and validated is a genuine physiological and psychological need.',iconBg:'rgba(185,225,240,0.35)',svgKey:'talk'},
            {label:'Shared experience',desc:'Other pregnant women and mothers are often the most practical source of information about local services and what actually helps. Antenatal classes build this connection intentionally.',iconBg:'rgba(220,195,255,0.25)',svgKey:'couple'},
          ],
          tip:{text:'Join an antenatal class — not just for the information, but for the relationships. The women you meet there often become the most important peer support network of early parenthood.',source:'MomsCare Health · Wellness'}},
        2: { tag:'Practical Steps', title:'How to build your network',
          intro:'Building a support network requires intentionality — especially for women who are private, who have moved away from family, or who are having their first baby. These practical steps make the process manageable.',
          highlight:{label:'The village concept',text:'The saying "it takes a village to raise a child" reflects a biological reality. Humans evolved to raise children communally. Modern isolation from extended family is a significant risk factor for perinatal mental health challenges.'},
          items:[
            {label:'Identify your people',desc:'List the people already in your life who are supportive, available, and positive. Quality over quantity matters more than a large but unreliable network.',iconBg:'rgba(109,191,191,0.12)',svgKey:'person'},
            {label:'Communicate your needs',desc:'People often want to help but don\'t know how. Be specific: "Could you bring a meal on Tuesdays?" is far more actionable than a vague "Let me know if you need anything."',iconBg:'rgba(224,126,184,0.12)',svgKey:'talk'},
            {label:'Join a prenatal group',desc:'Antenatal classes, pregnancy yoga, swimming, or local bump groups all provide connection with other women at the same life stage. These connections often outlast the pregnancy.',iconBg:'rgba(185,225,240,0.35)',svgKey:'couple'},
            {label:'Online communities',desc:'Evidence-based online pregnancy communities can supplement in-person support, particularly useful for those with limited local networks. Choose moderated communities with a positive, evidence-based culture.',iconBg:'rgba(220,195,255,0.25)',svgKey:'doc'},
          ],
          tip:{text:'Schedule regular check-ins with your key support people before birth — a weekly call or coffee. Maintaining relationships takes effort in pregnancy. Investing now means those relationships are strong when you need them most.',source:'MomsCare Health · Wellness'}},
      },
      youTubeUrl: "https://www.youtube.com/watch?v=6RBKLdGTkqE",
      citation: { source: "Tommy's — Mental Health in Pregnancy", author: "Tommy's", year: "2024", url: "https://www.tommys.org/pregnancy-information/health-information-pregnancy/mental-health-in-pregnancy" },
    },

    // ── 22. BIRTH PLAN ────────────────────────────────────────────────────
    birthplan: {
      title: 'Building your birth plan step by step',
      readTime: 5, heroTag: 'Planning', heroImage: 'assets/icon/birth plan.jpg',
      heroBg: 'linear-gradient(135deg,#e8e8ff 0%,#d8e0ff 100%)',
      accentColor: '#5b8fd4', accentBg: 'rgba(91,143,212,0.10)',
      highlightBg: 'rgba(91,143,212,0.06)', highlightBorder: 'rgba(91,143,212,0.20)',
      tipBg: 'rgba(91,143,212,0.06)', tipBorder: 'rgba(91,143,212,0.18)',
      tabs: [{id:1,label:'What to Include'},{id:2,label:'Communicating It'}],
      panels: {
        1: { tag:'Planning', title:'Crafting your birth preferences',
          intro:'A birth plan — more accurately called a birth preferences document — is a written communication of your wishes for labour, birth, and the immediate postpartum period. It is a communication tool that helps your care team understand your priorities.',
          highlight:{label:'Flexibility is key',text:'A birth plan is most effective when it includes preferences for multiple scenarios — including outcomes you hadn\'t hoped for. A plan that only covers one type of birth leaves you unheard if things change.'},
          items:[
            {label:'Labour environment',desc:'Your preferences for lighting, music, scent, visitors, photography, and who you want (or don\'t want) in the room. Also include whether you want to be asked before students or observers are present.',iconBg:'rgba(91,143,212,0.12)',svgKey:'star'},
            {label:'Pain relief preferences',desc:'Your current thoughts on pain management — keeping an open mind, preferring to try without medication initially, or planning for an epidural. Be clear that you understand preferences may change.',iconBg:'rgba(224,126,184,0.12)',svgKey:'pill'},
            {label:'Delivery preferences',desc:'Positions you\'d like to try for pushing, preferences around episiotomy, perineal support, directed versus spontaneous pushing, and catching your own baby if that is meaningful to you.',iconBg:'rgba(185,225,240,0.35)',svgKey:'labor'},
            {label:'Immediately after birth',desc:'Skin-to-skin timing, delayed cord clamping, who cuts the cord, whether you want to see the placenta, management of the third stage, and your preferences if the baby needs medical attention.',iconBg:'rgba(220,195,255,0.25)',svgKey:'heart'},
          ],
          tip:{text:'Keep your birth plan to one page. Midwives caring for multiple women during a busy shift are far more likely to read — and respond to — a concise, clearly formatted document than a lengthy essay.',source:'MomsCare Health · Planning'}},
        2: { tag:'Communication', title:'Making your birth plan work',
          intro:'A birth plan only delivers its benefits if it is read, understood, and respected. How you present and discuss your preferences is as important as what they contain.',
          highlight:{label:'Review with your midwife',text:'Go through your birth plan with your community midwife at your 36-week appointment. This is the optimal time to clarify questions, adjust anything that isn\'t feasible, and get it noted in your records.'},
          items:[
            {label:'Share it in advance',desc:'Give a copy to your midwife and ask for it to be filed with your notes. Bring multiple printed copies to the hospital — wards can be busy and paperwork gets separated.',iconBg:'rgba(91,143,212,0.12)',svgKey:'doc'},
            {label:'Brief your birth partner',desc:'Your birth partner is your advocate. Make sure they know your plan thoroughly, understand your priorities, and feel confident advocating on your behalf if you cannot speak for yourself.',iconBg:'rgba(224,126,184,0.12)',svgKey:'couple'},
            {label:'Frame preferences positively',desc:'Rather than "I don\'t want X," try "I\'d prefer to try Y first." Positive framing creates a collaborative rather than adversarial tone and is generally better received by care teams.',iconBg:'rgba(185,225,240,0.35)',svgKey:'talk'},
            {label:'Plan for deviation',desc:'Include a section: "If plans need to change, I would appreciate...". Being explicit that you understand birth is unpredictable, while communicating what would still be meaningful to you, is reassuring for care teams.',iconBg:'rgba(220,195,255,0.25)',svgKey:'shield'},
          ],
          tip:{text:'Consider writing your birth plan in three sections: preferred birth, if intervention is needed, and in the event of caesarean. This shows your care team you have thought through all possibilities.',source:'MomsCare Health · Planning'}},
      },
      youTubeUrl: "https://www.youtube.com/watch?v=9IiGrCCHQmM",
      citation: { source: "NHS — Writing a Birth Plan", author: "NHS UK", year: "2024", url: "https://www.nhs.uk/pregnancy/labour-and-birth/preparing-for-the-birth/writing-a-birth-plan" },
    },

    // ── 23. PAIN RELIEF OPTIONS ───────────────────────────────────────────
    painrelief: {
      title: 'Pain relief options during labor explained',
      readTime: 6, heroTag: 'Medical', heroImage: 'assets/icon/pain relief options.jpg',
      heroBg: 'linear-gradient(135deg,#ffeee8 0%,#ffe0f0 100%)',
      accentColor: '#e07eb8', accentBg: 'rgba(224,126,184,0.10)',
      highlightBg: 'rgba(224,126,184,0.07)', highlightBorder: 'rgba(224,126,184,0.20)',
      tipBg: 'rgba(224,126,184,0.07)', tipBorder: 'rgba(224,126,184,0.18)',
      tabs: [{id:1,label:'Non-Medical Options'},{id:2,label:'Medical Options'}],
      panels: {
        1: { tag:'Pain Management', title:'Natural pain relief during labour',
          intro:'Many women manage significant amounts of labour using non-pharmacological pain relief, particularly in the early and active stages. These methods can be used alone or alongside medical options, giving you greater agency in your birth experience.',
          highlight:{label:'Your environment matters',text:'Research consistently shows that women who labour in familiar, low-stimulation environments experience pain as less intense than equivalent contractions in a clinical hospital environment.'},
          items:[
            {label:'Water immersion',desc:'Labouring or birthing in warm water is one of the most effective non-pharmacological options. It reduces cortisol, supports movement, and many women report dramatically reduced pain intensity in water.',iconBg:'rgba(224,126,184,0.12)',svgKey:'drop'},
            {label:'TENS machine',desc:'Transcutaneous electrical nerve stimulation sends small electrical pulses that disrupt pain signals. Most effective in early labour. Rental is inexpensive and it can be used at home from the onset of contractions.',iconBg:'rgba(181,127,212,0.12)',svgKey:'wave'},
            {label:'Position and movement',desc:'Upright positions — standing, rocking, kneeling, on all fours — use gravity to assist baby\'s descent and significantly reduce back pain. Lying on your back is the least effective position for pain management.',iconBg:'rgba(185,225,240,0.35)',svgKey:'breath'},
            {label:'Breathing and focus techniques',desc:'Rhythmic breathing, hypnobirthing, visualisation, and continuous support from a partner or doula are all associated with reduced perceived pain and more positive birth experiences.',iconBg:'rgba(220,195,255,0.25)',svgKey:'brain'},
          ],
          tip:{text:'A doula — a trained birth companion who provides continuous support — is associated with a 25% reduction in caesarean rates, 31% reduction in oxytocin use, and significantly improved birth satisfaction.',source:'MomsCare Health · Labour & Birth'}},
        2: { tag:'Medical Pain Relief', title:'Medical pain relief options',
          intro:'Medical pain relief provides effective relief and is a valid, respected choice. There is no award for labouring without medication, and choosing pain relief does not affect your ability to bond with your baby or breastfeed successfully.',
          highlight:{label:'Epidural facts',text:'Approximately 30–40% of women in hospital settings choose an epidural. When properly administered, epidurals are safe for both mother and baby, and do not increase the rate of caesarean section.'},
          items:[
            {label:'Entonox (gas and air)',desc:'A 50/50 blend of oxygen and nitrous oxide inhaled through a mask or mouthpiece. It takes the edge off contractions without eliminating sensation. Self-administered — you control the dose.',iconBg:'rgba(224,126,184,0.12)',svgKey:'breath'},
            {label:'Opioid medications',desc:'Pethidine, diamorphine, or remifentanil (via PCA pump) provide systemic pain relief. They cause drowsiness and can cross the placenta, so timing relative to birth matters.',iconBg:'rgba(181,127,212,0.12)',svgKey:'pill'},
            {label:'Epidural anaesthesia',desc:'A catheter placed in the epidural space of the lower back provides continuous, adjustable pain relief. May require a drip and continuous fetal monitoring. Can slow labour progression in some women.',iconBg:'rgba(185,225,240,0.35)',svgKey:'doc'},
            {label:'Spinal block and CSE',desc:'A spinal block delivers immediate pain relief via a one-time injection. Combined spinal-epidural (CSE) combines both methods — useful for rapid relief with ongoing control.',iconBg:'rgba(220,195,255,0.25)',svgKey:'shield'},
          ],
          tip:{text:'Discuss all options with your midwife well before your due date. Understanding what is available at your specific birth setting — home, birth centre, or hospital — helps you make informed choices in the moment without pressure.',source:'MomsCare Health · Labour & Birth'}},
      },
      youTubeUrl: "https://www.youtube.com/watch?v=qV4_G2h2CJQ",
      citation: { source: "NHS — Pain Relief in Labour", author: "NHS UK", year: "2024", url: "https://www.nhs.uk/pregnancy/labour-and-birth/what-happens/pain-relief-in-labour" },
    },

    // ── 24. EXERCISE IN PREGNANCY ─────────────────────────────────────────
    exercise: {
      title: 'Exercise in pregnancy: what\'s safe and what helps',
      readTime: 5, heroTag: 'Wellness', heroImage: 'assets/icon/exercise during pregnancy.jpg',
      heroBg: 'linear-gradient(135deg,#e8ffe0 0%,#d8f8e8 100%)',
      accentColor: '#5bba8a', accentBg: 'rgba(91,186,138,0.10)',
      highlightBg: 'rgba(91,186,138,0.07)', highlightBorder: 'rgba(91,186,138,0.22)',
      tipBg: 'rgba(91,186,138,0.07)', tipBorder: 'rgba(91,186,138,0.20)',
      tabs: [{id:1,label:'Benefits & Safety'},{id:2,label:'Best Exercises'}],
      panels: {
        1: { tag:'Exercise', title:'Why staying active matters',
          intro:'Regular moderate exercise during pregnancy is recommended by every major obstetric guideline. The evidence base is clear: active pregnant women have better outcomes for themselves and their babies than sedentary women.',
          highlight:{label:'Current guidelines',text:'The WHO and most obstetric bodies recommend at least 150 minutes of moderate-intensity activity per week during pregnancy — the same as the general adult population.'},
          items:[
            {label:'Benefits for you',desc:'Exercise reduces the risk of gestational diabetes by up to 25%, significantly lowers back pain, improves sleep quality, reduces anxiety and depression, and is associated with shorter, less complicated labours.',iconBg:'rgba(91,186,138,0.12)',svgKey:'heart'},
            {label:'Benefits for baby',desc:'Babies of regularly exercising mothers have lower rates of macrosomia (excessive birth weight), better cardiovascular fitness, and show more favourable neurodevelopmental outcomes.',iconBg:'rgba(224,126,184,0.12)',svgKey:'star'},
            {label:'What to avoid',desc:'Avoid contact sports, activities with fall risk, exercises requiring lying flat on your back after the first trimester, scuba diving, and high altitude exercise. Hot yoga and saunas should also be avoided.',iconBg:'rgba(185,225,240,0.35)',svgKey:'shield'},
            {label:'Warning signs to stop',desc:'Stop and contact your midwife if you experience chest pain, severe headache, dizziness, calf pain or swelling, decreased fetal movement, vaginal bleeding, or fluid leakage.',iconBg:'rgba(220,195,255,0.25)',svgKey:'wave'},
          ],
          tip:{text:'If you were sedentary before pregnancy, begin with 15 minutes of walking per day and build gradually. This is safer than immediately starting a new vigorous exercise programme.',source:'MomsCare Health · Exercise'}},
        2: { tag:'Exercise Choices', title:'The best exercises for pregnancy',
          intro:'Not all exercise is equal in pregnancy. The safest and most beneficial activities are low-impact, avoid overheating and dehydration, and can be modified as your bump grows.',
          highlight:{label:'Swimming — the gold standard',text:'Swimming and water aerobics are widely considered the ideal pregnancy exercise — water supports your body weight, reduces joint stress, maintains cardiovascular fitness, and the temperature is naturally regulated.'},
          items:[
            {label:'Walking',desc:'The most accessible form of exercise — no equipment, no gym, any duration. A 30-minute daily walk at a brisk pace delivers significant cardiovascular and mental health benefits throughout all three trimesters.',iconBg:'rgba(91,186,138,0.12)',svgKey:'breath'},
            {label:'Prenatal yoga',desc:'Specifically designed for pregnancy, prenatal yoga builds flexibility, practises breathing techniques useful in labour, strengthens the pelvic floor, and significantly reduces anxiety and back pain.',iconBg:'rgba(224,126,184,0.12)',svgKey:'leaf'},
            {label:'Pelvic floor exercises',desc:'Kegel exercises — contracting and releasing the pelvic floor muscles — should be performed daily throughout pregnancy. A strong pelvic floor reduces the risk of incontinence and supports recovery after birth.',iconBg:'rgba(185,225,240,0.35)',svgKey:'bone'},
            {label:'Strength training',desc:'Light to moderate resistance training is safe throughout pregnancy for those with prior experience. Focus on bodyweight exercises and resistance bands. Avoid heavy overhead lifts and the Valsalva manoeuvre.',iconBg:'rgba(220,195,255,0.25)',svgKey:'shield'},
          ],
          tip:{text:'The talk test is the easiest way to gauge exercise intensity in pregnancy: if you can maintain a full conversation while exercising, you are at a safe moderate intensity. If you cannot, slow down.',source:'MomsCare Health · Exercise'}},
      },
      youTubeUrl: "https://www.youtube.com/watch?v=v5FHxe_ICEM",
      citation: { source: "ACOG — Exercise During Pregnancy", author: "American College of Obstetricians and Gynecologists", year: "2024", url: "https://www.acog.org/womens-health/faqs/exercise-during-pregnancy" },
    },

    // ── 25. THE FOURTH TRIMESTER ──────────────────────────────────────────
    postpartum: {
      title: 'The fourth trimester: your recovery plan',
      readTime: 7, heroTag: 'Postpartum', heroImage: 'assets/icon/forth trimester.jpg',
      heroBg: 'linear-gradient(135deg,#ffe8f5 0%,#f5e8ff 100%)',
      accentColor: '#b57fd4', accentBg: 'rgba(181,127,212,0.10)',
      highlightBg: 'rgba(181,127,212,0.07)', highlightBorder: 'rgba(181,127,212,0.20)',
      tipBg: 'rgba(181,127,212,0.07)', tipBorder: 'rgba(181,127,212,0.18)',
      tabs: [{id:1,label:'Physical Recovery'},{id:2,label:'Emotional Recovery'}],
      panels: {
        1: { tag:'Postpartum', title:'Your body after birth',
          intro:'The fourth trimester — the 12 weeks following birth — is one of the most physically demanding periods of a woman\'s life, yet it receives far less preparation and attention than the pregnancy itself.',
          highlight:{label:'Recovery timeline',text:'Your uterus takes approximately 6 weeks to return to its pre-pregnancy size. However, full musculoskeletal recovery, particularly of the pelvic floor and abdominal wall, typically takes 3–6 months or longer.'},
          items:[
            {label:'Lochia (postpartum bleeding)',desc:'Vaginal bleeding after birth is normal and can last 4–6 weeks, transitioning from bright red to pink to yellow or white. Soaking more than one pad per hour for two consecutive hours is abnormal — contact your midwife.',iconBg:'rgba(181,127,212,0.12)',svgKey:'heart'},
            {label:'Perineal recovery',desc:'Tears or episiotomies typically heal within 2–6 weeks. Keep the area clean and dry, apply cold packs in the first 24 hours, and take prescribed pain relief regularly rather than waiting for pain to escalate.',iconBg:'rgba(224,126,184,0.12)',svgKey:'shield'},
            {label:'Pelvic floor rehabilitation',desc:'Begin gentle pelvic floor contractions within 24 hours of a vaginal birth if comfortable. See a pelvic floor physiotherapist at 6 weeks before returning to impact exercise.',iconBg:'rgba(185,225,240,0.35)',svgKey:'bone'},
            {label:'Caesarean recovery',desc:'A caesarean is major abdominal surgery. The 6-week rule of lifting nothing heavier than your baby is based on wound healing timelines. Pain that worsens after 48 hours should be assessed promptly.',iconBg:'rgba(220,195,255,0.25)',svgKey:'doc'},
          ],
          tip:{text:'Accept all practical help offered in the first 6 weeks. Rest when the baby sleeps when you can. The goal of the fourth trimester is recovery, not productivity. Every unnecessary task you delegate protects your long-term health.',source:'MomsCare Health · Postpartum'}},
        2: { tag:'Emotional Recovery', title:'Mental health in the fourth trimester',
          intro:'The emotional landscape of the postpartum period is complex and frequently misunderstood. Joy, grief, fear, love, exhaustion, and identity disruption can all coexist simultaneously.',
          highlight:{label:'Baby blues vs postpartum depression',text:'Up to 80% of women experience the "baby blues" — tearfulness and anxiety peaking at days 3–5 postpartum as oestrogen falls sharply. This is normal. Symptoms persisting beyond 2 weeks indicate postpartum depression.'},
          items:[
            {label:'Baby blues (days 3–5)',desc:'Caused by the dramatic drop in oestrogen and progesterone immediately after birth, combined with sleep deprivation and the enormity of the transition. Rest, reassurance, and support are the most helpful responses.',iconBg:'rgba(181,127,212,0.12)',svgKey:'moon'},
            {label:'Postpartum depression',desc:'Affecting 1 in 7 women, PPD presents as persistent low mood, loss of enjoyment, anxiety, difficulty bonding, and withdrawal. It is not a character failing and responds well to treatment — therapy, medication, or both.',iconBg:'rgba(224,126,184,0.12)',svgKey:'brain'},
            {label:'Postpartum anxiety',desc:'Often overlooked in comparison to PPD, postpartum anxiety — including intrusive thoughts — is actually more common. Intrusive thoughts about harm coming to your baby are extremely common and do not mean you will act on them.',iconBg:'rgba(185,225,240,0.35)',svgKey:'star'},
            {label:'Postpartum psychosis',desc:'A rare but serious condition affecting 1–2 in 1,000 women, usually within the first 2 weeks. Symptoms include confusion, hallucinations, and bizarre behaviour. It is a psychiatric emergency — call emergency services immediately.',iconBg:'rgba(220,195,255,0.25)',svgKey:'shield'},
          ],
          tip:{text:'Tell someone how you are really feeling every day in the fourth trimester — your partner, midwife, health visitor, or a trusted friend. Silence and isolation are the greatest risk factors for postpartum mental health challenges becoming serious.',source:'MomsCare Health · Postpartum'}},
      },
      youTubeUrl: "https://www.youtube.com/watch?v=JkrSFsWbGtQ",
      citation: { source: "NHS — Your Body After the Birth", author: "NHS UK", year: "2024", url: "https://www.nhs.uk/pregnancy/labour-and-birth/after-the-birth/your-body-after-the-birth" },
    },

  };


  popularArticles: ArticleCard[] = [
    { title: 'Your changing body: up to 42 weeks', tag: 'Body Changes', readTime: 6, bgColor: 'linear-gradient(135deg,rgba(244,210,240,0.7),rgba(220,195,255,0.6))', image: 'assets/icon/yourchangingbody.jpg', excerpt: 'Every system in your body is adapting — here\'s the full picture week by week.', articleKey: 'body' },
    { title: 'Checkups: when, how, and why', tag: 'Medical', readTime: 4, bgColor: 'linear-gradient(135deg,rgba(185,225,240,0.6),rgba(200,210,255,0.6))', image: 'assets/icon/checkupswhenhowandwhy.jpg', excerpt: 'What to expect at each prenatal visit and which tests matter most.', articleKey: 'checkups' },
    { title: 'Why pregnancy fatigue hits so hard', tag: 'Symptoms', readTime: 3, bgColor: 'linear-gradient(135deg,rgba(255,210,230,0.6),rgba(244,210,240,0.7))', image: 'assets/icon/pregnancy_fatiuge.jpg', excerpt: 'Progesterone, placenta-building, and blood volume changes are all at play.', articleKey: 'fatigue' },
    { title: 'Round ligament pain explained', tag: 'Body Changes', readTime: 3, bgColor: 'linear-gradient(135deg,rgba(210,240,220,0.6),rgba(185,225,240,0.6))', image: 'assets/icon/round_ligament_pain.jpg', excerpt: 'Sharp, shooting pains on the sides of your belly — what they are and how to ease them.', articleKey: 'ligament' },
  ];

  bodyArticles: ArticleCard[] = [
    { title: 'Why your skin changes and what helps', tag: 'Skin & Hair', readTime: 4, bgColor: 'linear-gradient(135deg,rgba(255,230,210,0.7),rgba(255,210,230,0.6))', image: 'assets/icon/skinchanges_pregnancy.jpg', excerpt: 'From the glow to the linea nigra — the science behind pregnancy skin changes.', articleKey: 'skin' },
    { title: 'Understanding Braxton Hicks contractions', tag: 'Symptoms', readTime: 4, bgColor: 'linear-gradient(135deg,rgba(220,195,255,0.6),rgba(185,225,240,0.6))', image: 'assets/icon/Braxton-Hicks contractions.jpg', excerpt: 'Practice contractions versus real ones — how to tell the difference.', articleKey: 'braxton' },
    { title: 'Staying hydrated: more important than you think', tag: 'Wellness', readTime: 3, bgColor: 'linear-gradient(135deg,rgba(185,225,240,0.7),rgba(200,215,255,0.6))', excerpt: 'Your amniotic fluid is replenished every 3 hours — water intake directly matters.', image: 'assets/icon/Hydration and Pregnancy.jpg', articleKey: 'hydration' },
    { title: 'Morning sickness: foods that actually help', tag: 'Symptoms', readTime: 4, bgColor: 'linear-gradient(135deg,rgba(255,215,220,0.6),rgba(244,210,240,0.6))', excerpt: 'Cold, bland, and small — the eating strategy that gets most women through.', image: 'assets/icon/morning sickness foods.jpg', articleKey: 'morningsickness' },
  ];

  babyArticles: ArticleCard[] = [
    { title: 'How your baby\'s senses develop week by week', tag: 'Development', readTime: 5, bgColor: 'linear-gradient(135deg,rgba(255,220,180,0.6),rgba(255,200,210,0.6))', image: 'assets/icon/babys_senses.jpg', excerpt: 'Touch, hearing, taste, sight — your baby is already experiencing the world.', articleKey: 'senses' },
    { title: 'Fetal movement: what\'s normal to feel', tag: 'Development', readTime: 4, bgColor: 'linear-gradient(135deg,rgba(185,240,225,0.6),rgba(200,215,255,0.6))', image: 'assets/icon/fatal_movement.jpg', excerpt: 'Kicks, rolls, hiccups — a guide to the movements you\'ll experience.', articleKey: 'movement' },
    { title: 'When does baby start to hear your voice?', tag: 'Bonding', readTime: 3, bgColor: 'linear-gradient(135deg,rgba(244,210,240,0.7),rgba(220,195,255,0.5))', image: "assets/icon/Baby's_hearing.jpg", excerpt: 'From week 18 onwards, your baby can hear sounds — including you.', articleKey: 'hearingvoice' },
    { title: 'What your baby is doing right now', tag: 'Development', readTime: 4, bgColor: 'linear-gradient(135deg,rgba(200,240,220,0.6),rgba(185,225,240,0.6))', image: 'assets/icon/fatal_movement2.jpg', excerpt: 'Sucking, swallowing, practicing breathing — movement is constant inside.', articleKey: 'babynow' },
    { title: 'The baby\'s brain: how it grows so fast', tag: 'Development', readTime: 6, bgColor: 'linear-gradient(135deg,rgba(210,200,255,0.6),rgba(190,210,255,0.6))', excerpt: '100 billion neurons, all forming before birth — the science is extraordinary.', image: "assets/icon/baby brain growth.jpg", articleKey: 'babybrain' },
  ];

  nutritionArticles: ArticleCard[] = [
    { title: 'Iron in pregnancy: why it matters so much', tag: 'Nutrition', readTime: 4, bgColor: 'linear-gradient(135deg,rgba(255,230,190,0.7),rgba(255,210,180,0.6))', image: 'assets/icon/foods_rich in iron.jpg', excerpt: 'Anaemia affects 1 in 3 pregnant women. Here\'s how to keep your levels healthy.', articleKey: 'iron' },
    { title: 'Foods that support baby\'s brain development', tag: 'Nutrition', readTime: 5, bgColor: 'linear-gradient(135deg,rgba(200,240,200,0.7),rgba(185,225,210,0.6))', image: 'assets/icon/foods_brain development.jpg', excerpt: 'DHA, choline, iodine — the nutrients that build your baby\'s neural connections.', articleKey: 'brainfoods' },
    { title: 'Why you might feel more emotional right now', tag: 'Emotions', readTime: 4, bgColor: 'linear-gradient(135deg,rgba(255,230,200,0.6),rgba(255,210,225,0.6))', excerpt: 'Hormonal surges during pregnancy genuinely change emotional processing.', image: 'assets/icon/emotional during pregnancy.jpg', articleKey: 'emotions' },
    { title: 'Exercise in pregnancy: what\'s safe and what helps', tag: 'Wellness', readTime: 5, bgColor: 'linear-gradient(135deg,rgba(210,240,215,0.7),rgba(190,235,210,0.6))', excerpt: 'Safe activities, what to avoid, and why staying active improves outcomes.', image: 'assets/icon/exercise during pregnancy.jpg', articleKey: 'exercise' },
  ];

  mindArticles: ArticleCard[] = [
    { title: 'Pregnancy anxiety: what\'s normal and what\'s not', tag: 'Mental Health', readTime: 5, bgColor: 'linear-gradient(135deg,rgba(220,195,255,0.6),rgba(200,185,255,0.5))', excerpt: 'Worry is universal in pregnancy. Knowing when to seek support makes all the difference.', image: 'assets/icon/pregnancy anxiety.jpg', articleKey: 'anxiety' },
    { title: 'Pregnancy insomnia: causes and solutions', tag: 'Sleep', readTime: 4, bgColor: 'linear-gradient(135deg,rgba(210,200,255,0.6),rgba(185,210,240,0.6))', excerpt: 'Progesterone, discomfort, and racing thoughts — a guide to sleeping better.', image: 'assets/icon/pregnancy insonnia.jpg', articleKey: 'insomnia' },
    { title: 'Building a support system before birth', tag: 'Wellness', readTime: 4, bgColor: 'linear-gradient(135deg,rgba(185,240,225,0.6),rgba(185,225,240,0.6))', excerpt: 'Who to lean on, how to ask for help, and why doing it before baby arrives matters.', image: 'assets/icon/building support system.jpg', articleKey: 'supportsystem' },
    { title: 'The fourth trimester: your recovery plan', tag: 'Postpartum', readTime: 7, bgColor: 'linear-gradient(135deg,rgba(255,215,235,0.7),rgba(240,215,255,0.6))', excerpt: 'The weeks after birth are as important as pregnancy — here\'s what to prepare for.', image: 'assets/icon/forth trimester.jpg', articleKey: 'postpartum' },
  ];

  birthArticles: ArticleCard[] = [
    { title: 'The stages of labour: what to expect', tag: 'Labor', readTime: 7, bgColor: 'linear-gradient(135deg,rgba(255,200,215,0.7),rgba(244,210,240,0.6))', excerpt: 'Early, active, and transition — a calm, honest walk through each phase.', image: 'assets/icon/stages of labour.jpg', articleKey: 'labour' },
    { title: 'Hospital bag essentials: the complete list', tag: 'Checklist', readTime: 4, bgColor: 'linear-gradient(135deg,rgba(185,240,220,0.6),rgba(200,215,255,0.6))', excerpt: 'For you, for baby, and for your birth partner — nothing forgotten.', image: 'assets/icon/Hospital Bag Essentials.jpg', articleKey: 'hospitalbag' },
    { title: 'Building your birth plan step by step', tag: 'Planning', readTime: 5, bgColor: 'linear-gradient(135deg,rgba(200,215,255,0.7),rgba(220,195,255,0.6))', excerpt: 'What to include, how to communicate it, and staying flexible when plans change.', image: 'assets/icon/birth plan.jpg', articleKey: 'birthplan' },
    { title: 'Pain relief options during labor explained', tag: 'Medical', readTime: 6, bgColor: 'linear-gradient(135deg,rgba(255,230,190,0.6),rgba(255,210,215,0.6))', excerpt: 'Epidural, gas and air, TENS, pool birth — each option honestly reviewed.', image: 'assets/icon/pain relief options.jpg', articleKey: 'painrelief' },
  ];

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
  constructor(private router: Router, private theme: ThemeService) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
    this.startCarousel();
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
    clearInterval(this.carouselTimer);
  }

  navigate(route: string): void { this.router.navigate([route]); }

  openUrl(url: string): void {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }
}