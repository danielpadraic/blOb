import { describe, expect, it } from 'vitest';

import { clipPostsQueryKey, clipSocialCounts, isClipSocialPost } from '@/lib/clipPost';

describe('clip social posts', () => {
  it('rejects check-in posts as Wave / Round rows', () => {
    expect(isClipSocialPost({ source: 'checkin' })).toBe(false);
    expect(isClipSocialPost({ source: 'feed', checkin_id: 'ck1' })).toBe(false);
    expect(isClipSocialPost({ source: 'feed' })).toBe(true);
    expect(isClipSocialPost(null)).toBe(false);
  });

  it('counts reactions and comments on that post', () => {
    expect(clipSocialCounts({ reactions: [1, 2, 3], comments: [1] })).toEqual({
      reactions: 3,
      comments: 1,
    });
    expect(clipSocialCounts(null)).toEqual({ reactions: 0, comments: 0 });
  });

  it('keys the clip preview cache by sorted post ids', () => {
    expect(clipPostsQueryKey(['b', 'a', 'b'])).toEqual(['feed', 'clips', 'a,b']);
  });
});
