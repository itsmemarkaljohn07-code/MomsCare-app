// health-series.ts
// Builds the Health Tracker graph from the patient's own readings
// (users/{uid}/healthLogs) and the clinic's (users/{uid}/clinicReadings).
// No Angular and no Firebase here, so every rule can be tested on its own.
//
// Days are Manila calendar days ("YYYY-MM-DD"), the same as the clinic's
// measuredOn, whatever the phone's time zone. Weights are stored in kg and
// shown in the patient's Weight Unit.

import { kgToUnit } from './weight-units';
import type { WeightUnit } from './weight-units';

export type ReadingSource = 'self' | 'clinic';
export type HealthRange = '4w' | '3m' | 'all';

export const RANGE_LABELS: Record<HealthRange, string> = {
  '4w': 'Last 4 weeks',
  '3m': 'Last 3 months',
  all: 'Whole pregnancy',
};

export const SOURCE_LABELS: Record<ReadingSource, string> = {
  self: 'Reported by you',
  clinic: 'Measured by the clinic',
};

export const MOOD_NAMES = ['Low', 'Okay', 'Good', 'Great', 'Amazing'];

/** A healthLogs entry as read (loggedAt already turned into a Date). */
export interface SelfLogInput {
  loggedAt: Date | null;
  weight?: unknown;
  bpSys?: unknown;
  bpDia?: unknown;
  kicks?: unknown;
  mood?: unknown;
}

/** A clinicReadings entry as read. */
export interface ClinicReadingInput {
  measuredOn?: unknown;
  weightKg?: unknown;
  bpSys?: unknown;
  bpDia?: unknown;
  /** Newer measures; older documents don't have them. */
  fundalHeightCm?: unknown;
  fetalHeartRate?: unknown;
  pulse?: unknown;
  temperatureC?: unknown;
  note?: unknown;
}

/** Measures only the clinic records (none for her own readings). Shown
 *  as stored: no unit conversion. */
export type ClinicMeasure = 'fundalHeightCm' | 'fetalHeartRate' | 'pulse' | 'temperatureC';

export const CLINIC_MEASURES: readonly { key: ClinicMeasure; name: string; unit: string }[] = [
  { key: 'fundalHeightCm', name: 'Fundal height', unit: 'cm' },
  { key: 'fetalHeartRate', name: 'Fetal heart rate', unit: 'bpm' },
  { key: 'pulse', name: 'Pulse', unit: 'bpm' },
  { key: 'temperatureC', name: 'Temperature', unit: '°C' },
];

