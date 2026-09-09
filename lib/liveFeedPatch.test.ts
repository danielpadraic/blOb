import { describe, expect, it } from 'vitest';

import { dedupeLivePostsByCheckinId, patchLiveFeedList } from '@/lib/liveFeedPatch';

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
      checkin_id: 'ck-1',
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
        checkin_id: 'ck-1',
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
});

describe('dedupeLivePostsByCheckinId', () => {
  it('keeps the oldest row, unions media, and hides empty Check-in Complete extras', () => {
    const empty = (id: string, at: string) => ({
      id,
      checkin_id: 'ck-955',
      created_at: at,
      content: 'Check-in Complete',
      media_urls: [],
      checkin_stats: null,
    });
    const withMedia = {
      id: 'media',
      checkin_id: 'ck-955',
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
});
