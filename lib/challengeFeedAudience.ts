import { isInviteOnlyChallenge } from '@/lib/challengeLane';
import { isPrivateCorporate } from '@/lib/privacyMode';
import type { PostAudience } from '@/lib/postAudience';

export function challengeAnnounceCopy(title: string | null | undefined): string {
  const name = title?.trim() || 'this challenge';
  return `${name} Join.`;
}

export function feedAudienceForChallenge(input: {
  visibility?: string | null;
  challenge_lane?: unknown;
  is_official?: boolean | null;
  privacy_mode?: string | null;
}): PostAudience | null {
  if (isPrivateCorporate(input.privacy_mode)) {
    return null;
  }
  if (!input.is_official && isInviteOnlyChallenge(input)) {
    return null;
  }
  const visibility = String(input.visibility ?? '').toLowerCase();
  if (visibility === 'invite' || visibility === 'private') {
    return null;
  }
  if (visibility === 'friends') {
    return 'friends';
  }
  return 'public';
}
