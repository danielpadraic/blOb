import { describe, expect, it, vi } from 'vitest';

import {
  dedupeLivePostsByCheckinId,
  matchOptimisticLiveIndex,
  mergeLiveFeedSnapshot,
  patchChallengeLiveInsert,
  patchLiveAuthorList,
  patchLiveCommentList,
  patchLiveFeedList,
  patchLiveReactionList,
  uniqueLivePostsById,
  upsertLiveFeedPost,
} from '@/lib/liveFeedPatch';

const A = { id: 'a', content: 'hi', media_urls: ['https://cdn.test/one.jpg'], checkin_stats: { duration_sec: 2100 } };
const B = { id: 'b', content: 'yo', media_urls: ['https://cdn.test/two.jpg'] };

describe('patchLiveFeedList', () => {
  it('updates one row and keeps the others as the same objects', () => {
    const list = [A, B];
    const next = patchLiveFeedList(list, {
      eventType: 'UPDATE',
      new: { id: 'a', checkin_stats: { duration_sec: 2100, active_cal: 218 } },
    }) as typeof list;
    expect(next[1]).toBe(B);
    expect(next[0]).not.toBe(A);
    expect(next[0].media_urls).toEqual(['https://cdn.test/one.jpg']);
    expect(next[0].checkin_stats).toEqual({ duration_sec: 2100, active_cal: 218 });
  });

  it('merges an insert onto a row already on screen', () => {
    const list = [A, B];
    const next = patchLiveFeedList(list, {
      eventType: 'INSERT',
      new: { id: 'a', checkin_stats: { duration_sec: 2100, hr_avg: 142 } },
    }) as typeof list;
    expect(next[1]).toBe(B);
    expect(next[0].media_urls).toEqual(['https://cdn.test/one.jpg']);
    expect(next[0].checkin_stats).toEqual({ duration_sec: 2100, hr_avg: 142 });
  });

  it('appends a new posts.id instead of replacing the list', () => {
    const list = [A];
    const next = patchLiveFeedList(list, {
      eventType: 'INSERT',
      new: { id: 'c', content: 'Check-in Complete', media_urls: ['https://cdn.test/c.jpg'] },
    }) as typeof list;
    expect(next[0]).toBe(A);
    expect(next[1]?.id).toBe('c');
    expect(next[1]?.media_urls).toEqual(['https://cdn.test/c.jpg']);
  });

  it('does not blank media_urls when a stats write sends an empty array', () => {
    const next = patchLiveFeedList([A], {
      eventType: 'UPDATE',
      new: { id: 'a', media_urls: [], checkin_stats: { duration_sec: 2100, hr_avg: 142 } },
    }) as typeof A[];
    expect(next[0].media_urls).toEqual(['https://cdn.test/one.jpg']);
    expect(next[0].checkin_stats).toEqual({ duration_sec: 2100, hr_avg: 142 });
  });

  it('does not drop media_urls when the patch omitted them', () => {
    const next = patchLiveFeedList([A], {
      eventType: 'UPDATE',
      new: { id: 'a', content: 'Check-in Complete' },
    }) as typeof A[];
    expect(next[0].media_urls).toEqual(['https://cdn.test/one.jpg']);
  });

  it('removes a deleted row', () => {
    expect(patchLiveFeedList([A, B], { eventType: 'DELETE', old: { id: 'a' } })).toEqual([B]);
  });

  it('keeps the same array when the update already matches the row', () => {
    const list = [A, B];
    expect(
      patchLiveFeedList(list, {
        eventType: 'UPDATE',
        new: { id: 'a', checkin_stats: { duration_sec: 2100 } },
      }),
    ).toBe(list);
  });

  it('treats an insert with the same checkin_id as an update of the oldest row', () => {
    const oldest = {
      id: 'old',
      checkin_id: '11111111-1111-4111-8111-111111111111',
      created_at: '2026-09-08T21:55:00.000Z',
      content: 'Check-in Complete',
      media_urls: ['https://cdn.test/walk.jpg'],
      checkin_stats: { duration_sec: 2215 },
    };
    const list = [oldest, B];
    const next = patchLiveFeedList(list, {
      eventType: 'INSERT',
      new: {
        id: 'dup',
        checkin_id: '11111111-1111-4111-8111-111111111111',
        created_at: '2026-09-08T21:55:01.000Z',
        content: 'Check-in Complete',
        media_urls: [],
        checkin_stats: { duration_sec: 2215, hr_avg: 87, distance_m: 2188 },
      },
    }) as typeof list;
    expect(next).toHaveLength(2);
    expect(next[1]).toBe(B);
    expect(next[0].id).toBe('old');
    expect(next[0].media_urls).toEqual(['https://cdn.test/walk.jpg']);
    expect(next[0].checkin_stats).toEqual({
      duration_sec: 2215,
      hr_avg: 87,
      distance_m: 2188,
    });
  });

  it('does not collapse lobby chat that has no checkin_id', () => {
    const chat = { id: 'c1', checkin_id: null, content: 'hello', media_urls: [] };
    const next = patchLiveFeedList([chat], {
      eventType: 'INSERT',
      new: { id: 'c2', checkin_id: null, content: 'yo', media_urls: [] },
    }) as typeof chat[];
    expect(next.map((row) => row.id)).toEqual(['c1', 'c2']);
  });

  it('skips a bad merge payload instead of throwing', () => {
    const list = [A, B];
    expect(() =>
      patchLiveFeedList(list, {
        eventType: 'UPDATE',
        new: { id: 'a', media_urls: { not: 'an-array' }, checkin_stats: ['nope'] },
      }),
    ).not.toThrow();
    expect(patchLiveFeedList(list, { eventType: 'INSERT' })).toBe(list);
  });
});

