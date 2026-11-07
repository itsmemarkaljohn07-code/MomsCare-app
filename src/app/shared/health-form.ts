// health-form.ts
// The checks for the "Log Health Data" form: what she typed, the limits,
// and the exact fields saved. No Angular and no Firebase here, so every
// rule can be tested on its own. Weight is typed in her unit, stored in kg.

import { kgToUnit, unitToKg } from './weight-units';
import type { WeightUnit } from './weight-units';

export const WEIGHT_KG_MIN = 30;
export const WEIGHT_KG_MAX = 250;
export const BP_SYS_MIN = 60;
export const BP_SYS_MAX = 260;
export const BP_DIA_MIN = 30;
export const BP_DIA_MAX = 160;

/** The form as typed. A blank number field is null (or ''). */
export interface HealthFormDraft {
  weight: number | string | null;
  bpSys: number | string | null;
  bpDia: number | string | null;
  kicks: number;
  mood: number;
}

export type HealthFormErrors = Partial<Record<'weight' | 'bp' | 'form', string>>;

/** What is saved: only the measures she entered, plus kicks and mood. */
export interface HealthFormEntry {
  weight?: number;
  bpSys?: number;
  bpDia?: number;
  kicks: number;
  mood: number;
}

/** A typed number, or null for a blank field. NaN for anything unreadable. */
function typed(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    if (v.trim() === '') return null;
    const n = Number(v);
    return isFinite(n) ? n : NaN;
  }
  return isFinite(v) ? v : NaN;
}

function weightRangeText(unit: WeightUnit): string {
  return `${kgToUnit(WEIGHT_KG_MIN, unit)} and ${kgToUnit(WEIGHT_KG_MAX, unit)} ${unit}`;
}

/** Problems with the form; an empty object means it can be saved.
 *  `opened` is the kicks and mood the form opened with: a save that adds
 *  no weight or blood pressure and leaves both unchanged is refused. */
export function validateHealthForm(
  d: HealthFormDraft, unit: WeightUnit, opened: { kicks: number; mood: number },
): HealthFormErrors {
  const e: HealthFormErrors = {};
  const weight = typed(d.weight);
  const sys = typed(d.bpSys);
  const dia = typed(d.bpDia);

  if (weight !== null) {
    const kg = unitToKg(weight, unit);
    if (isNaN(weight) || kg < WEIGHT_KG_MIN || kg > WEIGHT_KG_MAX) {
      e.weight = `Enter a weight between ${weightRangeText(unit)}.`;
    }
  }

  if ((sys === null) !== (dia === null)) {
    e.bp = 'Enter both numbers (systolic and diastolic), or leave both empty.';
  } else if (sys !== null && dia !== null) {
    if (isNaN(sys) || sys < BP_SYS_MIN || sys > BP_SYS_MAX) {
      e.bp = `Systolic (the first number) must be between ${BP_SYS_MIN} and ${BP_SYS_MAX}.`;
    } else if (isNaN(dia) || dia < BP_DIA_MIN || dia > BP_DIA_MAX) {
      e.bp = `Diastolic (the second number) must be between ${BP_DIA_MIN} and ${BP_DIA_MAX}.`;
    } else if (sys <= dia) {
      e.bp = 'Systolic (the first number) must be higher than diastolic.';
    }
  }

  const nothingNew = weight === null && sys === null && dia === null
    && d.kicks === opened.kicks && d.mood === opened.mood;
  if (nothingNew) e.form = 'Nothing to save yet. Enter your weight, your blood pressure, or update kicks or mood.';
  return e;
}

/** The fields to save. Only call with a form that passed validation. */
export function buildHealthEntry(d: HealthFormDraft, unit: WeightUnit): HealthFormEntry {
  const out: HealthFormEntry = { kicks: d.kicks, mood: d.mood };
  const weight = typed(d.weight);
  const sys = typed(d.bpSys);
  const dia = typed(d.bpDia);
  if (weight !== null) out.weight = unitToKg(weight, unit);
  if (sys !== null && dia !== null) {
    out.bpSys = sys;
    out.bpDia = dia;
  }
  return out;
}

/** A stored value worth showing (or using as a placeholder): a finite
 *  positive number. 0, missing and anything else give null. */
export function realValue(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : null;
}
