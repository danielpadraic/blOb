import { describe, expect, it } from 'vitest';

import { canPostOnProfile, directedWallHost } from '@/lib/profileWall';

describe('canPostOnProfile', () => {
  it('allows a friend to write on a public profile', () => {
    expect(
      canPostOnProfile({
        viewerId: 'friend',
        host: { id: 'host', profile_visibility: 'public' },
        friends: true,
        followingCreator: false,
        blocked: false,
      }),
    ).toBe(true);
  });

  it('allows anyone on a public profile unless blocked or official-locked', () => {
    expect(
      canPostOnProfile({
        viewerId: 'stranger',
        host: { id: 'host', profile_visibility: 'public' },
        friends: false,
        followingCreator: false,
        blocked: false,
      }),
    ).toBe(true);
  });

  it('keeps friends-only profiles to accepted friends', () => {
    expect(
      canPostOnProfile({
        viewerId: 'stranger',
        host: { id: 'host', profile_visibility: 'friends' },
        friends: false,
        followingCreator: false,
        blocked: false,
      }),
    ).toBe(false);
    expect(
      canPostOnProfile({
        viewerId: 'friend',
        host: { id: 'host', profile_visibility: 'friends' },
        friends: true,
        followingCreator: false,
        blocked: false,
      }),
    ).toBe(true);
  });

  it('blocks official-locked profiles and blocks', () => {
    expect(
      canPostOnProfile({
        viewerId: 'friend',
        host: { id: 'host', is_official: true },
        friends: true,
        followingCreator: false,
        blocked: false,
      }),
    ).toBe(false);
    expect(
      canPostOnProfile({
        viewerId: 'friend',
        host: { id: 'host' },
        friends: true,
        followingCreator: false,
        blocked: true,
      }),
    ).toBe(false);
  });
});

describe('directedWallHost', () => {
  it('returns the wall owner when the author wrote on someone else', () => {
    expect(
      directedWallHost({
        author_id: 'daniel',
        wall_host_id: 'courtney',
        wall_host: { id: 'courtney', display_name: 'Courtney', username: 'coco9228' },
      }),
    ).toEqual({ id: 'courtney', display_name: 'Courtney', username: 'coco9228' });
  });

  it('hides chrome when the post is not on another profile', () => {
    expect(directedWallHost({ author_id: 'daniel', wall_host_id: null })).toBeNull();
    expect(directedWallHost({ author_id: 'daniel', wall_host_id: 'daniel' })).toBeNull();
  });
});