describe('dedupeLivePostsByCheckinId', () => {
  it('keeps the oldest row, unions media, and hides empty Check-in Complete extras', () => {
    const empty = (id: string, at: string) => ({
      id,
      checkin_id: '22222222-2222-4222-8222-222222222222',
      created_at: at,
      content: 'Check-in Complete',
      media_urls: [],
      checkin_stats: null,
    });
    const withMedia = {
      id: 'media',
      checkin_id: '22222222-2222-4222-8222-222222222222',
      created_at: '2026-09-08T21:55:00.000Z',
      content: 'Check-in Complete',
      media_urls: ['https://cdn.test/fit.jpg'],
      checkin_stats: { duration_sec: 2215, distance_m: 2188, hr_avg: 87 },
    };
    const next = dedupeLivePostsByCheckinId([
      empty('e1', '2026-09-08T21:55:01.000Z'),
      empty('e2', '2026-09-08T21:55:02.000Z'),
      withMedia,
      empty('e3', '2026-09-08T21:55:03.000Z'),
      empty('e4', '2026-09-08T21:55:04.000Z'),
      B,
    ]);
    expect(next).toHaveLength(2);
    expect(next[0].id).toBe('media');
    expect(next[0].media_urls).toEqual(['https://cdn.test/fit.jpg']);
    expect(next[0].checkin_stats).toEqual({
      duration_sec: 2215,
      distance_m: 2188,
      hr_avg: 87,
    });
    expect(next[1]).toBe(B);
  });

  it('replaces an optimistic lobby row on realtime insert instead of adding a third', () => {
    const optimistic = {
      id: 'optimistic-1',
      author_id: 'me',
      content: '@Courtney we stopped our watch',
      created_at: '2026-09-10T17:21:00.000Z',
    };
    const list = [A, optimistic];
    const next = patchLiveFeedList(list, {
      eventType: 'INSERT',
      new: {
        id: 'real-1',
        author_id: 'me',
        content: '@Courtney we stopped our watch',
        created_at: '2026-09-10T17:21:02.000Z',
      },
    }) as Array<{ id: string }>;
    expect(next.map((row) => row.id)).toEqual(['a', 'real-1']);
  });

  it('ignores a realtime insert when that posts.id is already in the list', () => {
    const list = [A, { id: 'real-1', content: 'hi' }];
    const next = patchLiveFeedList(list, {
      eventType: 'INSERT',
      new: { id: 'real-1', content: 'hi' },
    });
    expect(next).toBe(list);
  });

  it('upserts by replacing the optimistic id', () => {
    const list = [A, { id: 'optimistic-9', content: 'x' }];
    const next = upsertLiveFeedPost(list, { id: 'real-9', content: 'x' }, 'optimistic-9');
    expect(next.map((row) => row.id)).toEqual(['a', 'real-9']);
  });

  it('uniqueLivePostsById keeps the first copy', () => {
    expect(uniqueLivePostsById([A, { ...A }, B]).map((row) => row.id)).toEqual(['a', 'b']);
    expect(matchOptimisticLiveIndex([A, { id: 'optimistic-2', author_id: 'me', content: 'hi', created_at: '2026-09-10T17:21:00.000Z' }], {
      author_id: 'me',
      content: 'hi',
      created_at: '2026-09-10T17:21:03.000Z',
    })).toBe(1);
  });

  it('upserts one incoming reaction type and keeps the others', () => {
    const list = [
      {
        id: 'a',
        reactions: [
          { id: 'r1', user_id: 'me', post_id: 'a', reaction_type: 'like', created_at: '2026-09-01T12:00:00.000Z' },
        ],
      },
    ];
    const next = patchLiveFeedList(list, {
      eventType: 'UPDATE',
      new: {
        id: 'a',
        reactions: [
          { id: 'r2', user_id: 'you', post_id: 'a', reaction_type: 'laugh', created_at: '2026-09-01T12:00:01.000Z' },
        ],
      },
    }) as typeof list;
    expect(next[0].reactions?.map((row) => row.reaction_type)).toEqual(['like', 'laugh']);
  });

  it('leaves two lobby rows alone when checkin_id is not a uuid', () => {
    const rows = [
      { id: 'a', checkin_id: 'not-a-uuid', content: 'hi', media_urls: [] },
      { id: 'b', checkin_id: 'not-a-uuid', content: 'yo', media_urls: [] },
    ];
    expect(dedupeLivePostsByCheckinId(rows)).toEqual(rows);
  });
});

