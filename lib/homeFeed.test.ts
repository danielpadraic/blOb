import { describe, expect, it } from 'vitest';

import {
  HOME_FEED_SPLASH_MS,
  HOME_PAGE_MAX,
  HOME_PAGE_MIN,
  HOME_PAGE_SIZE,
  HOME_RAW_WINDOW,
  filterHomeFeedPosts,
  homeFeedCursorFrom,
  homeFeedFirstPaintLoading,
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
  });
});

describe('home feed splash', () => {
  it('does not block first paint and only shows after a fail or a slow empty load', () => {
    expect(shouldShowHomeSplash({ postCount: 0, isLoading: true, waitedMs: 0 })).toBe(false);
    expect(shouldShowHomeSplash({ postCount: 0, isLoading: true, waitedMs: 2500 })).toBe(false);
    expect(
      shouldShowHomeSplash({ postCount: 0, isLoading: true, waitedMs: HOME_FEED_SPLASH_MS }),
    ).toBe(true);
    expect(shouldShowHomeSplash({ postCount: 0, failed: true, waitedMs: 0 })).toBe(false);
    expect(shouldShowHomeSplash({ postCount: 3, isLoading: true, failed: true, waitedMs: 4000 })).toBe(
      false,
    );
    expect(shouldShowHomeSplash({ postCount: 0, isLoading: false, waitedMs: 4000 })).toBe(false);
  });
});

describe('home feed pages', () => {
  it('pages 8–12 visible cards and never uses a 50-row first paint', () => {
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

describe('satellite timeout', () => {
  it('returns the fallback when the satellite hangs', async () => {
    const hung = new Promise<string[]>(() => undefined);
    await expect(withSatelliteTimeout(hung, [], 20)).resolves.toEqual([]);
  });
});
