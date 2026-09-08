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

  it('leaves the list alone on insert so the caller can fetch the full post', () => {
    const list = [A];
    expect(patchLiveFeedList(list, { eventType: 'INSERT', new: { id: 'c' } })).toBe(list);
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
