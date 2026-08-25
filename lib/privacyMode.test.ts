import { describe, expect, it } from 'vitest';

import { homeFeedAllowsChallengeContent } from '@/lib/privacyMode';

describe('homeFeedAllowsChallengeContent', () => {
  it('allows public and private challenge posts on Home', () => {
    expect(homeFeedAllowsChallengeContent('public')).toBe(true);
    expect(homeFeedAllowsChallengeContent('private')).toBe(true);
    expect(homeFeedAllowsChallengeContent(null)).toBe(true);
  });

  it('keeps Private Corporate off Home', () => {
    expect(homeFeedAllowsChallengeContent('private_corporate')).toBe(false);
  });
});
