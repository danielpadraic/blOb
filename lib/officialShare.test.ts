import { describe, expect, it } from 'vitest';

import { challengeInviteShareUrl, needsInviteShareLink } from '@/lib/challengeInviteShare';

describe('challenge share URLs', () => {
  it('mints an https invite URL for private and corporate, not public', () => {
    expect(needsInviteShareLink('private')).toBe(true);
    expect(needsInviteShareLink('private_corporate')).toBe(true);
    expect(needsInviteShareLink('public')).toBe(false);
    expect(challengeInviteShareUrl('16af3e82-aaaa-bbbb-cccc-ddddeeeeffff', 'tok-1')).toBe(
      'https://blob.mobi/challenges/16af3e82-aaaa-bbbb-cccc-ddddeeeeffff?invite=tok-1',
    );
  });
});
