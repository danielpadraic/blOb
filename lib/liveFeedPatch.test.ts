import { describe, expect, it } from 'vitest';

import { patchLiveFeedList } from '@/lib/liveFeedPatch';

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
});
