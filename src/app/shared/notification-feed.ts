// notification-feed.ts
// The bell's list is put together from three sources, newest first:
//   live     - the newest page, kept up to date by a listener
//   retained - entries that were in the live page earlier but were pushed
//              out of it by newer ones (still shown, as last seen)
//   older    - pages fetched with "Load more"
// The same entry can appear in more than one source; it is shown once,
// and the live copy wins (its read state is current). No Angular, no
// Firebase here, so the rules can be tested on their own.

export const NOTIFICATION_PAGE_SIZE = 15;

export interface FeedEntry {
  id: string;
  createdAt?: unknown;
}

/** createdAt as ms. A server time not known yet (just written) counts as
 *  now, so a brand-new entry sorts to the top. */
export function createdMillis(entry: FeedEntry, now: number = Date.now()): number {
  const t = entry.createdAt as { toMillis?: () => number; seconds?: number } | null | undefined;
  if (t && typeof t.toMillis === 'function') return t.toMillis();
  if (t && typeof t.seconds === 'number') return t.seconds * 1000;
  return now;
}

/** One list, each id once (live > retained > older), newest first; ties
 *  by id so the order never jumps. */
export function mergeFeed<T extends FeedEntry>(live: T[], retained: T[], older: T[], now: number = Date.now()): T[] {
  const byId = new Map<string, T>();
  for (const list of [older, retained, live]) for (const e of list) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) =>
    createdMillis(b, now) - createdMillis(a, now) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Entries that were pushed out of the live page by newer ones and must
 *  stay in the list. An entry that left the page for any other reason
 *  (deleted on the server) is not kept: only a full new page can push
 *  entries out, and only ones not newer than its last entry. */
export function droppedFromLive<T extends FeedEntry>(previous: T[], next: T[], now: number = Date.now()): T[] {
  if (next.length < NOTIFICATION_PAGE_SIZE) return [];
  const nextIds = new Set(next.map(e => e.id));
  const oldestLive = createdMillis(next[next.length - 1], now);
  return previous.filter(e => !nextIds.has(e.id) && createdMillis(e, now) <= oldestLive);
}

/** True once there is nothing older to load: the live page wasn't full and
 *  nothing was fetched yet, or the last "Load more" came back short. */
export function reachedEnd(livePageSize: number, olderPagesLoaded: number, lastOlderPageSize: number | null): boolean {
  if (olderPagesLoaded === 0) return livePageSize < NOTIFICATION_PAGE_SIZE;
  return (lastOlderPageSize ?? 0) < NOTIFICATION_PAGE_SIZE;
}
