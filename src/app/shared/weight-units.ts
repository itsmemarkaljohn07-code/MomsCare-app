// weight-units.ts
//
// Weights are always STORED in kg (health logs, photo health snapshots).
// The patient's Weight Unit (Pregnancy Settings, profile.weightUnit) only
// changes how they are shown and typed in. Nothing stored is converted.

export type WeightUnit = 'kg' | 'lbs';

export const LBS_PER_KG = 2.20462;

/** The profile's unit; anything missing or unknown means kg. */
export function weightUnitOf(value: unknown): WeightUnit {
  return value === 'lbs' ? 'lbs' : 'kg';
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** A stored kg value in the chosen unit, to 1 decimal (for display and
 *  for pre-filling the input). Not a number gives 0. */
export function kgToUnit(kg: number, unit: WeightUnit): number {
  const n = Number(kg);
  if (!isFinite(n)) return 0;
  return round(unit === 'lbs' ? n * LBS_PER_KG : n, 1);
}

/** A value typed in the chosen unit, as kg to store (2 decimals). */
export function unitToKg(value: number, unit: WeightUnit): number {
  const n = Number(value);
  if (!isFinite(n)) return 0;
  return round(unit === 'lbs' ? n / LBS_PER_KG : n, 2);
}

/** The label shown next to a weight. */
export function weightUnitLabel(unit: WeightUnit): string {
  return unit === 'lbs' ? 'lbs' : 'kg';
}
