import { challengeCategoryLabel } from '@/lib/constants';

export const CHALLENGE_TYPE_ICON_KEYS = [
  'fitness',
  'sports',
  'productivity',
  'learning',
  'creative',
  'reading',
  'gaming',
  'other',
] as const;

export type ChallengeTypeIconKey = (typeof CHALLENGE_TYPE_ICON_KEYS)[number];

const ICONS: Record<ChallengeTypeIconKey, number> = {
  fitness: require('@/assets/challenge-types/fitness.png'),
  sports: require('@/assets/challenge-types/sports.png'),
  productivity: require('@/assets/challenge-types/productivity.png'),
  learning: require('@/assets/challenge-types/learning.png'),
  creative: require('@/assets/challenge-types/creative.png'),
  reading: require('@/assets/challenge-types/reading.png'),
  gaming: require('@/assets/challenge-types/gaming.png'),
  other: require('@/assets/challenge-types/other.png'),
};

const TINT: Record<ChallengeTypeIconKey, string> = {
  fitness: '#E7F7F3',
  sports: '#E8F1FB',
  productivity: '#E6F6F7',
  learning: '#FFF6DC',
  creative: '#F3ECF8',
  reading: '#FBECEE',
  gaming: '#F1EAF8',
  other: '#F3EEE4',
};

/** Create Type chips → icon keys. Stored `education` is Learning. Unknown → other. */
export function challengeTypeIconKey(value?: string | null): ChallengeTypeIconKey {
  const raw = String(value ?? '').trim().toLowerCase();
  const mapped = raw === 'education' ? 'learning' : raw;
  if ((CHALLENGE_TYPE_ICON_KEYS as readonly string[]).includes(mapped)) {
    return mapped as ChallengeTypeIconKey;
  }
  return 'other';
}

export function challengeTypeIconSource(value?: string | null) {
  return ICONS[challengeTypeIconKey(value)];
}

export function challengeTypeIconLabel(value?: string | null): string {
  return challengeCategoryLabel(value);
}

export function challengeTypeIconTint(value?: string | null): string {
  return TINT[challengeTypeIconKey(value)];
}
