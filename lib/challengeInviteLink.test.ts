import { describe, expect, it } from 'vitest';

import {
  challengeInviteShareUrl,
  classifyInviteLinkResponse,
  resolveChallengeCopyUrl,
} from '@/lib/challengeInviteShare';

const ID = '16af3e82-15c0-479f-af52-328440b0c87e';

describe('classifyInviteLinkResponse', () => {
  it('reads the token the RPC hands back', () => {
    expect(classifyInviteLinkResponse({ data: { ok: true, token: 'tok-1', created: false } })).toEqual(
      { ok: true, token: 'tok-1', created: false },
    );
  });

  it('calls a 200 with a null token token-missing, not a copy failure', () => {
    expect(classifyInviteLinkResponse({ data: { ok: true, token: null } })).toMatchObject({
      ok: false,
      failure: 'token-missing',
    });
  });

  it('calls reason ask_host token-missing so the sheet can point at the host', () => {
    expect(classifyInviteLinkResponse({ data: { ok: false, reason: 'ask_host' } })).toMatchObject({
      ok: false,
      failure: 'token-missing',
      detail: 'ask_host',
    });
  });

  it('separates a denied RPC from a missing token', () => {
    expect(
      classifyInviteLinkResponse({ error: { code: '42501', message: 'permission denied' } }),
    ).toMatchObject({ ok: false, failure: 'rpc-403' });
    expect(
      classifyInviteLinkResponse({ error: { code: 'P0002', message: 'boom' } }),
    ).toMatchObject({ ok: false, failure: 'token-missing' });
  });

  it('marks a closed challenge closed', () => {
    expect(classifyInviteLinkResponse({ data: { ok: false, reason: 'closed' } })).toMatchObject({
      ok: false,
      failure: 'closed',
    });
  });
});

describe('copy url shape', () => {
  it('builds the invite URL blob.mobi expects', () => {
    expect(challengeInviteShareUrl(ID, 'tok-1')).toBe(
      `https://blob.mobi/challenges/${ID}?invite=tok-1`,
    );
  });

  it('never hands a private corporate challenge a bare /challenges URL', () => {
    expect(
      resolveChallengeCopyUrl({ challengeId: ID, privacyMode: 'private_corporate', inviteToken: '' }),
    ).toBe('');
    expect(
      resolveChallengeCopyUrl({ challengeId: ID, privacyMode: 'private_corporate', inviteToken: null }),
    ).toBe('');
    expect(
      resolveChallengeCopyUrl({
        challengeId: ID,
        privacyMode: 'private_corporate',
        inviteToken: 'tok-1',
      }),
    ).toBe(`https://blob.mobi/challenges/${ID}?invite=tok-1`);
  });
});
