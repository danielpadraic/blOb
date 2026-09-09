import { describe, expect, it, vi } from 'vitest';

import {
  CREATE_POST_FAIL,
  feedMentionTargets,
  hasFeedMentions,
  mediaUrlCount,
  mentionInsertRows,
  withCreatePostTimeout,
} from '@/lib/createFeedPost';

describe('feedMentionTargets', () => {
  it('skips mentions for a caption with no @ chips', () => {
    const targets = feedMentionTargets(
      { mentionedUserIds: [], mentionedEntities: [] },
      'author-1',
    );
    expect(hasFeedMentions(targets)).toBe(false);
    expect(mentionInsertRows('post-1', 'author-1', targets)).toEqual([]);
  });

  it('drops the author and empty ids', () => {
    const targets = feedMentionTargets(
      {
        mentionedUserIds: ['author-1', 'friend-2', ''],
        mentionedEntities: [{ kind: 'user', id: 'friend-2' }],
      },
      'author-1',
    );
    expect(targets.users).toEqual(['friend-2']);
    expect(hasFeedMentions(targets)).toBe(true);
  });
});

describe('withCreatePostTimeout', () => {
  it('fails with the Send copy when the insert never returns', async () => {
    vi.useFakeTimers();
    const hang = new Promise<void>(() => undefined);
    const raced = withCreatePostTimeout(hang, 12_000);
    const assertion = expect(raced).rejects.toThrow(CREATE_POST_FAIL);
    await vi.advanceTimersByTimeAsync(12_000);
    await assertion;
    vi.useRealTimers();
  });
});

describe('mediaUrlCount', () => {
  it('requires a real URL per thumb', () => {
    expect(mediaUrlCount(['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'])).toEqual({
      media: 2,
      hasUrl: true,
    });
    expect(mediaUrlCount(['', null])).toEqual({ media: 0, hasUrl: false });
  });
});
