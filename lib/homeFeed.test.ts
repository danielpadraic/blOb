import { describe, expect, it } from 'vitest';

import {
  HOME_PAGE_MAX,
  HOME_PAGE_MIN,
  HOME_PAGE_SIZE,
  HOME_RAW_WINDOW,
  asIdSet,
  filterHomeFeedPosts,
  homeFeedAllowsPost,
  homeFeedCursorFrom,
  homeFeedEmptyPhase,
  homeFeedFirstPaintLoading,
  homeFeedHasSocialGraph,
  homeFeedPageIsMiss,
  shouldShowHomeSplash,
  takeHomeVisiblePage,
  uniquePostsById,
  withSatelliteTimeout,
  type HomeFeedAllowContext,
  type HomeFeedPost,
} from '@/lib/homeFeed';

function ctx(partial: Partial<HomeFeedAllowContext> = {}): HomeFeedAllowContext {
  return {
    viewerId: 'me',
    hidden: new Set(),
    muted: new Set(),
    blocked: new Set(),
    friends: new Set(),
    official: new Set(),
    recommended: new Set(),
    challengeIds: new Set(),
    circleIds: new Set(),
    corporateIds: new Set(),
    fofAuthors: new Set(),
    ...partial,
  };
}

function post(id: string, extra: Partial<HomeFeedPost> = {}): HomeFeedPost {
  return {
    id,
    created_at: `2026-08-29T12:00:${id.padStart(2, '0')}.000Z`,
    author_id: 'friend',
    audience: 'public',
    ...extra,
  };
}

describe('home feed first paint', () => {
  it('is loading only until the first query settles', () => {
    expect(homeFeedFirstPaintLoading({ postCount: 0, isFetched: false })).toBe(true);
    expect(homeFeedFirstPaintLoading({ postCount: 0, isFetched: true })).toBe(false);
    expect(homeFeedFirstPaintLoading({ postCount: 2, isFetched: false })).toBe(false);
    expect(homeFeedFirstPaintLoading({ postCount: 0, isFetched: false, failed: true })).toBe(false);
    expect(homeFeedFirstPaintLoading({ postCount: 0, isPending: true })).toBe(true);
    expect(homeFeedFirstPaintLoading({ postCount: 0, isPending: false, isFetched: false })).toBe(
      false,
    );
  });
});

describe('home feed empty phase', () => {
  it('shimmers while posts are pending and uses Bob only after a failed query', () => {
    expect(homeFeedEmptyPhase({ postCount: 0, isLoading: true })).toBe('shimmer');
    expect(homeFeedEmptyPhase({ postCount: 0, isFetched: false })).toBe('shimmer');
    expect(homeFeedEmptyPhase({ postCount: 0, isLoading: false, failed: true })).toBe('error');
    expect(shouldShowHomeSplash({ postCount: 0, failed: true })).toBe(true);
    expect(shouldShowHomeSplash({ postCount: 0, isLoading: true, waitedMs: 4000 })).toBe(false);
    expect(homeFeedEmptyPhase({ postCount: 0, isLoading: false, isFetched: true })).toBe('empty');
    expect(homeFeedEmptyPhase({ postCount: 3, isLoading: true, failed: true })).toBe('ready');
  });

  it('never uses first-run empty when the viewer has friends or Live pills', () => {
    expect(
      homeFeedEmptyPhase({
        postCount: 0,
        isLoading: false,
        isFetched: true,
        graphReady: true,
        hasSocialGraph: true,
      }),
    ).toBe('error');
    expect(homeFeedHasSocialGraph({ friendCount: 0, liveChallengeCount: 2 })).toBe(true);
    expect(homeFeedPageIsMiss({ postCount: 0, friendCount: 1, liveChallengeCount: 0 })).toBe(true);
    expect(homeFeedPageIsMiss({ postCount: 0, friendCount: 0, liveChallengeCount: 0 })).toBe(false);
  });
});

