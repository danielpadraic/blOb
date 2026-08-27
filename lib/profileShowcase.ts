import { isPrivateCorporate } from '@/lib/privacyMode';
import { asPostAudience, type PostAudience } from '@/lib/postAudience';

export type ShowcaseAudience = 'public' | 'friends' | 'only_me';

export const SHOWCASE_AUDIENCE_OPTIONS: Array<{ value: ShowcaseAudience; label: string }> = [
  { value: 'public', label: 'Public' },
  { value: 'friends', label: 'Friends' },
  { value: 'only_me', label: 'Only me' },
];

export function asShowcaseAudience(value: unknown): ShowcaseAudience {
  if (value === 'public' || value === 'friends' || value === 'only_me') {
    return value;
  }
  if (value === 'specific') {
    return 'only_me';
  }
  return 'friends';
}

export function showcaseFromPostAudience(audience: unknown): ShowcaseAudience {
  const next = asPostAudience(audience);
  if (next === 'public' || next === 'friends') {
    return next;
  }
  return 'only_me';
}

export function postAudienceFromShowcase(audience: ShowcaseAudience): PostAudience {
  return audience;
}

export function viewerCanSeeShowcase(input: {
  viewerId?: string | null;
  ownerId: string;
  visibility: unknown;
  friends: boolean;
}): boolean {
  if (input.viewerId && input.viewerId === input.ownerId) {
    return true;
  }
  const visibility = asShowcaseAudience(input.visibility);
  if (visibility === 'public') {
    return true;
  }
  if (visibility === 'friends') {
    return input.friends;
  }
  return false;
}

export function profileChallengeIsHiddenFromOthers(challenge: {
  privacy_mode?: unknown;
  visibility?: string | null;
  is_official?: boolean | null;
}): boolean {
  if (isPrivateCorporate(challenge)) {
    return true;
  }
  const visibility = String(challenge.visibility ?? 'public').toLowerCase();
  return visibility === 'private' || visibility === 'invite';
}

export function firstGivenName(profile: {
  display_name?: string | null;
  username?: string | null;
}): string {
  const display = profile.display_name?.trim();
  if (display) {
    return display.split(/\s+/)[0] ?? display;
  }
  return profile.username?.trim() || 'them';
}
