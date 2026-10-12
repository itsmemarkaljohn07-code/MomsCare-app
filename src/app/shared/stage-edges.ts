// stage-edges.ts
// Reads an illustration's border colours so the Home viewer's stage can be
// painted in the image's own background colour and the image feathered into
// it. Pure helpers; the canvas work only happens in the browser.

export interface Rgb { r: number; g: number; b: number; }

export interface StageEdges {
  avg: Rgb;
  /** A ring 15-25% inside the edges: what the image looks like just inside
   *  its feather, so the stage centre can match it. */
  inner: Rgb;
  top: Rgb;
  bottom: Rgb;
  left: Rgb;
  right: Rgb;
}

/** Used until an image has loaded, or if sampling fails. */
const FALLBACK: Rgb = { r: 0x3a, g: 0x0f, b: 0x1c }; // #3a0f1c
export const FALLBACK_EDGES: StageEdges = { avg: FALLBACK, inner: FALLBACK, top: FALLBACK, bottom: FALLBACK, left: FALLBACK, right: FALLBACK };

/** Size the image is reduced to before sampling. */
const SAMPLE_SIZE = 50;
/** Outer 4% of each side (2 px of 50). */
const BORDER_PX = 2;
/** The inner ring, as a fraction of the image (15-25% in from each side). */
const INNER_FROM = 0.15;
const INNER_TO = 0.25;
/** Stage centre: this much of the inner ring mixed into the edge colour. */
const CENTRE_INNER_MIX = 0.5;

/**
 * Averages the outer 4% on each side of a loaded image. Local same-origin
 * assets, so the canvas isn't tainted. Returns null if it can't be read.
 */
export function sampleEdges(img: HTMLImageElement): StageEdges | null {
  try {
    if (!img.naturalWidth || !img.naturalHeight) return null;
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    const sums = { top: [0, 0, 0, 0], bottom: [0, 0, 0, 0], left: [0, 0, 0, 0], right: [0, 0, 0, 0] };
    const inner = [0, 0, 0, 0];
    const lo = Math.floor(SAMPLE_SIZE * INNER_FROM), hi = Math.ceil(SAMPLE_SIZE * INNER_TO);
    for (let y = 0; y < SAMPLE_SIZE; y++) {
      for (let x = 0; x < SAMPLE_SIZE; x++) {
        const sides: (keyof typeof sums)[] = [];
        if (y < BORDER_PX) sides.push('top');
        if (y >= SAMPLE_SIZE - BORDER_PX) sides.push('bottom');
        if (x < BORDER_PX) sides.push('left');
        if (x >= SAMPLE_SIZE - BORDER_PX) sides.push('right');
        const i = (y * SAMPLE_SIZE + x) * 4;
        // Distance in from the nearest side, in sample pixels.
        const d = Math.min(x, y, SAMPLE_SIZE - 1 - x, SAMPLE_SIZE - 1 - y);
        if (d >= lo && d < hi) {
          inner[0] += data[i]; inner[1] += data[i + 1]; inner[2] += data[i + 2]; inner[3] += 1;
        }
        if (sides.length === 0) continue;
        for (const side of sides) {
          sums[side][0] += data[i];
          sums[side][1] += data[i + 1];
          sums[side][2] += data[i + 2];
          sums[side][3] += 1;
        }
      }
    }
    const avgOf = (s: number[]): Rgb => ({ r: Math.round(s[0] / s[3]), g: Math.round(s[1] / s[3]), b: Math.round(s[2] / s[3]) });
    const top = avgOf(sums.top), bottom = avgOf(sums.bottom), left = avgOf(sums.left), right = avgOf(sums.right);
    const avg: Rgb = {
      r: Math.round((top.r + bottom.r + left.r + right.r) / 4),
      g: Math.round((top.g + bottom.g + left.g + right.g) / 4),
      b: Math.round((top.b + bottom.b + left.b + right.b) / 4),
    };
    return { avg, inner: avgOf(inner), top, bottom, left, right };
  } catch (err) {
    console.warn('[home] could not sample the image edges:', err);
    return null;
  }
}

function hex({ r, g, b }: Rgb): string {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return { r: a.r + (b.r - a.r) * amount, g: a.g + (b.g - a.g) * amount, b: a.b + (b.b - a.b) * amount };
}

/** The CSS variables the stage reads. */
export function edgeStyle(e: StageEdges): Record<string, string> {
  const round = (c: Rgb): Rgb => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) });
  return {
    '--stage-edge': hex(e.avg),
    '--stage-centre': hex(round(mix(e.avg, e.inner, CENTRE_INNER_MIX))),
    '--stage-top': hex(e.top),
    '--stage-bottom': hex(e.bottom),
    '--stage-left': hex(e.left),
    '--stage-right': hex(e.right),
  };
}
