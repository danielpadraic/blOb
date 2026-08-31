import { describe, expect, it } from 'vitest';

import { canChangePrivacyMode, homeFeedAllowsChallengeContent } from '@/lib/privacyMode';

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

describe('canChangePrivacyMode', () => {
  it('allows any change before someone joins', () => {
    expect(canChangePrivacyMode({ current: 'public', next: 'private_corporate', participantCount: 0 }).ok).toBe(
      true,
    );
  });

  it('keeps the saved value after someone has joined', () => {
    const gate = canChangePrivacyMode({
      current: 'public',
      next: 'private_corporate',
      participantCount: 1,
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.message).toMatch(/join/i);
    }
  });
});
