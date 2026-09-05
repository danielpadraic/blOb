import { describe, expect, it } from 'vitest';

import type { LiveThreadRow } from '@/lib/liveThread';
import {
  isAtLiveEnd,
  liveJumpLabel,
  liveNewBelowCount,
  liveNextLastReadAt,
  liveUnreadAbove,
  liveUnreadCandidates,
  liveUnreadChipLabel,
  shouldPinToLiveEnd,
} from '@/lib/liveThreadUnread';

const ME = 'me-1';
const THEM = 'them-1';

function postRow(id: string, minute: number, authorId = THEM): LiveThreadRow {
  return {
    id,
    createdAt: new Date(Date.parse('2026-09-05T18:00:00.000Z') + minute * 60_000).toISOString(),
    kind: 'post',
    post: {
      id,
      author_id: authorId,
      author: { id: authorId, username: 'them', display_name: 'Them', avatar_url: null },
      challenge_id: 'c-1',
      content: 'hi',
      media_urls: [],
      created_at: new Date(Date.parse('2026-09-05T18:00:00.000Z') + minute * 60_000).toISOString(),
      comments: [],
      reactions: [],
    } as unknown as LiveThreadRow extends { post: infer P } ? P : never,
  } as LiveThreadRow;
}

function dayRow(id: string, minute: number): LiveThreadRow {
  return {
    id,
    createdAt: new Date(Date.parse('2026-09-05T18:00:00.000Z') + minute * 60_000).toISOString(),
    kind: 'day',
    periodKey: '2026-09-05',
    dateLine: 'Saturday, September 5, 2026',
    dayLine: 'Day 5 / 30',
  };
}

describe('is the viewport at the newest row', () => {
  it('is at the end when the content fits the viewport', () => {
    expect(isAtLiveEnd({ offsetY: 0, contentHeight: 300, viewportHeight: 600 })).toBe(true);
  });

  it('is at the end when parked at the bottom', () => {
    expect(isAtLiveEnd({ offsetY: 2400, contentHeight: 3000, viewportHeight: 600 })).toBe(true);
  });

  it('tolerates a small gap so an overscroll does not read as scrolling away', () => {
    expect(isAtLiveEnd({ offsetY: 2340, contentHeight: 3000, viewportHeight: 600 })).toBe(true);
  });

  it('is not at the end once they have scrolled up a screen', () => {
    expect(isAtLiveEnd({ offsetY: 1800, contentHeight: 3000, viewportHeight: 600 })).toBe(false);
  });
});

describe('when an automatic scroll to newest is allowed', () => {
  it('pins on first paint', () => {
    expect(shouldPinToLiveEnd({ atEnd: false, dragging: false, firstPaintPending: true })).toBe(true);
  });

  it('does not pin on first paint if a finger is already moving the list', () => {
    expect(shouldPinToLiveEnd({ atEnd: false, dragging: true, firstPaintPending: true })).toBe(false);
  });

  it('keeps the pin while the user sits at the bottom', () => {
    expect(shouldPinToLiveEnd({ atEnd: true, dragging: false, firstPaintPending: false })).toBe(true);
  });

  /** This is the reported bug: new content arriving must not yank a reader back to the bottom. */
  it('never pins while the user is reading older messages', () => {
    expect(shouldPinToLiveEnd({ atEnd: false, dragging: false, firstPaintPending: false })).toBe(false);
  });

  it('never pins mid-gesture, even at the bottom', () => {
    expect(shouldPinToLiveEnd({ atEnd: true, dragging: true, firstPaintPending: false })).toBe(false);
  });
});

describe('what counts as unread', () => {
  const rows = [postRow('a', 0), postRow('b', 10), postRow('c', 20), postRow('d', 30)];

  it('is everything newer than the cursor', () => {
    const cursor = rows[1].createdAt;
    expect(liveUnreadCandidates(rows, { lastReadAt: cursor, currentUserId: ME })).toEqual(['c', 'd']);
  });

  it('is nothing on a first-ever visit, so the chip does not announce the whole history', () => {
    expect(liveUnreadCandidates(rows, { lastReadAt: null, currentUserId: ME })).toEqual([]);
  });

  it('skips the reader’s own messages', () => {
    const mixed = [postRow('a', 0), postRow('mine', 10, ME), postRow('c', 20)];
    expect(liveUnreadCandidates(mixed, { lastReadAt: mixed[0].createdAt, currentUserId: ME })).toEqual(['c']);
  });

  it('skips day separators', () => {
    const withDay = [postRow('a', 0), dayRow('day:1', 5), postRow('c', 20)];
    expect(liveUnreadCandidates(withDay, { lastReadAt: withDay[0].createdAt, currentUserId: ME })).toEqual(['c']);
  });

  it('ignores an unparseable cursor rather than counting everything', () => {
    expect(liveUnreadCandidates(rows, { lastReadAt: 'not a date', currentUserId: ME })).toEqual([]);
  });
});

