import { describe, expect, it } from 'vitest';

import {
  circleFeedListKey,
  composerListKey,
  homeFeedListKey,
  isHomeSocialFeedKey,
  isLiveListKey,
  liveListKey,
} from '@/lib/feedListKeys';

describe('Home vs Circle feed keys', () => {
  it('keeps Home off the Circle cache and never puts circleId on Home', () => {
    const home = homeFeedListKey('user-1');
    const circle = circleFeedListKey('prayer-club-id', 'user-1');
    expect(home).toEqual(['feed', 'home', 'user-1']);
    expect(circle).toEqual(['feed', 'circle', 'prayer-club-id', 'user-1']);
    expect(home).not.toContain('prayer-club-id');
    expect(isHomeSocialFeedKey(home)).toBe(true);
    expect(isHomeSocialFeedKey(circle)).toBe(false);
    expect(isHomeSocialFeedKey(['feed', 'global', 'user-1'])).toBe(true);
  });

  it('keeps Challenge Live off the Home feed key', () => {
    const live = liveListKey('challenge-1', 'user-1');
    expect(live).toEqual(['live', 'challenge-1', 'user-1']);
    expect(isLiveListKey(live)).toBe(true);
    expect(isHomeSocialFeedKey(live)).toBe(false);
    expect(composerListKey({ challengeId: 'challenge-1' }, null, 'user-1')).toEqual(live);
  });
});