describe('mergeLiveFeedSnapshot', () => {
  it('patches media onto the same object and keeps neighbors', () => {
    const prev = [A, B];
    const incoming = [
      { ...A, media_urls: ['https://cdn.test/one.jpg', 'https://cdn.test/one.jpg?tok=2'] },
      { ...B },
    ];
    const next = mergeLiveFeedSnapshot(prev, incoming);
    expect(next[1]).toBe(B);
    expect(next[0].id).toBe('a');
    expect(next[0].media_urls).toEqual(['https://cdn.test/one.jpg']);
  });

  it('returns the incoming list on first paint when nothing is on screen yet', () => {
    const incoming = [A, B];
    expect(mergeLiveFeedSnapshot(undefined, incoming)[0]).toBe(A);
  });
});

describe('optimistic row match', () => {
  const at = '2026-09-10T17:21:00.000Z';
  const near = '2026-09-10T17:21:02.000Z';
  const photo = 'https://cdn.test/p/one.jpg';

  it('matches a photo-only send by media, not by empty content', () => {
    const list = [
      { id: 'optimistic-1', author_id: 'me', content: null, media_urls: [photo], created_at: at },
    ];
    expect(
      matchOptimisticLiveIndex(list, {
        author_id: 'me',
        content: null,
        media_urls: [`${photo}?token=x`],
        created_at: near,
      }),
    ).toBe(0);
  });

  it('matches by client temp id even when the words were edited', () => {
    const list = [{ id: 'optimistic-7', author_id: 'me', content: 'draft', created_at: at }];
    expect(
      matchOptimisticLiveIndex(list, {
        author_id: 'me',
        content: 'draft (edited)',
        client_temp_id: 'optimistic-7',
        created_at: near,
      }),
    ).toBe(0);
  });

  it('does not match a photo send to a text-only row or another author', () => {
    const list = [{ id: 'optimistic-2', author_id: 'me', content: 'hi', media_urls: [photo], created_at: at }];
    expect(matchOptimisticLiveIndex(list, { author_id: 'me', content: 'hi', created_at: near })).toBe(-1);
    expect(
      matchOptimisticLiveIndex(list, { author_id: 'you', content: 'hi', media_urls: [photo], created_at: near }),
    ).toBe(-1);
  });

  it('does not collapse two quick identical photo-less repeats outside the window', () => {
    const list = [{ id: 'optimistic-3', author_id: 'me', content: null, created_at: at }];
    expect(
      matchOptimisticLiveIndex(list, { author_id: 'me', content: null, created_at: '2026-09-10T17:25:00.000Z' }),
    ).toBe(-1);
  });
});

