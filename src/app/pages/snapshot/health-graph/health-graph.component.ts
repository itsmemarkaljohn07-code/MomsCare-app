// health-graph.component.ts
// The Health Tracker graph: weight, blood pressure, kicks and mood over
// time, from the patient's own readings and the clinic's, plus the measures
// only the clinic takes at checkups (fundal height, fetal heart rate, pulse,
// temperature). Plain SVG, the same series and colours as the dashboard's
// Health Trends charts. The numbers come from shared/health-series.ts; this
// file only draws them, and never judges a value.
import {
  AfterViewInit, Component, ElementRef, EventEmitter, HostBinding, Input, NgZone,
  OnChanges, OnDestroy, Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeightUnit, weightUnitLabel } from '../../../shared/weight-units';
import {
  CLINIC_MEASURES, ClinicMeasure, ClinicReadingInput, HealthPoint, HealthRange, HealthSeries, MOOD_NAMES,
  RANGE_LABELS, ReadingSource,
  SOURCE_LABELS, SelfLogInput, addDays, buildHealthSeries, dayNumber, manilaDay, niceScale,
  pregnancyWeekOn, shortDayLabel, weekLabel,
} from '../../../shared/health-series';

type ChartId = 'weight' | 'bp' | 'kicks' | 'mood' | ClinicMeasure;
type ValueKey = 'weight' | 'bpSys' | 'bpDia' | 'kicks' | 'mood' | ClinicMeasure;

/** Axis spread for the checkup measures: temperature in whole or half
 *  degrees, heart rates in steps of 5 or more. */
const CLINIC_MIN_SPAN: Record<ClinicMeasure, number> = {
  fundalHeightCm: 4, fetalHeartRate: 20, pulse: 20, temperatureC: 2,
};

interface Mark { x: number; y: number; source: ReadingSource; }

interface ChartLine {
  key: ValueKey;
  name: string;
  path: string;
  marks: Mark[];
}

interface Chart {
  id: ChartId;
  title: string;
  /** Readings that have a value for this chart, oldest first. */
  points: HealthPoint[];
  xs: number[];
  lines: ChartLine[];
  yTicks: { y: number; label: string }[];
  xTicks: { x: number; date: string; week: string; anchor: string }[];
  padL: number;
  summary: string;
}

const HEIGHT = 190;
const PAD_T = 12;
const PAD_B = 38;
const PAD_R = 12;

