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
