import { describe, expect, it } from 'vitest';

import { circleFeedListKey, homeFeedListKey, isHomeSocialFeedKey } from '@/lib/feedListKeys';

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
});