describe('Live social patches', () => {
  const post = {
    id: 'p1',
    author_id: 'me',
    created_at: '2026-09-10T17:00:00.000Z',
    author: { id: 'me', display_name: 'Me' },
    comments: [] as Array<Record<string, unknown>>,
    reactions: [] as Array<Record<string, unknown>>,
  };

  it('appends another person\'s comment with a neutral author, then fills the real one', () => {
    const next = patchLiveCommentList([post], {
      eventType: 'INSERT',
      new: { id: 'c1', post_id: 'p1', author_id: 'u2', content: 'nice', created_at: '2026-09-10T17:01:00.000Z' },
    }) as typeof post[];
    expect(next[0].comments).toHaveLength(1);
    expect((next[0].comments[0] as { author?: { display_name?: string } }).author?.display_name).toBe('Member');
    const named = patchLiveAuthorList(next, 'u2', { id: 'u2', display_name: 'Sam' }) as typeof post[];
    expect((named[0].comments[0] as { author?: { display_name?: string } }).author?.display_name).toBe('Sam');
  });

  it('ignores a comment for a post that is not in this Live and a repeat id', () => {
    const list = [post];
    expect(
      patchLiveCommentList(list, { eventType: 'INSERT', new: { id: 'c9', post_id: 'other', author_id: 'u2', content: 'x' } }),
    ).toBe(list);
    const once = patchLiveCommentList(list, {
      eventType: 'INSERT',
      new: { id: 'c1', post_id: 'p1', author_id: 'u2', content: 'x' },
    });
    const twice = patchLiveCommentList(once, {
      eventType: 'INSERT',
      new: { id: 'c1', post_id: 'p1', author_id: 'u2', content: 'x' },
    });
    expect(twice).toBe(once);
  });

  it('swaps the viewer optimistic comment instead of doubling it', () => {
    const list = [
      {
        ...post,
        comments: [
          { id: 'optimistic-comment-1', post_id: 'p1', author_id: 'me', content: 'hey', parent_id: null },
        ],
      },
    ];
    const next = patchLiveCommentList(list, {
      eventType: 'INSERT',
      new: { id: 'c2', post_id: 'p1', author_id: 'me', content: 'hey', parent_id: null },
    }) as typeof list;
    expect(next[0].comments.map((row) => row.id)).toEqual(['c2']);
  });

  it('removes a deleted comment', () => {
    const list = [{ ...post, comments: [{ id: 'c1', post_id: 'p1', author_id: 'u2', content: 'x' }] }];
    const next = patchLiveCommentList(list, { eventType: 'DELETE', old: { id: 'c1', post_id: 'p1' } }) as typeof list;
    expect(next[0].comments).toEqual([]);
  });

  it('adds and removes another person\'s reaction on a post', () => {
    const added = patchLiveReactionList(
      [post],
      { eventType: 'INSERT', new: { id: 'r1', post_id: 'p1', user_id: 'u2', reaction_type: 'like' } },
      'me',
    ) as typeof post[];
    expect(added[0].reactions).toHaveLength(1);
    const removed = patchLiveReactionList(added, { eventType: 'DELETE', old: { id: 'r1' } }, 'me') as typeof post[];
    expect(removed[0].reactions).toHaveLength(0);
  });

  it('ignores a reaction for a post that is not in this Live', () => {
    const list = [post];
    expect(
      patchLiveReactionList(list, { eventType: 'INSERT', new: { id: 'r1', post_id: 'zzz', user_id: 'u2', reaction_type: 'like' } }, 'me'),
    ).toBe(list);
  });
});

