import { BLOB_APEX_HOST } from '@/lib/webHost';

export function needsInviteShareLink(privacyMode?: string | null): boolean {
  const mode = String(privacyMode ?? '').toLowerCase();
  return mode === 'private' || mode === 'private_corporate';
}

export function challengePublicShareUrl(challengeId: string): string {
  const id = String(challengeId ?? '').trim();
  if (!id) {
    return '';
  }
  return `https://${BLOB_APEX_HOST}/challenges/${id}`;
}

export function challengeInviteShareUrl(challengeId: string, token: string): string {
  const id = String(challengeId ?? '').trim();
  const invite = encodeURIComponent(String(token ?? '').trim());
  if (!id || !invite) {
    return '';
  }
  return `https://${BLOB_APEX_HOST}/challenges/${id}?invite=${invite}`;
}

/** Ready-to-copy URL. Private / corporate need a live invite token or this is "". */
export function resolveChallengeCopyUrl(input: {
  challengeId?: string | null;
  privacyMode?: string | null;
  inviteToken?: string | null;
}): string {
  const id = String(input.challengeId ?? '').trim();
  if (!id) {
    return '';
  }
  if (needsInviteShareLink(input.privacyMode)) {
    return challengeInviteShareUrl(id, String(input.inviteToken ?? ''));
  }
  return challengePublicShareUrl(id);
}