describe('home feed pages', () => {
  it('pages about 15 visible cards and never uses a 50-row first paint', () => {
    expect(HOME_PAGE_SIZE).toBeGreaterThanOrEqual(HOME_PAGE_MIN);
    expect(HOME_PAGE_SIZE).toBeLessThanOrEqual(HOME_PAGE_MAX);
    expect(HOME_RAW_WINDOW).toBeLessThan(50);
    const rows = Array.from({ length: 24 }, (_, index) => post(String(index + 1)));
    const page = takeHomeVisiblePage(rows, []);
    expect(page).toHaveLength(HOME_PAGE_SIZE);
    expect(uniquePostsById([...page, ...page]).map((row) => row.id)).toEqual(page.map((row) => row.id));
    expect(homeFeedCursorFrom(page)).toEqual({
      createdAt: page[page.length - 1].created_at,
      id: page[page.length - 1].id,
    });
  });

  it('keeps hide/block/wave-round off Home and does not fall back to the raw merge', () => {
    const friends = new Set(['friend']);
    const raw = [
      post('hidden', { hidden_from_home: true, author_id: 'friend' }),
      post('blocked', { author_id: 'blocked-user' }),
      post('wave', { type: 'wave', author_id: 'friend' }),
      post('round', { type: 'round', author_id: 'friend' }),
      post('ok', { author_id: 'friend', audience: 'public' }),
    ];
    const visible = filterHomeFeedPosts(
      raw,
      ctx({
        friends,
        hidden: new Set(['nope']),
        blocked: new Set(['blocked-user']),
      }),
    );
    expect(visible.map((row) => row.id)).toEqual(['ok']);
    expect(visible).not.toHaveLength(raw.length);
    expect(
      filterHomeFeedPosts(raw.slice(0, 4), ctx({ friends, blocked: new Set(['blocked-user']) })),
    ).toEqual([]);
  });
});

describe('asIdSet', () => {
  it('keeps a real Set of ids and does not empty it', () => {
    const kept = asIdSet(new Set(['friend', 'hidden-post']));
    expect(kept.has('friend')).toBe(true);
    expect(kept.has('hidden-post')).toBe(true);
    expect(kept.size).toBe(2);
  });

  it('reads FriendEdge[] as the other person, not the viewer or friendship id', () => {
    const ids = asIdSet(
      [
        {
          id: 'friendship-row',
          user_a_id: 'me',
          user_b_id: 'courtney',
        },
      ],
      'me',
    );
    expect([...ids]).toEqual(['courtney']);
  });

  it('keeps a Set-like iterable and reads author_id', () => {
    const like = {
      has() {
        return false;
      },
      *[Symbol.iterator]() {
        yield 'hidden-post';
        yield { author_id: 'writer' };
      },
    };
    const ids = asIdSet(like);
    expect(ids.has('hidden-post')).toBe(true);
    expect(ids.has('writer')).toBe(true);
  });

  it('does not throw .has when hidden or friends is an array', () => {
    const hiddenArr = ['secret'] as unknown as Set<string>;
    const friendEdges = [
      { id: 'edge', user_a_id: 'me', user_b_id: 'friend' },
    ] as unknown as Set<string>;
    expect(() =>
      homeFeedAllowsPost(post('ok'), ctx({ hidden: hiddenArr, friends: friendEdges })),
    ).not.toThrow();
    expect(homeFeedAllowsPost(post('secret', { author_id: 'friend' }), ctx({ hidden: hiddenArr }))).toBe(
      false,
    );
    expect(
      homeFeedAllowsPost(post('ok'), ctx({ friends: friendEdges })),
    ).toBe(true);
  });
});

describe('satellite timeout', () => {
  it('returns the fallback when the satellite hangs', async () => {
    const hung = new Promise<string[]>(() => undefined);
    await expect(withSatelliteTimeout(hung, [], 20)).resolves.toEqual([]);
  });
});
