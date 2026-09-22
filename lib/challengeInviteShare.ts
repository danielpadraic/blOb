import { BLOB_APEX_HOST } from '@/lib/webHost';

export function needsInviteShareLink(privacyMode?: string | null): boolean {
  const mode = String(privacyMode ?? '').toLowerCase();
  return mode === 'private' || mode === 'private_corporate';
}

export function challengeInviteShareUrl(challengeId: string, token: string): string {
  const id = String(challengeId ?? '').trim();
  const invite = encodeURIComponent(String(token ?? '').trim());
  return `https://${BLOB_APEX_HOST}/challenges/${id}?invite=${invite}`;
}
