// Run: node --import ./tests/unit/resolve-ts.mjs --test tests/unit/baby-size.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BABY_SIZES, babySizeFor } from '../../src/app/shared/baby-size.ts';

// Expected comparison for every week 4-40, written out independently.
const EXPECTED: Record<number, string> = {};
const rows: [number, number, string][] = [
  [4, 5, 'poppy seed'], [6, 7, 'lentil'], [8, 9, 'raspberry'], [10, 11, 'strawberry'],
  [12, 13, 'lime'], [14, 15, 'peach'], [16, 17, 'avocado'], [18, 19, 'sweet potato'],
  [20, 21, 'mango'], [22, 25, 'corn'], [26, 27, 'lettuce head'], [28, 29, 'eggplant'],
  [30, 31, 'broccoli'], [32, 33, 'coconut'], [34, 35, 'pineapple'], [36, 37, 'romaine lettuce'],
  [38, 39, 'small pumpkin'], [40, 40, 'watermelon'],
];
for (const [from, to, fruit] of rows) for (let w = from; w <= to; w++) EXPECTED[w] = fruit;

test('every week from 4 to 40 has the expected comparison', () => {
  for (let w = 4; w <= 40; w++) assert.equal(babySizeFor(w).fruit, EXPECTED[w], `week ${w}`);
});

test('each week returns the whole row (name, emoji, length, weight together)', () => {
  for (let w = 4; w <= 40; w++) {
    const row = babySizeFor(w);
    assert.ok(Object.values(BABY_SIZES).includes(row), `week ${w}`);
    assert.ok(row.emoji && row.length && row.weight, `week ${w}`);
  }
  assert.deepEqual(babySizeFor(12), { emoji: '🍋', fruit: 'lime', length: '5.4 cm', weight: '14 g' });
});

test('boundaries: before the first row uses it, after 40 uses week 40', () => {
  for (const w of [-1, 0, 1, 3]) assert.equal(babySizeFor(w).fruit, 'poppy seed', `week ${w}`);
  for (const w of [41, 42, 45, 60]) assert.equal(babySizeFor(w).fruit, 'watermelon', `week ${w}`);
  assert.equal(babySizeFor(5).fruit, 'poppy seed');
  assert.equal(babySizeFor(6).fruit, 'lentil');
  assert.equal(babySizeFor(39).fruit, 'small pumpkin');
});

test('fixed emojis', () => {
  assert.equal(babySizeFor(6).emoji, '🫘');
  assert.equal(babySizeFor(8).emoji, '🫐');
  assert.equal(babySizeFor(18).emoji, '🍠');
  assert.equal(babySizeFor(4).emoji, '🌱');
});

test('no page keeps its own week -> fruit table', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts') && !p.endsWith('baby-size.ts')) files.push(p);
    }
  };
  walk(new URL('../../src/app', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const offenders = files.filter(f => /\bbabySizes\b|fruit:\s*'/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});
