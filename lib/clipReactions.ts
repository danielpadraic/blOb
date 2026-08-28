import type { ReactionType } from '@/lib/types';
import { authStorage } from '@/lib/utils/secureStore';

const LAST_KEY = 'blob.clip.last-reaction';

export const CLIP_REACTIONS = [
  { type: 'like', emoji: '👍', label: 'Like' },
  { type: 'love', emoji: '❤️', label: 'Heart' },
  { type: 'fire', emoji: '🔥', label: 'Fire' },
  { type: 'laugh', emoji: '😂', label: 'Laugh' },
  { type: 'sad', emoji: '😢', label: 'Sad' },
  { type: 'shock', emoji: '😮', label: 'Shock' },
  { type: 'applause', emoji: '👏', label: 'Applause' },
  { type: 'praise', emoji: '🙌', label: 'Praise' },
] as const;

export type ClipReactionType = (typeof CLIP_REACTIONS)[number]['type'];

export const DEFAULT_CLIP_REACTION: ClipReactionType = 'love';

export function clipReactionEmoji(type?: string | null): string {
  return CLIP_REACTIONS.find((row) => row.type === type)?.emoji ?? '❤️';
}

export function isClipReactionType(value: string | null | undefined): value is ClipReactionType {
  return CLIP_REACTIONS.some((row) => row.type === value);
}

export function asClipReactionType(value: string | null | undefined): ClipReactionType {
  if (isClipReactionType(value)) {
    return value;
  }
  return DEFAULT_CLIP_REACTION;
}

export async function loadLastClipReaction(): Promise<ClipReactionType> {
  try {
    const raw = await authStorage.getItem(LAST_KEY);
    return asClipReactionType(raw);
  } catch {
    return DEFAULT_CLIP_REACTION;
  }
}

export async function saveLastClipReaction(type: ReactionType): Promise<void> {
  const next = asClipReactionType(type);
  try {
    await authStorage.setItem(LAST_KEY, next);
  } catch {
    // Local preference only.
  }
}

/** Video band while Comments mode is open. */
export function commentsBandHeight(viewportHeight: number): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return 280;
  }
  return Math.round(viewportHeight * 0.42);
}
