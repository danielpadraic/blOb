import { THEME } from '@/lib/theme';
import type { Reaction, ReactionType } from '@/lib/types';

export const POST_REACTION_TYPES = ['like', 'love', 'care', 'fire', 'sad'] as const;

export type PostReactionType = (typeof POST_REACTION_TYPES)[number];

export const POST_REACTION_COLORS: Record<PostReactionType, string> = {
  like: THEME.accent,
  love: '#E23D6B',
  care: '#F5A524',
  fire: '#E86A17',
  sad: '#5B8DEF',
};

export function asReactionType(value: string | null | undefined): ReactionType {
  if (value === 'love' || value === 'care' || value === 'fire' || value === 'sad') {
    return value;
  }
  return 'like';
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
