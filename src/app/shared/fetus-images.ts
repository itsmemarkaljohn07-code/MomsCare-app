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
  /** Where the fetus is (percent of the image): kept fully visible, with a
   *  margin, by the stage's edge fade (home.page.scss .fetus-img). */
  keep: FetusKeep;
}

/** A rectangle in percent of the image, measured from its left/top edge. */
export interface FetusKeep {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const FETUS_IMAGES: readonly FetusImage[] = [
  { week: 1,  file: 'assets/fetus/01_week01.png', keep: { left: 6, top: 2, right: 91, bottom: 97 } },
  { week: 3,  file: 'assets/fetus/02_week03.png', keep: { left: 9, top: 4, right: 88, bottom: 100 } },
  { week: 5,  file: 'assets/fetus/03_week05.png', keep: { left: 8, top: 6, right: 80, bottom: 93 } },
  { week: 7,  file: 'assets/fetus/04_week07.png', keep: { left: 10, top: 2, right: 91, bottom: 98 } },
  { week: 9,  file: 'assets/fetus/05_week9.png', keep: { left: 12, top: 2, right: 98, bottom: 85 } },
  { week: 11, file: 'assets/fetus/07_week11.png', keep: { left: 10, top: 7, right: 92, bottom: 93 } },
  { week: 13, file: 'assets/fetus/8_week13.png', keep: { left: 12, top: 7, right: 93, bottom: 98 } },
  { week: 15, file: 'assets/fetus/9_week15.png', keep: { left: 20, top: 2, right: 92, bottom: 96 } },
  { week: 17, file: 'assets/fetus/10_week17.png', keep: { left: 14, top: 2, right: 86, bottom: 92 } },
  { week: 19, file: 'assets/fetus/11_week19.png', keep: { left: 4, top: 4, right: 90, bottom: 92 } },
  { week: 24, file: 'assets/fetus/12_week24.png', keep: { left: 6, top: 14, right: 93, bottom: 90 } },
  { week: 28, file: 'assets/fetus/13_week28.jpeg', keep: { left: 14, top: 2, right: 86, bottom: 96 } },
  { week: 36, file: 'assets/fetus/23_week36.jpeg', keep: { left: 8, top: 2, right: 92, bottom: 93 } },
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