@Component({
  selector: 'app-health-graph',
  templateUrl: './health-graph.component.html',
  styleUrls: ['./health-graph.component.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class HealthGraphComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() logs: SelfLogInput[] = [];
  @Input() clinic: ClinicReadingInput[] = [];
  @Input() unit: WeightUnit = 'kg';
  @Input() dueDate: string | null = null;
  @Input() loading = true;
  /** Own readings couldn't be loaded. */
  @Input() error = false;
  /** Clinic readings couldn't be loaded (own readings still show). */
  @Input() clinicError = false;
  @Input() @HostBinding('class.dark') dark = false;
  @Output() addReading = new EventEmitter<void>();

  readonly ranges: HealthRange[] = ['4w', '3m', 'all'];
  readonly rangeLabels = RANGE_LABELS;
  readonly sourceLabels = SOURCE_LABELS;
  readonly moodNames = MOOD_NAMES;
  readonly chartNouns: Record<ChartId, string> = {
    weight: 'weight', bp: 'blood pressure', kicks: 'kick', mood: 'mood',
    fundalHeightCm: 'fundal height', fetalHeartRate: 'fetal heart rate', pulse: 'pulse', temperatureC: 'temperature',
  };
  range: HealthRange = '3m';
  showTable = false;

  series: HealthSeries | null = null;
  charts: Chart[] = [];
  /** Checkup measures with at least one reading in the range (no empty cards). */
  checkupCharts: Chart[] = [];
  /** Latest-value tiles for checkup measures ever recorded. */
  checkupTiles: { key: ClinicMeasure; name: string; unit: string; value: number; day: string }[] = [];
  /** Table columns: only measures with data in the period. */
  tableCols: { key: ValueKey | 'bp'; label: string }[] = [];
  /** Selected reading (index into chart.points) per chart. */
  selected: Partial<Record<ChartId, number>> = {};
  width = 320;

  private resizeObserver?: ResizeObserver;

  constructor(private host: ElementRef<HTMLElement>, private zone: NgZone) {}

  get unitLabel(): string { return weightUnitLabel(this.unit); }

  chartNoun(c: Chart): string { return this.chartNouns[c.id]; }

  ngOnChanges(): void { this.rebuild(); }

  ngAfterViewInit(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(entries => {
      // The card's inner width: the host minus the card's padding and border.
      const w = Math.floor(entries[0].contentRect.width) - 30;
      if (w > 0 && Math.abs(w - this.width) >= 1) this.zone.run(() => { this.width = w; this.rebuild(); });
    });
    this.resizeObserver.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void { this.resizeObserver?.disconnect(); }

  setRange(r: HealthRange): void {
    this.range = r;
    this.selected = {};
    this.rebuild();
  }

  // ── Building the charts ──────────────────────────────────────────

  private rebuild(): void {
    this.series = buildHealthSeries({
      logs: this.logs ?? [], clinic: this.clinic ?? [], unit: this.unit,
      dueDate: this.dueDate, range: this.range, today: manilaDay(new Date()),
    });
    const s = this.series;
    const u = this.unitLabel;
    this.charts = [
      this.chart('weight', `Weight (${u})`, [{ key: 'weight', name: 'Weight' }], s, 36, v => fmt(v)),
      this.chart('bp', 'Blood pressure (mmHg)', [
        { key: 'bpSys', name: 'Systolic' }, { key: 'bpDia', name: 'Diastolic' },
      ], s, 36, v => fmt(v), 20),
      this.chart('kicks', 'Kicks', [{ key: 'kicks', name: 'Kicks' }], s, 36, v => fmt(v), 4, 0),
      this.chart('mood', 'Mood', [{ key: 'mood', name: 'Mood' }], s, 62, v => MOOD_NAMES[v] ?? '', 4, 0, 4),
    ];
    this.checkupCharts = CLINIC_MEASURES
      .map(m => this.chart(m.key, `${m.name} (${m.unit})`, [{ key: m.key, name: m.name }], s, 36,
        v => fmt(v), CLINIC_MIN_SPAN[m.key]))
      .filter(c => c.points.length > 0);
    this.checkupTiles = [];
    for (const m of CLINIC_MEASURES) {
      const l = s.latest[m.key];
      if (l) this.checkupTiles.push({ key: m.key, name: m.name, unit: m.unit, value: l.value, day: l.day });
    }

    const has = (k: ValueKey) => s.points.some(p => p[k] !== null);
    this.tableCols = [
      ...(has('weight') ? [{ key: 'weight' as const, label: `Weight (${u})` }] : []),
      ...(has('bpSys') || has('bpDia') ? [{ key: 'bp' as const, label: 'BP' }] : []),
      ...(has('kicks') ? [{ key: 'kicks' as const, label: 'Kicks' }] : []),
      ...(has('mood') ? [{ key: 'mood' as const, label: 'Mood' }] : []),
      ...CLINIC_MEASURES.filter(m => has(m.key)).map(m => ({ key: m.key, label: `${m.name} (${m.unit})` })),
    ];

    for (const c of [...this.charts, ...this.checkupCharts]) {
      const i = this.selected[c.id];
      if (i !== undefined && i >= c.points.length) delete this.selected[c.id];
    }
  }

  private chart(
    id: ChartId, title: string, keys: { key: ValueKey; name: string }[], s: HealthSeries,
    padL: number, tick: (v: number) => string, minSpan = 2, floor?: number, ceil?: number,
  ): Chart {
    const points = s.points.filter(p => keys.some(k => p[k.key] !== null));
    const values: number[] = [];
    for (const p of points) for (const k of keys) if (p[k.key] !== null) values.push(p[k.key] as number);
    // Mood has a fixed 0-4 scale; kicks start at 0.
    const scale = floor !== undefined && ceil !== undefined
      ? { min: floor, max: ceil, ticks: Array.from({ length: ceil - floor + 1 }, (_, i) => floor + i) }
      : niceScale(Math.min(floor ?? Infinity, ...values), Math.max(...values), minSpan);

    const plotW = Math.max(40, this.width - padL - PAD_R);
    const plotH = HEIGHT - PAD_T - PAD_B;
    const d0 = dayNumber(s.from);
    const d1 = dayNumber(s.to);
    const x = (day: string) => d1 === d0
      ? padL + plotW / 2
      : padL + ((dayNumber(day) - d0) / (d1 - d0)) * plotW;
    const y = (v: number) => PAD_T + (1 - (v - scale.min) / (scale.max - scale.min || 1)) * plotH;

    const lines: ChartLine[] = keys.map(k => {
      const marks = points
        .filter(p => p[k.key] !== null)
        .map(p => ({ x: x(p.day), y: y(p[k.key] as number), source: p.source }));
      const path = marks.map((m, i) => `${i ? 'L' : 'M'}${m.x.toFixed(1)} ${m.y.toFixed(1)}`).join(' ');
      return { key: k.key, name: k.name, path, marks };
    });

    return {
      id, title, points, padL, lines,
      xs: points.map(p => x(p.day)),
      yTicks: scale.ticks.map(v => ({ y: y(v), label: tick(v) })),
      xTicks: this.xTicks(s.from, s.to, x),
      summary: this.summary(title, keys, points, s),
    };
  }

  private xTicks(from: string, to: string, x: (day: string) => number) {
    const span = dayNumber(to) - dayNumber(from);
    const n = span === 0 ? 1 : this.width < 380 ? 3 : 4;
    const out: Chart['xTicks'] = [];
    for (let i = 0; i < n; i++) {
      const day = n === 1 ? to : addDays(from, Math.round((span * i) / (n - 1)));
      const week = weekLabel(this.weekOf(day));
      out.push({
        x: x(day), date: shortDayLabel(day), week: week.replace('Week', 'Wk'),
        anchor: n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
      });
    }
    return out;
  }

  private weekOf(day: string): number | null {
    return pregnancyWeekOn(day, this.dueDate);
  }

  /** The text alternative for one chart (its aria-label). */
  private summary(title: string, keys: { key: ValueKey; name: string }[], points: HealthPoint[], s: HealthSeries): string {
    const period = RANGE_LABELS[this.range].toLowerCase();
    if (!points.length) return `${title}: no readings in the ${period}.`;
    const n = points.length;
    const last = points[points.length - 1];
    const parts = keys.map(k => {
      const vals = points.map(p => p[k.key]).filter((v): v is number => v !== null);
      const lastVal = [...points].reverse().find(p => p[k.key] !== null)![k.key] as number;
      return keys.length > 1 || k.key !== 'mood'
        ? `${keys.length > 1 ? k.name + ' latest' : 'Latest'} ${this.valueText(k.key, lastVal)}, lowest ${this.valueText(k.key, Math.min(...vals))}, highest ${this.valueText(k.key, Math.max(...vals))}`
        : `Latest ${this.valueText(k.key, lastVal)}`;
    });
    return `${title}, ${period}: ${n} reading${n === 1 ? '' : 's'} from ${shortDayLabel(points[0].day)} to ${shortDayLabel(last.day)}. `
      + `${parts.join('; ')}. Last reading on ${shortDayLabel(last.day)}, ${SOURCE_LABELS[last.source].toLowerCase()}.`;
  }

  valueText(key: ValueKey, v: number): string {
    if (key === 'weight') return `${fmt(v)} ${this.unitLabel}`;
    if (key === 'mood') return MOOD_NAMES[v] ?? '';
    if (key === 'kicks') return `${v} kick${v === 1 ? '' : 's'}`;
    const m = CLINIC_MEASURES.find(c => c.key === key);
    return m ? `${fmt(v)} ${m.unit}` : `${fmt(v)}`;
  }

  // ── Selecting a reading (tap, drag or arrow keys) ────────────────

  onPointer(c: Chart, ev: PointerEvent): void {
    if (!c.points.length) return;
    const rect = (ev.currentTarget as Element).getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / (rect.width || 1)) * this.width;
    let best = 0;
    c.xs.forEach((x, i) => { if (Math.abs(x - px) < Math.abs(c.xs[best] - px)) best = i; });
    // Several readings on one day: keep cycling through them on taps.
    const same = c.xs.map((x, i) => i).filter(i => c.xs[i] === c.xs[best]);
    const cur = this.selected[c.id];
    this.selected[c.id] = ev.type === 'pointerdown' && cur !== undefined && same.includes(cur) && same.length > 1
      ? same[(same.indexOf(cur) + 1) % same.length]
      : (cur !== undefined && same.includes(cur) ? cur : best);
  }

  onKey(c: Chart, ev: KeyboardEvent): void {
    if (!c.points.length) return;
    const last = c.points.length - 1;
    const cur = this.selected[c.id];
    let next: number | undefined;
    if (ev.key === 'ArrowRight') next = cur === undefined ? 0 : Math.min(last, cur + 1);
    else if (ev.key === 'ArrowLeft') next = cur === undefined ? last : Math.max(0, cur - 1);
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = last;
    else if (ev.key === 'Escape') { delete this.selected[c.id]; return; }
    else return;
    ev.preventDefault();
    this.selected[c.id] = next;
  }

  selectedPoint(c: Chart): HealthPoint | null {
    const i = this.selected[c.id];
    return i === undefined ? null : c.points[i] ?? null;
  }

  selectedX(c: Chart): number {
    return c.xs[this.selected[c.id] ?? 0] ?? 0;
  }

  /** "62.4 kg", "112/72", "8 kicks", "Great". */
  readoutValue(c: Chart, p: HealthPoint): string {
    if (c.id === 'bp') {
      const sys = p.bpSys !== null ? fmt(p.bpSys) : '–';
      const dia = p.bpDia !== null ? fmt(p.bpDia) : '–';
      return `${sys}/${dia} mmHg`;
    }
    return this.valueText(c.id as ValueKey, p[c.id as ValueKey] as number);
  }

  dayText(p: { day: string; week: number | null } | string): string {
    const day = typeof p === 'string' ? p : p.day;
    const week = typeof p === 'string' ? this.weekOf(day) : p.week;
    return week === null ? shortDayLabel(day) : `${shortDayLabel(day)} · ${weekLabel(week)}`;
  }

  readonly shortDay = shortDayLabel;
  /** A value to 1 decimal, without a unit. */
  readonly number = fmt;
  readonly weekText = weekLabel;

  /** Diamond marker for a clinic reading. */
  diamond(m: Mark, r = 5.5): string {
    return `M${m.x} ${m.y - r} L${m.x + r} ${m.y} L${m.x} ${m.y + r} L${m.x - r} ${m.y} Z`;
  }

  get tableRows(): HealthPoint[] {
    return [...(this.series?.points ?? [])].reverse();
  }

  /** One table cell: the value without its unit (the header has it), or a dash. */
  cell(p: HealthPoint, key: ValueKey | 'bp'): string {
    if (key === 'bp') return p.bpSys !== null && p.bpDia !== null ? `${fmt(p.bpSys)}/${fmt(p.bpDia)}` : '–';
    const v = p[key];
    if (v === null) return '–';
    return key === 'mood' ? MOOD_NAMES[v] ?? '–' : fmt(v);
  }

  trackChart = (_: number, c: Chart) => c.id;
}

function fmt(v: number): string {
  return String(Math.round(v * 10) / 10);
}
