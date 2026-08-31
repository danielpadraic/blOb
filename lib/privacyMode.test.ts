import { describe, expect, it } from 'vitest';

import {
  LOCKED_AFTER_JOIN_FIELDS,
  PRIVACY_MODE_LOCKED_MESSAGE,
  canChangePrivacyMode,
  homeFeedAllowsChallengeContent,
  rejectLockedAfterJoinField,
} from '@/lib/privacyMode';

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
    const saved = 'public' as const;
    const gate = rejectLockedAfterJoinField({
      field: 'privacy_mode',
      participantCount: 1,
      current: saved,
      next: 'private_corporate',
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.message).toBe(PRIVACY_MODE_LOCKED_MESSAGE);
      expect(gate.message.includes('\n')).toBe(false);
    }
    expect(LOCKED_AFTER_JOIN_FIELDS).toContain('privacy_mode');
    expect(saved).toBe('public');
    expect(
      canChangePrivacyMode({ current: saved, next: saved, participantCount: 3 }).ok,
    ).toBe(true);
  });
});
