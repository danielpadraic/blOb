import { describe, expect, it } from 'vitest';

import { clipAudienceOrFriends, filterClipsByAudience, viewerCanSeeClip } from '@/lib/clipAudience';

describe('clip audience', () => {
  it('defaults a missing linked post to Friends, never public', () => {
    expect(clipAudienceOrFriends(undefined)).toBe('friends');
    expect(clipAudienceOrFriends(null)).toBe('friends');
    expect(clipAudienceOrFriends('')).toBe('friends');
    expect(clipAudienceOrFriends('nope')).toBe('friends');
    expect(
      viewerCanSeeClip({
        viewerId: 'stranger',
        authorId: 'dan',
        friendsWithAuthor: false,
      }),
    ).toBe(false);
    expect(
      viewerCanSeeClip({
        viewerId: 'friend',
        authorId: 'dan',
        friendsWithAuthor: true,
      }),
    ).toBe(true);
  });

  it('lets Official and the author through', () => {
    expect(
      viewerCanSeeClip({
        viewerId: 'stranger',
        authorId: 'bob',
        audience: 'friends',
        friendsWithAuthor: false,
        officialAuthor: true,
      }),
    ).toBe(true);
    expect(
      viewerCanSeeClip({
        viewerId: 'dan',
        authorId: 'dan',
        audience: 'friends',
        friendsWithAuthor: false,
      }),
    ).toBe(true);
  });

  it('hides Specific and Only me from people who are only following', () => {
    expect(
      viewerCanSeeClip({
        viewerId: 'follower',
        authorId: 'dan',
        audience: 'specific',
        audienceUserIds: ['other'],
        friendsWithAuthor: false,
      }),
    ).toBe(false);
    expect(
      viewerCanSeeClip({
        viewerId: 'follower',
        authorId: 'dan',
        audience: 'only_me',
        friendsWithAuthor: true,
      }),
    ).toBe(false);
  });

  it('drops clips the helper rejects and keeps Official', () => {
    const kept = filterClipsByAudience(
      [
        { id: 'mine', user_id: 'me', post_id: 'p-me' },
        { id: 'friend', user_id: 'pal', post_id: 'p-pal' },
        { id: 'leak', user_id: 'dan', post_id: 'p-dan' },
        { id: 'bob', user_id: 'bob', post_id: null },
      ],
      {
        viewerId: 'me',
        posts: new Map([
          ['p-me', { id: 'p-me', audience: 'friends' }],
          ['p-pal', { id: 'p-pal', audience: 'friends' }],
          ['p-dan', { id: 'p-dan', audience: 'friends' }],
        ]),
        friendIds: new Set(['pal']),
        officialAuthorIds: new Set(['bob']),
      },
    );
    expect(kept.map((row) => row.id)).toEqual(['mine', 'friend', 'bob']);
  });
});