describe('patchChallengeLiveInsert', () => {
  const key = ['live', 'ch1', 'me'];
  function client(initial: unknown[]) {
    const store = new Map<string, unknown>([[JSON.stringify(key), initial]]);
    return {
      store,
      getQueriesData: vi.fn(() => [[key, store.get(JSON.stringify(key))]]),
      setQueriesData: vi.fn((_filter: unknown, updater: (data: unknown) => unknown) => {
        store.set(JSON.stringify(key), updater(store.get(JSON.stringify(key))));
      }),
    };
  }
  const row = { id: 'n1', author_id: 'u2', challenge_id: 'ch1', content: 'yo', created_at: '2026-09-10T17:00:00.000Z' };

  it('paints the fetched author and social data', async () => {
    const qc = client([]);
    await patchChallengeLiveInsert(qc as never, 'ch1', { eventType: 'INSERT', new: row }, async () => ({
      ...row,
      author: { id: 'u2', display_name: 'Sam' },
      reactions: [{ id: 'r1', post_id: 'n1', user_id: 'u3', reaction_type: 'like' }],
      comments: [],
    }) as never);
    const list = qc.store.get(JSON.stringify(key)) as Array<Record<string, any>>;
    expect(list).toHaveLength(1);
    expect(list[0].author.display_name).toBe('Sam');
    expect(list[0].reactions).toHaveLength(1);
  });

  it('falls back to a neutral name when the fetch fails', async () => {
    const qc = client([]);
    await patchChallengeLiveInsert(qc as never, 'ch1', { eventType: 'INSERT', new: row }, async () => {
      throw new Error('offline');
    });
    const list = qc.store.get(JSON.stringify(key)) as Array<Record<string, any>>;
    expect(list).toHaveLength(1);
    expect(list[0].author.display_name).toBe('Member');
    expect(list[0].reactions).toEqual([]);
  });

  it('does not fetch for a row already on screen', async () => {
    const qc = client([{ ...row, author: { id: 'u2', display_name: 'Sam' } }]);
    const fetchPost = vi.fn(async () => null);
    await patchChallengeLiveInsert(qc as never, 'ch1', { eventType: 'INSERT', new: row }, fetchPost);
    expect(fetchPost).not.toHaveBeenCalled();
  });
});

describe('recap card patch', () => {
  const still = 'https://cdn.test/u/c/pre_selfie-1.jpg';
  const old = 'https://cdn.test/u/c/workout_card-1.png';
  const fresh = 'https://cdn.test/u/c/workout_card-2.png';

  it('adds the card as the last slide, keeps the stills, and leaves other posts as they were', () => {
    const post = { id: 'p1', media_urls: [still], checkin_stats: { duration_sec: 1800, hr_avg: 140 } };
    const other = { id: 'p2', media_urls: ['https://cdn.test/other.jpg'] };
    const list = [post, other];
    const next = patchLiveFeedList(list, {
      eventType: 'UPDATE',
      new: { id: 'p1', media_urls: [still, old], checkin_stats: { card_url: old } },
    }) as typeof list;
    expect(next[0].media_urls).toEqual([still, old]);
    expect(next[0].checkin_stats).toMatchObject({ duration_sec: 1800, hr_avg: 140 });
    expect(next[1]).toBe(other);
  });

  it('replaces a card already on screen instead of stacking a second one', () => {
    const list = [{ id: 'p1', media_urls: [still, old] }];
    const next = patchLiveFeedList(list, {
      eventType: 'UPDATE',
      new: { id: 'p1', media_urls: [still, fresh] },
    }) as typeof list;
    expect(next[0].media_urls).toEqual([still, fresh]);
  });

  it('is a no-op when the same card arrives again', () => {
    const list = [{ id: 'p1', media_urls: [still, old] }];
    const next = patchLiveFeedList(list, {
      eventType: 'UPDATE',
      new: { id: 'p1', media_urls: [still, old] },
    });
    expect(next).toBe(list);
  });
});
