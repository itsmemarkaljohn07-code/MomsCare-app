// fetus-images.ts
// The week-by-week fetus illustrations in src/assets/fetus/. The week is the
// number after "week" in each file name (the leading number is only a sort
// prefix and isn't used). Only weeks that have their own image are listed;
// any other week shows the closest earlier one (see fetusImageFor).
// When adding or removing a file, update this list; `npm run check:fetus`
// fails if the list and the folder disagree.

export interface FetusImage {
  /** The pregnancy week the image illustrates. */
  week: number;
  /** Path the app loads it from. */
  file: string;
}

export const FETUS_IMAGES: readonly FetusImage[] = [
  { week: 1,  file: 'assets/fetus/01_week01.png' },
  { week: 3,  file: 'assets/fetus/02_week03.png' },
  { week: 5,  file: 'assets/fetus/03_week05.png' },
  { week: 7,  file: 'assets/fetus/04_week07.png' },
  { week: 9,  file: 'assets/fetus/05_week9.png' },
  { week: 11, file: 'assets/fetus/07_week11.png' },
  { week: 13, file: 'assets/fetus/8_week13.png' },
  { week: 15, file: 'assets/fetus/9_week15.png' },
  { week: 17, file: 'assets/fetus/10_week17.png' },
  { week: 19, file: 'assets/fetus/11_week19.png' },
  { week: 24, file: 'assets/fetus/12_week24.png' },
  { week: 28, file: 'assets/fetus/13_week28.jpeg' },
  { week: 36, file: 'assets/fetus/23_week36.jpeg' },
].sort((a, b) => a.week - b.week);

/** The image for a week: the entry with the highest week <= `week`, or
 *  the first entry when `week` is earlier than all of them (including
 *  week 0, before the due date is known). */
export function fetusImageFor(week: number): FetusImage {
  let match = FETUS_IMAGES[0];
  for (const image of FETUS_IMAGES) {
    if (image.week <= week) match = image;
  }
  return match;
}
