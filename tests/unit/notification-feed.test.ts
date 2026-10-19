// Run: node --import ./tests/unit/resolve-ts.mjs --test tests/unit/notification-feed.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTIFICATION_PAGE_SIZE, createdMillis, droppedFromLive, mergeFeed, reachedEnd,
} from '../../src/app/shared/notification-feed.ts';

const ts = (ms: number) => ({ toMillis: () => ms });
const n = (id: string, ms: number | null, read = false) => ({ id, createdAt: ms === null ? null : ts(ms), read });
const ids = (list: { id: string }[]) => list.map(e => e.id);

test('newest first, each id once', () => {
  const live = [n('a', 500), n('b', 400)];
  const older = [n('b', 400), n('c', 300), n('d', 200)];
  assert.deepEqual(ids(mergeFeed(live, [], older)), ['a', 'b', 'c', 'd']);
});

test('the live copy wins over retained and older copies (current read state)', () => {
  const merged = mergeFeed([n('x', 100, true)], [n('x', 100, false)], [n('x', 100, false)]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].read, true);
});

const page = (from: number, count: number, prefix = 'e') =>
  Array.from({ length: count }, (_, i) => n(`${prefix}${from - i}`, (from - i) * 10));

test('entries pushed out of a full live page by newer ones are kept (retained)', () => {
  const before = page(15, 15);                    // e15 .. e1
  const after = [n('new', 1000), ...page(15, 14)]; // new, e15 .. e2
  const dropped = droppedFromLive(before, after);
  assert.deepEqual(ids(dropped), ['e1']);
  const merged = mergeFeed(after, dropped, []);
  assert.equal(merged.length, 16);
  assert.deepEqual(ids(merged).slice(0, 2), ['new', 'e15']);
  assert.equal(ids(merged).at(-1), 'e1');
});

test('an entry deleted on the server is not kept', () => {
  // Fewer than a page: nothing can have been pushed out.
  assert.deepEqual(droppedFromLive([n('a', 30), n('b', 20)], [n('b', 20)]), []);
  // A full page that lost a newer entry and gained an older one: the newer one was deleted.
  const before = page(16, 15);                    // e16 .. e2
  const after = [...page(15, 14), n('e1', 10)];  // e16 deleted, e1 moved up
  assert.deepEqual(droppedFromLive(before, after), []);
});

test('a page of older entries that overlaps the live page adds no duplicates', () => {
  const live = Array.from({ length: 15 }, (_, i) => n(`L${i}`, 1000 - i));
  const older = [n('L13', 987), n('L14', 986), n('O1', 900), n('O2', 899)];
  const merged = mergeFeed(live, [], older);
  assert.equal(merged.length, 17);
  assert.equal(new Set(ids(merged)).size, merged.length);
  assert.deepEqual(ids(merged).slice(-3), ['L14', 'O1', 'O2']);
});

test('a just-written entry (server time not known yet) is at the top', () => {
  const merged = mergeFeed([n('old', 1_000), n('pending', null)], [], [], 5_000);
  assert.deepEqual(ids(merged), ['pending', 'old']);
  assert.equal(createdMillis(n('pending', null), 7), 7);
  assert.equal(createdMillis({ id: 's', createdAt: { seconds: 3 } }), 3000);
});

test('equal times keep a stable order (by id)', () => {
  assert.deepEqual(ids(mergeFeed([n('b', 5), n('a', 5)], [], [n('c', 5)])), ['a', 'b', 'c']);
});

test('end of list', () => {
  assert.equal(NOTIFICATION_PAGE_SIZE, 15);
  assert.equal(reachedEnd(3, 0, null), true);       // fewer than a page in total
  assert.equal(reachedEnd(15, 0, null), false);     // a full first page: there may be more
  assert.equal(reachedEnd(15, 1, 15), false);       // a full older page: maybe more
  assert.equal(reachedEnd(15, 2, 4), true);         // a short older page: that was the last
  assert.equal(reachedEnd(15, 1, 0), true);         // an empty older page
});
