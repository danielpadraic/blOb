/**
 * Live thread scroll position and unread bookkeeping.
 *
 * Pure on purpose: the thread's worst bug was scroll side effects firing from render, so the rules
 * for "are we at the bottom", "what is unread", and "how far has this person actually read" live
 * here where they can be tested without a list.
 *
 * Vocabulary, because two different counts look alike:
 * - unread ABOVE: arrived since the last visit and sits off-screen upward. The user has to scroll up
 *   to reach it. This drives the "N new since you were here" chip.
 * - new BELOW: arrived while the user was scrolled up. It sits off-screen downward. This drives the
 *   count on the jump-to-latest control.
 */

import { safeUserId } from '@/lib/safeIds';
import type { LiveThreadRow } from '@/lib/liveThread';

/**
 * How close to the bottom still counts as "at the bottom".
 *
 * Generous enough that a rubber-band overscroll or a one-line height change does not read as "the
 * user scrolled away", which would suppress the pin they expect while sitting at the newest message.
 */
export const LIVE_END_SLOP = 100;

export type LiveScrollMetrics = {
  offsetY: number;
  contentHeight: number;
  viewportHeight: number;
};

export function isAtLiveEnd(metrics: LiveScrollMetrics, slop = LIVE_END_SLOP): boolean {
  const { offsetY, contentHeight, viewportHeight } = metrics;
  // Content shorter than the viewport is entirely visible, so the newest row is already on screen.
  if (contentHeight <= viewportHeight) {
    return true;
  }
  return offsetY >= contentHeight - viewportHeight - slop;
}

/**
 * Whether an automatic scroll to the newest row is allowed right now.
 *
 * This is the guard the thread was missing. Every content change used to pin the list to the bottom,
 * which yanked the viewport away from anyone reading older messages.
 */
export function shouldPinToLiveEnd(state: {
  /** The viewport is already showing the newest row. */
  atEnd: boolean;
  /** A finger, wheel or trackpad is moving the list. */
  dragging: boolean;
  /** The thread has not yet landed on the newest row for this mount. */
  firstPaintPending: boolean;
}): boolean {
  // The opening pin is the one scroll the user expects, but never mid-gesture.
  if (state.firstPaintPending) {
    return !state.dragging;
  }
  return state.atEnd && !state.dragging;
}

/** Day separators are chrome, and a person's own message was never unread to them. */
function countsAsUnread(row: LiveThreadRow, currentUserId?: string | null): boolean {
  if (row.kind === 'day') {
    return false;
  }
  if (!currentUserId) {
    return true;
  }
  const authorId =
    row.kind === 'comment'
      ? (safeUserId(row.comment.author, row.comment.author_id) ?? row.comment.author_id)
      : (safeUserId(row.post.author, row.post.author_id) ?? row.post.author_id);
  return authorId !== currentUserId;
}

/**
 * Row ids that arrived since the last visit, oldest first.
 *
 * A missing cursor means this person has never opened the thread, so nothing is "new since you were
 * here" — the chip stays away rather than announcing the entire history as unread.
 */
export function liveUnreadCandidates(
  rows: LiveThreadRow[],
  options: { lastReadAt?: string | null; currentUserId?: string | null },
): string[] {
  const cursor = options.lastReadAt ? Date.parse(options.lastReadAt) : NaN;
  if (!Number.isFinite(cursor)) {
    return [];
  }
  const ids: string[] = [];
  for (const row of rows) {
    if (!countsAsUnread(row, options.currentUserId)) {
      continue;
    }
    const at = Date.parse(row.createdAt);
    if (Number.isFinite(at) && at > cursor) {
      ids.push(row.id);
    }
  }
  return ids;
}

export type LiveUnreadAbove = {
  count: number;
  /** Row index to jump to: the oldest thing they have not seen. -1 when there is nothing above. */
  oldestIndex: number;
};

/**
 * Unread rows sitting above the viewport.
 *
 * Anything already on screen this visit is not unread, which is why `seenIds` is subtracted before
 * the count. `firstVisibleIndex` of -1 means the list has not reported visibility yet, so nothing is
 * treated as seen by position alone.
 */
export function liveUnreadAbove(
  rows: LiveThreadRow[],
  candidateIds: Iterable<string>,
  seenIds: ReadonlySet<string>,
  firstVisibleIndex: number,
): LiveUnreadAbove {
  const candidates = new Set(candidateIds);
  if (candidates.size === 0) {
    return { count: 0, oldestIndex: -1 };
  }
  const limit = firstVisibleIndex < 0 ? rows.length : firstVisibleIndex;
  let count = 0;
  let oldestIndex = -1;
  for (let index = 0; index < limit && index < rows.length; index += 1) {
    const row = rows[index];
    if (!candidates.has(row.id) || seenIds.has(row.id)) {
      continue;
    }
    count += 1;
    if (oldestIndex < 0) {
      oldestIndex = index;
    }
  }
  return { count, oldestIndex };
}

/**
 * The cursor to persist: how far the person has actually read, without lying in either direction.
 *
 * Advances only while unread rows have been seen in order. Opening the thread pinned to the bottom
 * marks the newest rows seen, but it must not mark the middle of the backlog read — so the cursor
 * stops at the oldest thing they skipped and those rows are still waiting on the next visit.
 */
export function liveNextLastReadAt(
  rows: LiveThreadRow[],
  options: {
    candidateIds: Iterable<string>;
    seenIds: ReadonlySet<string>;
    lastReadAt?: string | null;
  },
): string | null {
  const candidates = new Set(options.candidateIds);
  let cursor = options.lastReadAt ?? null;
  if (candidates.size === 0) {
    return cursor;
  }
  for (const row of rows) {
    if (!candidates.has(row.id)) {
      continue;
    }
    if (!options.seenIds.has(row.id)) {
      break;
    }
    cursor = row.createdAt;
  }
  return cursor;
}

/**
 * How many rows landed after `anchorId`, for the count on the jump-to-latest control.
 *
 * An unknown anchor returns 0 rather than the whole thread: a stale anchor should never claim every
 * message is new.
 */
export function liveNewBelowCount(
  rows: LiveThreadRow[],
  anchorId: string | null,
  currentUserId?: string | null,
): number {
  if (!anchorId) {
    return 0;
  }
  const anchor = rows.findIndex((row) => row.id === anchorId);
  if (anchor < 0) {
    return 0;
  }
  let count = 0;
  for (let index = anchor + 1; index < rows.length; index += 1) {
    if (countsAsUnread(rows[index], currentUserId)) {
      count += 1;
    }
  }
  return count;
}

/** "3 new since you were here" / "1 new since you were here". */
export function liveUnreadChipLabel(count: number): string {
  return `${count} new since you were here`;
}

/** The jump control shows a count only when messages arrived behind the user's back. */
export function liveJumpLabel(newBelow: number): string {
  return newBelow > 0 ? `Jump to newest, ${newBelow} new` : 'Jump to newest';
}
