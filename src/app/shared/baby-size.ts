// baby-size.ts
// The one week -> baby-size comparison table (name, emoji, length, weight),
// so Home and Profile always show the same thing for the same week. The
// fetal pictures are a separate table (fetus-images.ts).

export interface BabySize {
  emoji: string;
  /** The comparison, e.g. "lime" ("About the size of a lime"). */
  fruit: string;
  length: string;
  weight: string;
}

/** Keyed by the first week each row applies to. */
export const BABY_SIZES: Readonly<Record<number, BabySize>> = {
  4:  { emoji: '🌱', fruit: 'poppy seed',      length: '0.1 cm',  weight: '<1 g' },
  6:  { emoji: '🫘', fruit: 'lentil',          length: '0.6 cm',  weight: '<1 g' },
  8:  { emoji: '🫐', fruit: 'raspberry',       length: '1.6 cm',  weight: '1 g' },
  10: { emoji: '🍓', fruit: 'strawberry',      length: '3.1 cm',  weight: '4 g' },
  12: { emoji: '🍋', fruit: 'lime',            length: '5.4 cm',  weight: '14 g' },
  14: { emoji: '🍑', fruit: 'peach',           length: '8.7 cm',  weight: '43 g' },
  16: { emoji: '🥑', fruit: 'avocado',         length: '11.6 cm', weight: '100 g' },
  18: { emoji: '🍠', fruit: 'sweet potato',    length: '14.2 cm', weight: '190 g' },
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

const ROW_WEEKS = Object.keys(BABY_SIZES).map(Number).sort((a, b) => a - b);

/** The row for a week: the last row starting at or before it. Weeks before
 *  the first row use the first row; weeks after 40 use week 40. */
export function babySizeFor(week: number): BabySize {
  let row = ROW_WEEKS[0];
  for (const w of ROW_WEEKS) if (week >= w) row = w;
  return BABY_SIZES[row];
}