/** One reading on the graph. A missing value is null. */
export interface HealthPoint {
  /** Manila calendar day, YYYY-MM-DD. */
  day: string;
  source: ReadingSource;
  /** Pregnancy week on that day; null without a due date. */
  week: number | null;
  /** In the patient's unit. */
  weight: number | null;
  bpSys: number | null;
  bpDia: number | null;
  kicks: number | null;
  mood: number | null;
  /** Clinic only (null for her own readings). */
  fundalHeightCm: number | null;
  fetalHeartRate: number | null;
  pulse: number | null;
  temperatureC: number | null;
  note: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** The Philippines is UTC+8 all year (no daylight saving). */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const PREGNANCY_DAYS = 280;

/** The Manila calendar day of an instant. */
export function manilaDay(d: Date): string {
  return new Date(d.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Whole days since 1970-01-01 for a YYYY-MM-DD day (for the x axis). */
export function dayNumber(day: string): number {
  const m = YMD.exec(day);
  if (!m) return NaN;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / MS_PER_DAY);
}

export function addDays(day: string, n: number): string {
  return new Date((dayNumber(day) + n) * MS_PER_DAY).toISOString().slice(0, 10);
}

/** The same day `n` months away; a day the month lacks becomes its last day. */
export function addMonths(day: string, n: number): string {
  const m = YMD.exec(day)!;
  const total = +m[1] * 12 + (+m[2] - 1) + n;
  const y = Math.floor(total / 12);
  const mo = total - y * 12;
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const d = Math.min(+m[3], last);
  return `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Pregnancy week on `day` from the due date (YYYY-MM-DD): the shared
 *  280-day / 40-week rule (pregnancy-status.ts), clamped to 0-40. */
export function pregnancyWeekOn(day: string, dueDate: string | null | undefined): number | null {
  if (!dueDate || !YMD.test(dueDate) || !YMD.test(day)) return null;
  const elapsed = PREGNANCY_DAYS - (dayNumber(dueDate) - dayNumber(day));
  return Math.min(40, Math.floor(Math.max(0, Math.min(PREGNANCY_DAYS, elapsed)) / 7));
}

export function weekLabel(week: number | null): string {
  return week === null ? '' : `Week ${week}`;
}

/** "Nov 5" for a YYYY-MM-DD day (read as a calendar day, not an instant). */
export function shortDayLabel(day: string): string {
  const m = YMD.exec(day);
  if (!m) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[+m[2] - 1]} ${+m[3]}`;
}

function positive(v: unknown): number | null {
  const n = typeof v === 'number' ? v : NaN;
  return isFinite(n) && n > 0 ? n : null;
}

function wholeInRange(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function weightIn(kg: unknown, unit: WeightUnit): number | null {
  const n = positive(kg);
  return n === null ? null : kgToUnit(n, unit);
}

/** The patient's own readings, one per Manila day: the last one logged that
 *  day (each log is the whole form as saved). A weight of 0 means "not
 *  entered" and is left out. */
export function selfPoints(logs: SelfLogInput[], unit: WeightUnit, dueDate?: string | null): HealthPoint[] {
  const byDay = new Map<string, SelfLogInput>();
  for (const log of logs) {
    if (!log.loggedAt || isNaN(log.loggedAt.getTime())) continue;
    const day = manilaDay(log.loggedAt);
    const kept = byDay.get(day);
    if (!kept || kept.loggedAt!.getTime() <= log.loggedAt.getTime()) byDay.set(day, log);
  }
  return [...byDay.entries()].map(([day, log]) => ({
    day,
    source: 'self' as const,
    week: pregnancyWeekOn(day, dueDate),
    weight: weightIn(log.weight, unit),
    bpSys: positive(log.bpSys),
    bpDia: positive(log.bpDia),
    kicks: wholeInRange(log.kicks, 0, 1000),
    mood: wholeInRange(log.mood, 0, MOOD_NAMES.length - 1),
    fundalHeightCm: null,
    fetalHeartRate: null,
    pulse: null,
    temperatureC: null,
    note: '',
  }));
}

/** The clinic's readings (weight in kg, converted; the other measures as
 *  stored). One without a valid measuredOn day, or without any measure at
 *  all, is left out. Anything but a finite positive number is missing. */
export function clinicPoints(readings: ClinicReadingInput[], unit: WeightUnit, dueDate?: string | null): HealthPoint[] {
  const out: HealthPoint[] = [];
  for (const r of readings) {
    const day = typeof r.measuredOn === 'string' && YMD.test(r.measuredOn) ? r.measuredOn : null;
    if (!day || isNaN(dayNumber(day))) continue;
    const p: HealthPoint = {
      day,
      source: 'clinic',
      week: pregnancyWeekOn(day, dueDate),
      weight: weightIn(r.weightKg, unit),
      bpSys: positive(r.bpSys),
      bpDia: positive(r.bpDia),
      kicks: null,
      mood: null,
      fundalHeightCm: positive(r.fundalHeightCm),
      fetalHeartRate: positive(r.fetalHeartRate),
      pulse: positive(r.pulse),
      temperatureC: positive(r.temperatureC),
      note: typeof r.note === 'string' ? r.note : '',
    };
    const hasMeasure = p.weight !== null || p.bpSys !== null || p.bpDia !== null
      || CLINIC_MEASURES.some(m => p[m.key] !== null);
    if (hasMeasure) out.push(p);
  }
  return out;
}

/** Oldest first; on the same day the patient's own reading comes first. */
export function sortPoints(points: HealthPoint[]): HealthPoint[] {
  return [...points].sort((a, b) =>
    a.day < b.day ? -1 : a.day > b.day ? 1 : (a.source === b.source ? 0 : a.source === 'self' ? -1 : 1));
}

/** First day shown for a range (inclusive), or null for "everything".
 *  4 weeks = today and the 27 days before it; 3 months = the same day three
 *  months back; whole pregnancy = 280 days before the due date. */
export function rangeStart(range: HealthRange, today: string, dueDate?: string | null): string | null {
  if (range === '4w') return addDays(today, -27);
  if (range === '3m') return addMonths(today, -3);
  return dueDate && YMD.test(dueDate) ? addDays(dueDate, -PREGNANCY_DAYS) : null;
}

export interface LatestValue<T> { value: T; day: string; source: ReadingSource; }

export interface LatestValues {
  weight: LatestValue<number> | null;
  bp: LatestValue<{ sys: number; dia: number }> | null;
  kicks: LatestValue<number> | null;
  mood: LatestValue<number> | null;
  fundalHeightCm: LatestValue<number> | null;
  fetalHeartRate: LatestValue<number> | null;
  pulse: LatestValue<number> | null;
  temperatureC: LatestValue<number> | null;
}

/** The newest value of each measure across both sources. On the same day
 *  the clinic's measurement wins (it sorts after the patient's). */
export function latestValues(sorted: HealthPoint[]): LatestValues {
  const out: LatestValues = {
    weight: null, bp: null, kicks: null, mood: null,
    fundalHeightCm: null, fetalHeartRate: null, pulse: null, temperatureC: null,
  };
  for (const p of sorted) {
    if (p.weight !== null) out.weight = { value: p.weight, day: p.day, source: p.source };
    if (p.bpSys !== null && p.bpDia !== null) out.bp = { value: { sys: p.bpSys, dia: p.bpDia }, day: p.day, source: p.source };
    if (p.kicks !== null) out.kicks = { value: p.kicks, day: p.day, source: p.source };
    if (p.mood !== null) out.mood = { value: p.mood, day: p.day, source: p.source };
    for (const m of CLINIC_MEASURES) {
      const v = p[m.key];
      if (v !== null) out[m.key] = { value: v, day: p.day, source: p.source };
    }
  }
  return out;
}

export interface HealthSeries {
  /** Every reading, oldest first. */
  all: HealthPoint[];
  /** The readings inside the range, oldest first. */
  points: HealthPoint[];
  /** The x axis: first and last day (inclusive). */
  from: string;
  to: string;
  latest: LatestValues;
}

/** Both sources merged, sorted, cut to the range. The axis runs from the
 *  range start (or the first reading for "whole pregnancy" without a due
 *  date) to today, stretched to any later reading. */
export function buildHealthSeries(opts: {
  logs: SelfLogInput[];
  clinic: ClinicReadingInput[];
  unit: WeightUnit;
  dueDate?: string | null;
  range: HealthRange;
  today: string;
}): HealthSeries {
  const all = sortPoints([
    ...selfPoints(opts.logs, opts.unit, opts.dueDate),
    ...clinicPoints(opts.clinic, opts.unit, opts.dueDate),
  ]);
  const start = rangeStart(opts.range, opts.today, opts.dueDate);
  const points = start ? all.filter(p => p.day >= start) : all;
  const lastDay = points.length && points[points.length - 1].day > opts.today ? points[points.length - 1].day : opts.today;
  const from = start ?? (points.length ? points[0].day : opts.today);
  return { all, points, from: from < lastDay ? from : lastDay, to: lastDay, latest: latestValues(all) };
}

/** Rounded axis bounds and 3-5 tick values around [min, max]. */
export function niceScale(min: number, max: number, minSpan = 1): { min: number; max: number; ticks: number[] } {
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const raw = (hi - lo) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw)!;
  const nLo = Math.floor(lo / step) * step;
  const nHi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = nLo; v <= nHi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { min: nLo, max: nHi, ticks };
}
