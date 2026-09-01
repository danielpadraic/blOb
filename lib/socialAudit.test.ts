import { describe, expect, it } from 'vitest';

import { applyCheckinShareLock } from '@/lib/checkinShare';
import { filterHomeFeedPosts, homeQueryKeepsType, type HomeFeedAllowContext } from '@/lib/homeFeed';
import { asPostAudience, DEFAULT_POST_AUDIENCE, viewerCanSeeHomePost } from '@/lib/postAudience';
import { homeFeedAllowsChallengeContent } from '@/lib/privacyMode';
import { clipRouteId, publishedRowId, waveHref } from '@/lib/routes';

const UUID = '2ca49850-b978-45d8-a282-2b644913c538';

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

describe('social audit', () => {
  it('treats missing audience as Friends, never public', () => {
    expect(DEFAULT_POST_AUDIENCE).toBe('friends');
    expect(asPostAudience(undefined)).toBe('friends');
    expect(asPostAudience(null)).toBe('friends');
    expect(asPostAudience('')).toBe('friends');
    expect(
      viewerCanSeeHomePost({
        viewerId: 'stranger',
        authorId: 'dan',
        audience: null,
        friendsWithAuthor: false,
      }),
    ).toBe(false);
    expect(
      viewerCanSeeHomePost({
        viewerId: 'pal',
        authorId: 'dan',
        audience: undefined,
        friendsWithAuthor: true,
      }),
    ).toBe(true);
  });

  it('keeps specific-audience and blocked authors off Home', () => {
    const visible = filterHomeFeedPosts(
      [
        {
          id: 'specific',
          created_at: '2026-08-31T12:00:00.000Z',
          author_id: 'dan',
          audience: 'specific',
          audience_user_ids: ['other'],
        },
        {
          id: 'blocked',
          created_at: '2026-08-31T12:00:01.000Z',
          author_id: 'blocked-user',
          audience: 'public',
        },
        {
          id: 'ok',
          created_at: '2026-08-31T12:00:02.000Z',
          author_id: 'pal',
          audience: 'friends',
        },
      ],
      ctx({
        friends: new Set(['pal', 'dan']),
        blocked: new Set(['blocked-user']),
      }),
    );
    expect(visible.map((row) => row.id)).toEqual(['ok']);
  });

  it('skips corporate Home / Wave share and corporate challenge cards', () => {
    expect(applyCheckinShareLock({ home: true, wave: true }, true)).toEqual({
      home: false,
      wave: false,
    });
    expect(applyCheckinShareLock({ home: true, wave: true }, false)).toEqual({
      home: true,
      wave: false,
    });
    expect(homeFeedAllowsChallengeContent('private_corporate')).toBe(false);
    expect(
      filterHomeFeedPosts(
        [
          {
            id: 'corp',
            created_at: '2026-08-31T12:00:00.000Z',
            author_id: 'pal',
            audience: 'public',
            challenge_id: 'corp-1',
          },
        ],
        ctx({ friends: new Set(['pal']), corporateIds: new Set(['corp-1']) }),
      ),
    ).toEqual([]);
  });

  it('navigates Wave only with a real uuid', () => {
    expect(clipRouteId(undefined)).toBeNull();
    expect(clipRouteId('undefined')).toBeNull();
    expect(publishedRowId({ id: undefined })).toBeNull();
    expect(publishedRowId({ data: [{ id: UUID }] })).toBe(UUID);
    expect(String(waveHref(''))).toBe('/feed');
    expect(String(waveHref(UUID))).toBe(`/wave/${UUID}`);
  });

  it('keeps Home query off Wave / Round while legacy type-less rows stay', () => {
    expect(homeQueryKeepsType('wave')).toBe(false);
    expect(homeQueryKeepsType('round')).toBe(false);
    expect(homeQueryKeepsType('wave_share')).toBe(false);
    expect(homeQueryKeepsType('feed')).toBe(true);
    expect(homeQueryKeepsType(null)).toBe(true);
  });
});
