export type PostAudience = 'public' | 'friends' | 'specific' | 'only_me';
export type DefaultPostAudience = 'public' | 'friends';

export const POST_AUDIENCE_OPTIONS = [
  { value: 'specific' as const, label: 'Specific' },
  { value: 'friends' as const, label: 'Friends' },
  { value: 'public' as const, label: 'Public' },
];

export const PROFILE_AUDIENCE_OPTIONS = [
  { value: 'public' as const, label: 'Public' },
  { value: 'friends' as const, label: 'Friends' },
  { value: 'only_me' as const, label: 'Only me' },
];

export const DEFAULT_POST_AUDIENCE: PostAudience = 'friends';

export function asPostAudience(value: unknown): PostAudience {
  if (value === 'people') {
    return 'specific';
  }
  if (value === 'public' || value === 'friends' || value === 'specific' || value === 'only_me') {
    return value;
  }
  return DEFAULT_POST_AUDIENCE;
}

export function asDefaultPostAudience(value: unknown): DefaultPostAudience {
  return value === 'public' ? 'public' : 'friends';
}

export function audienceLabel(audience: PostAudience): string {
  if (audience === 'specific') {
    return 'Specific people';
  }
  if (audience === 'friends') {
    return 'Friends';
  }
  if (audience === 'only_me') {
    return 'Only me';
  }
  return 'Public';
}

export function audienceGlyph(audience: PostAudience | DefaultPostAudience) {
  if (audience === 'public') {
    return 'globe';
  }
  if (audience === 'only_me') {
    return 'lock';
  }
  return 'people';
}

export function feedVisibilityForAudience(audience: PostAudience): 'public' | 'friends' | 'private' {
  if (audience === 'public') {
    return 'public';
  }
  if (audience === 'friends') {
    return 'friends';
  }
  return 'private';
}

/** Home and profile wall share this so specific / friends / public cannot drift. */
export function viewerCanSeeHomePost(input: {
  viewerId?: string | null;
  authorId: string;
  audience: unknown;
  audienceUserIds?: string[] | null;
  friendsWithAuthor: boolean;
  officialAuthor?: boolean;
  wallHostId?: string | null;
}): boolean {
  const viewerId = input.viewerId ?? undefined;
  if (viewerId && input.authorId === viewerId) {
    return true;
  }
  if (input.officialAuthor) {
    return true;
  }
  const audience = asPostAudience(input.audience);
  if (audience === 'only_me') {
    return false;
  }
  if (viewerId && input.wallHostId && input.wallHostId === viewerId) {
    return true;
  }
  if (audience === 'public') {
    return true;
  }
  if (audience === 'friends' && (input.authorId === viewerId || input.friendsWithAuthor)) {
    return true;
  }
  if (
    audience === 'specific' &&
    viewerId &&
    (input.authorId === viewerId || (input.audienceUserIds ?? []).includes(viewerId))
  ) {
    return true;
  }
  return false;
}
