export type PostAudience = 'public' | 'friends' | 'specific';
export type DefaultPostAudience = 'public' | 'friends';

export const POST_AUDIENCE_OPTIONS = [
  { value: 'specific' as const, label: 'Specific' },
  { value: 'friends' as const, label: 'Friends' },
  { value: 'public' as const, label: 'Public' },
];

export const DEFAULT_POST_AUDIENCE: PostAudience = 'friends';

export function asPostAudience(value: unknown): PostAudience {
  if (value === 'public' || value === 'friends' || value === 'specific') {
    return value;
  }
  return 'public';
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
  return 'Public';
}

export function audienceGlyph(audience: PostAudience | DefaultPostAudience) {
  return audience === 'public' ? 'globe' : 'people';
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
}): boolean {
  const viewerId = input.viewerId ?? undefined;
  if (viewerId && input.authorId === viewerId) {
    return true;
  }
  if (input.officialAuthor) {
    return true;
  }
  const audience = asPostAudience(input.audience);
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
