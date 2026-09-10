import { THEME } from '@/lib/theme';
import type { Reaction, ReactionType } from '@/lib/types';

/**
 * One shared set for Live, Home, and comments.
 * `rofl` stays off until the SQL constraint is applied in the Editor.
 */
export const ROFL_REACTION_ENABLED = false;

export const POST_REACTION_TYPES = ['like', 'love', 'laugh', 'fire', 'sad'] as const;

export type PostReactionType = (typeof POST_REACTION_TYPES)[number];

export const PICKER_REACTION_TYPES = ROFL_REACTION_ENABLED
  ? (['like', 'love', 'laugh', 'rofl', 'fire', 'sad'] as const)
  : POST_REACTION_TYPES;

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
  const type = asReactionType(value);
  if (type === 'care') {
    return 'laugh';
  }
  return type;
}

export function isWritableReactionType(value: string | null | undefined): boolean {
  const type = displayReactionType(value);
  if (type === 'rofl') {
    return ROFL_REACTION_ENABLED;
  }
  return (POST_REACTION_TYPES as readonly string[]).includes(type);
}

/** Real emoji for the picker and compact row. Never a Bob mark or SF stand-in. */
export const REACTION_EMOJI: Record<string, string> = {
  like: '👍',
  love: '❤️',
  laugh: '😂',
  care: '😂',
  rofl: '🤣',
  fire: '🔥',
  sad: '😢',
};

export function reactionEmoji(type: string): string {
  return REACTION_EMOJI[type] ?? '👍';
}

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
    if (type === 'rofl' && !ROFL_REACTION_ENABLED && !row.user_id) {
      continue;
    }
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

/**
 * Your type (if any) + up to 3 types that have counts + overflow if more.
 * Never a wrapped chip soup under every bubble.
 */
export function compactReactionChips(
  reactions: Reaction[] | undefined,
  userId?: string,
): { shown: ReactionCount[]; overflow: number } {
  const counts = reactionCounts(reactions, userId);
  const mine = counts.find((row) => row.mine) ?? null;
  const others = counts.filter((row) => !row.mine);
  const shown: ReactionCount[] = [];
  if (mine) {
    shown.push(mine);
  }
  for (const row of others) {
    if (shown.length >= (mine ? 4 : 3)) {
      break;
    }
    shown.push(row);
  }
  return { shown, overflow: Math.max(0, counts.length - shown.length) };
}
