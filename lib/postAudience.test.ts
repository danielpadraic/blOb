import { describe, expect, it } from 'vitest';

import { asPostAudience, audienceLabel, viewerCanSeeHomePost } from '@/lib/postAudience';

describe('post audience', () => {
  it('keeps Only me on the author and hides it from friends', () => {
    expect(asPostAudience('only_me')).toBe('only_me');
    expect(audienceLabel('only_me')).toBe('Only me');
    expect(
      viewerCanSeeHomePost({
        viewerId: 'friend',
        authorId: 'owner',
        audience: 'only_me',
        friendsWithAuthor: true,
      }),
    ).toBe(false);
    expect(
      viewerCanSeeHomePost({
        viewerId: 'owner',
        authorId: 'owner',
        audience: 'only_me',
        friendsWithAuthor: false,
      }),
    ).toBe(true);
  });

  it('lets the wall host see a Friends post that is not Only me', () => {
    expect(
      viewerCanSeeHomePost({
        viewerId: 'host',
        authorId: 'writer',
        audience: 'friends',
        friendsWithAuthor: false,
        wallHostId: 'host',
      }),
    ).toBe(true);
    expect(
      viewerCanSeeHomePost({
        viewerId: 'host',
        authorId: 'writer',
        audience: 'only_me',
        friendsWithAuthor: false,
        wallHostId: 'host',
      }),
    ).toBe(false);
  });
});