describe('unread sitting above the viewport', () => {
  const rows = [postRow('a', 0), postRow('b', 10), postRow('c', 20), postRow('d', 30), postRow('e', 40)];
  const candidates = ['b', 'c', 'd', 'e'];

  it('counts only what is off-screen upward', () => {
    // Viewport starts at row index 3, so b and c are above it.
    const above = liveUnreadAbove(rows, candidates, new Set(), 3);
    expect(above.count).toBe(2);
    expect(above.oldestIndex).toBe(1);
  });

  it('drops rows the user has already scrolled through', () => {
    const above = liveUnreadAbove(rows, candidates, new Set(['b']), 3);
    expect(above.count).toBe(1);
    expect(above.oldestIndex).toBe(2);
  });

  it('reaches zero once every row above has been seen', () => {
    const above = liveUnreadAbove(rows, candidates, new Set(['b', 'c']), 3);
    expect(above).toEqual({ count: 0, oldestIndex: -1 });
  });

  it('is zero when the thread is scrolled to the top', () => {
    expect(liveUnreadAbove(rows, candidates, new Set(), 0)).toEqual({ count: 0, oldestIndex: -1 });
  });

  it('is zero when nothing arrived since the last visit', () => {
    expect(liveUnreadAbove(rows, [], new Set(), 3)).toEqual({ count: 0, oldestIndex: -1 });
  });
});

describe('the cursor that gets persisted', () => {
  const rows = [postRow('a', 0), postRow('b', 10), postRow('c', 20), postRow('d', 30)];
  const candidates = ['b', 'c', 'd'];

  it('advances through rows that were actually seen, in order', () => {
    const next = liveNextLastReadAt(rows, {
      candidateIds: candidates,
      seenIds: new Set(['b', 'c']),
      lastReadAt: rows[0].createdAt,
    });
    expect(next).toBe(rows[2].createdAt);
  });

  /**
   * Opening pinned to the bottom shows the newest row but skips the backlog. The cursor must stop at
   * the gap so those rows are still unread on the next visit.
   */
  it('stops at the oldest row they skipped, even though the newest was on screen', () => {
    const next = liveNextLastReadAt(rows, {
      candidateIds: candidates,
      seenIds: new Set(['d']),
      lastReadAt: rows[0].createdAt,
    });
    expect(next).toBe(rows[0].createdAt);
  });

  it('reaches the newest row once the whole backlog has been read', () => {
    const next = liveNextLastReadAt(rows, {
      candidateIds: candidates,
      seenIds: new Set(['b', 'c', 'd']),
      lastReadAt: rows[0].createdAt,
    });
    expect(next).toBe(rows[3].createdAt);
  });

  it('leaves the cursor alone when there is nothing new', () => {
    expect(
      liveNextLastReadAt(rows, { candidateIds: [], seenIds: new Set(), lastReadAt: rows[0].createdAt }),
    ).toBe(rows[0].createdAt);
  });
});

describe('new messages below the fold', () => {
  const rows = [postRow('a', 0), postRow('b', 10), postRow('c', 20), postRow('d', 30)];

  it('counts what arrived after the row they left the bottom on', () => {
    expect(liveNewBelowCount(rows, 'b', ME)).toBe(2);
  });

  it('is zero at the newest row', () => {
    expect(liveNewBelowCount(rows, 'd', ME)).toBe(0);
  });

  it('is zero without an anchor, instead of claiming the thread is new', () => {
    expect(liveNewBelowCount(rows, null, ME)).toBe(0);
  });

  it('is zero for an anchor that is no longer in the thread', () => {
    expect(liveNewBelowCount(rows, 'gone', ME)).toBe(0);
  });

  it('does not count the reader’s own new message', () => {
    const mine = [...rows, postRow('mine', 40, ME)];
    expect(liveNewBelowCount(mine, 'd', ME)).toBe(0);
  });

  it('does not count day separators', () => {
    const withDay = [...rows, dayRow('day:2', 35), postRow('e', 40)];
    expect(liveNewBelowCount(withDay, 'd', ME)).toBe(1);
  });
});

describe('labels', () => {
  it('reads as a sentence in the chip', () => {
    expect(liveUnreadChipLabel(3)).toBe('3 new since you were here');
    expect(liveUnreadChipLabel(1)).toBe('1 new since you were here');
  });

  it('describes the jump control for screen readers', () => {
    expect(liveJumpLabel(0)).toBe('Jump to newest');
    expect(liveJumpLabel(3)).toBe('Jump to newest, 3 new');
  });
});
