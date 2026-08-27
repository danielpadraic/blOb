import { describe, expect, it } from 'vitest';

import {
  profileChallengeIsHiddenFromOthers,
  viewerCanSeeShowcase,
} from '@/lib/profileShowcase';

describe('profile showcase', () => {
  it('hides Only me from friends and public from everyone except owner', () => {
    expect(
      viewerCanSeeShowcase({ viewerId: 'friend', ownerId: 'owner', visibility: 'only_me', friends: true }),
    ).toBe(false);
    expect(
      viewerCanSeeShowcase({ viewerId: 'friend', ownerId: 'owner', visibility: 'friends', friends: true }),
    ).toBe(true);
    expect(
      viewerCanSeeShowcase({ viewerId: 'owner', ownerId: 'owner', visibility: 'only_me', friends: false }),
    ).toBe(true);
  });

  it('hides private and corporate challenges from other viewers', () => {
    expect(profileChallengeIsHiddenFromOthers({ privacy_mode: 'private_corporate' })).toBe(true);
    expect(profileChallengeIsHiddenFromOthers({ visibility: 'private' })).toBe(true);
    expect(profileChallengeIsHiddenFromOthers({ visibility: 'public', is_official: true })).toBe(false);
  });
});
