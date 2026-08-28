import { describe, expect, it, vi } from 'vitest';

import {
  challengeLoadKind,
  classifyChallengeLoadFailure,
  createChallengeLoadError,
  firstRouteParam,
  isTransientNetworkError,
  snapshotLooksPrivate,
} from '@/lib/challengeLoad';
import {
  challengeFromFeedPreview,
  openChallengeLobby,
  peekLastGoodChallenge,
  rememberLastGoodChallenge,
  resolveChallengeHero,
  seedChallengeDetailQuery,
} from '@/lib/challengeOpen';
import { scrollNodeTo } from '@/lib/challengeRoute';

describe('firstRouteParam', () => {
  it('reads a string or the first array value and trims', () => {
    expect(firstRouteParam('  abc  ')).toBe('abc');
    expect(firstRouteParam(['  xyz  '])).toBe('xyz');
    expect(firstRouteParam([undefined, 'nope'])).toBe('');
    expect(firstRouteParam(undefined)).toBe('');
    expect(firstRouteParam(null)).toBe('');
  });
});

describe('classifyChallengeLoadFailure', () => {
  it('keeps geo ahead of other reasons', () => {
    expect(
      classifyChallengeLoadFailure({
        accessReason: 'geo',
        snapshot: { visibility: 'private' },
        error: new Error('Failed to fetch'),
      }),
    ).toBe('geo');
  });

  it('uses snapshot privacy when RLS hides the row', () => {
    expect(
      classifyChallengeLoadFailure({
        accessReason: 'hidden',
        snapshot: { visibility: 'private', challenge_lane: 'private' },
      }),
    ).toBe('private');
    expect(
      classifyChallengeLoadFailure({
        accessReason: 'hidden',
        snapshot: { privacy_mode: 'private_corporate' },
      }),
    ).toBe('private');
  });

  it('treats network / 5xx as a real server failure', () => {
    expect(classifyChallengeLoadFailure({ error: new Error('Failed to fetch') })).toBe('server');
    expect(classifyChallengeLoadFailure({ error: { message: 'timeout', status: 503 } })).toBe(
      'server',
    );
  });

  it('treats empty / RLS deny as unavailable', () => {
    expect(classifyChallengeLoadFailure({ accessReason: 'hidden' })).toBe('unavailable');
    expect(classifyChallengeLoadFailure({ error: { code: 'PGRST116', message: '0 rows' } })).toBe(
      'unavailable',
    );
  });
});

describe('challenge load helpers', () => {
  it('round-trips typed errors', () => {
    const error = createChallengeLoadError('unavailable');
    expect(challengeLoadKind(error)).toBe('unavailable');
    expect(isTransientNetworkError(new Error('Network request failed'))).toBe(true);
    expect(snapshotLooksPrivate({ visibility: 'public' })).toBe(false);
  });

  it('does not navigate without a stable id', () => {
    const push = vi.fn();
    const client = {
      getQueryData: vi.fn(),
      setQueryData: vi.fn(),
      prefetchQuery: vi.fn(),
    };
    expect(openChallengeLobby({ push }, { id: '   ' }, client as never)).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(seedChallengeDetailQuery({ title: 'Nope' }, client)).toBe('');
    expect(client.setQueryData).not.toHaveBeenCalled();
  });

  it('does not seed another challenge’s snapshot onto this id', () => {
    const store = new Map();
    const client = {
      getQueryData: (key: unknown) => store.get(JSON.stringify(key)),
      setQueryData: (key: unknown, value: unknown) => {
        store.set(JSON.stringify(key), value);
      },
      prefetchQuery: vi.fn(),
    };
    const push = vi.fn();
    expect(
      openChallengeLobby(
        { push },
        {
          id: 'bbb',
          snapshot: { id: 'aaa', title: 'Workout Group #2', prize_pool: 20 },
        },
        client as never,
      ),
    ).toBe(true);
    expect(push).toHaveBeenCalledWith('/challenges/bbb');
    expect(client.getQueryData(['challenge', 'bbb'])).toBeUndefined();
    expect(client.getQueryData(['challenge', 'aaa'])).toBeUndefined();
  });

  it('does not seed a hollow id-only challenge shell', () => {
    const store = new Map();
    const client = {
      getQueryData: (key: unknown) => store.get(JSON.stringify(key)),
      setQueryData: (key: unknown, value: unknown) => {
        store.set(JSON.stringify(key), value);
      },
      prefetchQuery: vi.fn(),
    };
    const push = vi.fn();
    expect(openChallengeLobby({ push }, { id: 'abc' }, client as never)).toBe(true);
    expect(push).toHaveBeenCalledWith('/challenges/abc');
    expect(client.getQueryData(['challenge', 'abc'])).toBeUndefined();
    expect(seedChallengeDetailQuery({ id: 'abc' }, client)).toBe('abc');
    expect(client.getQueryData(['challenge', 'abc'])).toBeUndefined();
  });

  it('seeds a snapshot that already has a real name', () => {
    const store = new Map();
    const client = {
      getQueryData: (key: unknown) => store.get(JSON.stringify(key)),
      setQueryData: (key: unknown, value: unknown) => {
        store.set(JSON.stringify(key), value);
      },
      prefetchQuery: vi.fn(),
    };
    expect(seedChallengeDetailQuery({ id: 'abc', title: 'Workout Group #2', prize_pool: 20 }, client)).toBe(
      'abc',
    );
    const seeded = client.getQueryData(['challenge', 'abc']) as { title?: string; prize_pool?: number };
    expect(seeded.title).toBe('Workout Group #2');
    expect(seeded.prize_pool).toBe(20);
  });

  it('paints feed preview for the same id and never last-good from another challenge', () => {
    rememberLastGoodChallenge({
      id: 'aaa',
      title: 'Challenge A',
      prize_pool: 10,
      participant_count: 2,
    } as never);
    const preview = {
      id: 'bbb',
      title: 'Workout Group #2',
      status: 'open',
      is_official: false,
      buy_in_amount: 5,
      prize_pool: 20,
      currency: 'usd',
      cover_image_url: 'https://example.com/cover.jpg',
      created_by: 'host',
      task: 'Workout Group #2',
    };
    const hero = resolveChallengeHero({ id: 'bbb', preview });
    expect(hero?.id).toBe('bbb');
    expect(hero?.title).toBe('Workout Group #2');
    expect(hero?.prize_pool).toBe(20);
    expect(hero?.cover_image_url).toBe('https://example.com/cover.jpg');
    expect(hero?.preview_hero).toBe(true);
    expect(peekLastGoodChallenge('bbb')).toBeUndefined();
    expect(challengeFromFeedPreview(preview).days_required).toBe(0);
  });

  it('scrolls only when scrollTo exists', () => {
    expect(scrollNodeTo(null, { y: 0 })).toBe(false);
    expect(scrollNodeTo({}, { y: 0 })).toBe(false);
    const node = { scrollTo: vi.fn() };
    expect(scrollNodeTo(node, { y: 0, animated: false })).toBe(true);
    expect(node.scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
    const broken = {
      scrollTo: () => {
        throw new Error('missing');
      },
    };
    expect(scrollNodeTo(broken, { y: 0 })).toBe(false);
  });
});
