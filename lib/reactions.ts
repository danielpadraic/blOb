import { THEME } from '@/lib/theme';
import type { Reaction, ReactionType } from '@/lib/types';

/** Picker + writes. Rofl is in this list; a 22P02 means the SQL file was not pasted. */
export const POST_REACTION_TYPES = ['like', 'love', 'laugh', 'rofl', 'fire', 'sad'] as const;

export type PostReactionType = (typeof POST_REACTION_TYPES)[number];

export const PICKER_REACTION_TYPES = POST_REACTION_TYPES;

export type PickerReactionType = (typeof PICKER_REACTION_TYPES)[number];

export const POST_REACTION_COLORS: Record<string, string> = {
  like: THEME.accent,
  love: '#E23D6B',
  laugh: '#F5A524',
  care: '#F5A524',
  rofl: '#E86A17',
  fire: '#E86A17',
  sad: '#5B8DEF',
};

const KNOWN = new Set<string>([
  'like',
  'love',
  'care',
  'fire',
  'sad',
  'laugh',
  'shock',
  'applause',
  'praise',
  'rofl',
]);

export function asReactionType(value: string | null | undefined): ReactionType {
  if (KNOWN.has(String(value ?? ''))) {
    return value as ReactionType;
  }
  return 'like';
}

/** Existing `care` rows display as LOL. Do not write `care` from the picker. */
export function displayReactionType(value: string | null | undefined): string {
  const raw = String(value ?? '');
  if (raw === 'care' || raw === 'lol') {
    return 'laugh';
  }
  return asReactionType(value);
}

/** File in assets/blob-bob-reaction-emojis/. Unknown / leftover types → like.png. */
const REACTION_MARK_FILES: Record<string, string> = {
  like: 'like.png',
  love: 'love.png',
  laugh: 'lol.png',
  care: 'lol.png',
  rofl: 'rofl.png',
  fire: 'fire.png',
  sad: 'sad.png',
};

export function reactionMarkFile(type: string | null | undefined): string {
  return REACTION_MARK_FILES[displayReactionType(type)] ?? 'like.png';
}

export function isWritableReactionType(value: string | null | undefined): boolean {
  return (POST_REACTION_TYPES as readonly string[]).includes(displayReactionType(value));
}

export const REACTION_MARK_BUTTON = 24;
export const REACTION_MARK_CORNER = 20;
export const REACTION_MARK_PICKER = 32;
export const REACTION_MARK_HIT = 44;
export const REACTION_STACK_MAX = 6;
/** @deprecated Use REACTION_MARK_BUTTON. Kept so Wave rail files do not churn. */
export const REACTION_MARK_COMPACT = REACTION_MARK_BUTTON;

export function reactionPickerLabel(type: string): string {
  if (type === 'laugh') {
    return 'LOL';
  }
  if (type === 'rofl') {
    return 'ROFL';
  }
  if (type === 'like') {
    return 'Like';
  }
  if (type === 'love') {
    return 'Love';
  }
  if (type === 'fire') {
    return 'Fire';
  }
  if (type === 'sad') {
    return 'Sad';
  }
  return type;
}

export function userReaction(
  reactions: Reaction[] | undefined,
  userId?: string,
): Reaction | undefined {
  if (!userId) {
    return undefined;
  }
  return reactions?.find((row) => row.user_id === userId);
}

export function userHasReactionType(
  reactions: Reaction[] | undefined,
  userId: string | undefined,
  type: string,
): boolean {
  if (!userId) {
    return false;
  }
  const want = displayReactionType(type);
  return Boolean(
    reactions?.some((row) => row.user_id === userId && displayReactionType(row.reaction_type) === want),
  );
}

export function findUserReactionOfType(
  reactions: Reaction[] | undefined,
  userId: string | undefined,
  type: string,
): Reaction | undefined {
  if (!userId) {
    return undefined;
  }
  const want = displayReactionType(type);
  return reactions?.find(
    (row) => row.user_id === userId && displayReactionType(row.reaction_type) === want,
  );
}

export function userReactionTypes(
  reactions: Reaction[] | undefined,
  userId?: string,
): string[] {
  if (!userId) {
    return [];
  }
  const seen = new Set<string>();
  for (const row of reactions ?? []) {
    if (row.user_id !== userId) {
      continue;
    }
    seen.add(displayReactionType(row.reaction_type));
  }
  return PICKER_REACTION_TYPES.filter((type) => seen.has(type));
}

/** Insert that type, or delete it if you already have it. Never swaps like for love. */
export function toggleStackedReactionList(
  current: Reaction[],
  userId: string,
  type: ReactionType,
  postId: string | null,
  commentId: string | null,
): Reaction[] {
  const nextType = displayReactionType(type) as ReactionType;
  const existing = findUserReactionOfType(current, userId, nextType);
  if (existing) {
    return current.filter((row) => row.id !== existing.id);
  }
  return [
    ...current,
    {
      id: `optimistic-${nextType}-${commentId ?? postId ?? userId}-${userId}`,
      user_id: userId,
      post_id: postId,
      comment_id: commentId,
      reaction_type: nextType,
      created_at: new Date().toISOString(),
    },
  ];
}

export type ReactionCount = {
  type: string;
  count: number;
  mine: boolean;
};

export function reactionCounts(
  reactions: Reaction[] | undefined,
  userId?: string,
): ReactionCount[] {
  const counts = new Map<string, { count: number; mine: boolean }>();
  for (const row of reactions ?? []) {
    const type = displayReactionType(row.reaction_type);
    const current = counts.get(type) ?? { count: 0, mine: false };
    current.count += 1;
    if (userId && row.user_id === userId) {
      current.mine = true;
    }
    counts.set(type, current);
  }
  const order = ['like', 'love', 'laugh', 'rofl', 'fire', 'sad'];
  return order
    .filter((type) => counts.has(type))
    .map((type) => ({
      type,
      count: counts.get(type)!.count,
      mine: counts.get(type)!.mine,
    }));
}

/** Corner stack: types with a count, max 6, no second headline row. */
export function cornerReactionChips(
  reactions: Reaction[] | undefined,
  userId?: string,
): ReactionCount[] {
  return reactionCounts(reactions, userId).slice(0, REACTION_STACK_MAX);
}
