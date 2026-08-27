import { describe, expect, it } from 'vitest';

import { canPostOnProfile } from '@/lib/profileWall';

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
