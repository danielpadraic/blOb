import { describe, expect, it } from 'vitest';

import {
  challengeInviteShareUrl,
  challengePublicShareUrl,
  needsInviteShareLink,
  resolveChallengeCopyUrl,
} from '@/lib/challengeInviteShare';

const ID = '16af3e82-aaaa-bbbb-cccc-ddddeeeeffff';

describe('challenge share URLs', () => {
  it('mints an https invite URL for private and corporate, not public', () => {
    expect(needsInviteShareLink('private')).toBe(true);
    expect(needsInviteShareLink('private_corporate')).toBe(true);
    expect(needsInviteShareLink('public')).toBe(false);
    expect(challengeInviteShareUrl(ID, 'tok-1')).toBe(
      `https://blob.mobi/challenges/${ID}?invite=tok-1`,
    );
  });

  it('copies https://blob.mobi for public and never an empty private URL', () => {
    expect(challengePublicShareUrl(ID)).toBe(`https://blob.mobi/challenges/${ID}`);
    expect(resolveChallengeCopyUrl({ challengeId: ID, privacyMode: 'public' })).toBe(
      `https://blob.mobi/challenges/${ID}`,
    );
    expect(
      resolveChallengeCopyUrl({
        challengeId: ID,
        privacyMode: 'private_corporate',
        inviteToken: 'live-token',
      }),
    ).toBe(`https://blob.mobi/challenges/${ID}?invite=live-token`);
    expect(
      resolveChallengeCopyUrl({
        challengeId: ID,
        privacyMode: 'private_corporate',
        inviteToken: '',
      }),
    ).toBe('');
    expect(challengeInviteShareUrl(ID, '')).toBe('');
    expect(challengePublicShareUrl('')).toBe('');
    expect(resolveChallengeCopyUrl({ challengeId: '', privacyMode: 'public' })).toBe('');
  });
});
