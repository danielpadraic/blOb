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

/** Live WhatsApp pill. Home still uses the inset corner stack. */
export const LIVE_PILL_HEIGHT = 26;
export const LIVE_PILL_MARK = 17;
export const LIVE_PILL_MARK_MINE = 19;
export const LIVE_PILL_GAP = 2;
export const LIVE_PILL_PAD_X = 7;
/** Half the pill hangs off the bubble edge. */
export const LIVE_PILL_OVERLAP = 13;
/** Empty padding inside the bubble above the pill so text / dots stay clear. */
export const LIVE_BUBBLE_PILL_INSET = 14;
/** Space under the bubble so the action row misses the hanging half. */
export const LIVE_PILL_CLEARANCE = 16;
/** @deprecated Live now uses LIVE_BUBBLE_PILL_INSET. */
export const LIVE_BUBBLE_INNER_GUTTER = LIVE_BUBBLE_PILL_INSET;
/** @deprecated Live now uses LIVE_PILL_OVERLAP. */
export const LIVE_HANG_OVERLAP = LIVE_PILL_OVERLAP;
/** @deprecated Live now uses LIVE_PILL_CLEARANCE. */
export const LIVE_HANG_CLEARANCE = LIVE_PILL_CLEARANCE;
/** Bust Metro / web cache when like.png is replaced in place. */
export const LIKE_MARK_REV = 2;

const OPTIMISTIC_IGNORE_MS = 2000;
const recentOptimisticKeys = new Map<string, number>();

/** `${postId}:${commentId}:${userId}:${type}` — commentId is empty on posts. */
export function reactionSetKey(input: {
  postId?: string | null;
  commentId?: string | null;
  userId: string;
  type: string;
}): string {
  return `${input.postId ?? ''}:${input.commentId ?? ''}:${input.userId}:${displayReactionType(input.type)}`;
}

export function reactionSetKeyFromRow(
  row: Pick<Reaction, 'post_id' | 'comment_id' | 'user_id' | 'reaction_type'>,
): string {
  return reactionSetKey({
    postId: row.post_id,
    commentId: row.comment_id,
    userId: row.user_id,
    type: row.reaction_type,
  });
}

/** In-flight toggle: one write at a time per (post, comment, type). */
export function reactionFlightKey(
  postId: string,
  commentId: string | null | undefined,
  type: string,
): string {
  return `${postId}:${commentId ?? ''}:${displayReactionType(type)}`;
}

export function markOptimisticReactionWrite(key: string): void {
  recentOptimisticKeys.set(key, Date.now());
}

export function isFreshOptimisticReactionKey(key: string): boolean {
  const at = recentOptimisticKeys.get(key);
  if (at == null) {
    return false;
  }
  if (Date.now() - at > OPTIMISTIC_IGNORE_MS) {
    recentOptimisticKeys.delete(key);
    return false;
  }
  return true;
}

export function resetOptimisticReactionWritesForTests(): void {
  recentOptimisticKeys.clear();
}

export function upsertReactionInList(list: Reaction[], next: Reaction): Reaction[] {
  const key = reactionSetKeyFromRow(next);
  let found = false;
  const out = list.map((row) => {
    if (reactionSetKeyFromRow(row) !== key) {
      return row;
    }
    found = true;
    return { ...row, ...next };
  });
  return found ? out : [...list, next];
}

export function removeReactionKeyFromList(list: Reaction[], key: string): Reaction[] {
  return list.filter((row) => reactionSetKeyFromRow(row) !== key);
}

/** Add or remove one `${postId}:{userId}:{type}` key. Never replaces other types. */
export function applyStackedReaction(
  current: Reaction[],
  action: 'add' | 'remove',
  userId: string,
  type: ReactionType,
  postId: string | null,
  commentId: string | null,
  server?: Reaction | null,
): Reaction[] {
  const nextType = displayReactionType(type) as ReactionType;
  const key = reactionSetKey({ postId, commentId, userId, type: nextType });
  if (action === 'remove') {
    return removeReactionKeyFromList(current, key);
  }
  const draft: Reaction = server ?? {
    id: `optimistic-${nextType}-${commentId ?? postId ?? userId}-${userId}`,
    user_id: userId,
    post_id: postId,
    comment_id: commentId,
    reaction_type: nextType,
    created_at: new Date().toISOString(),
  };
  return upsertReactionInList(current, draft);
}

export function mergeReactionListsByKey(existing: unknown, incoming: unknown): Reaction[] {
  const left = Array.isArray(existing) ? (existing as Reaction[]) : [];
  const right = Array.isArray(incoming) ? (incoming as Reaction[]) : [];
  if (right.length === 0) {
    return left;
  }
  const byKey = new Map<string, Reaction>();
  for (const row of left) {
    if (!row?.user_id) {
      continue;
    }
    byKey.set(reactionSetKeyFromRow(row), row);
  }
  for (const row of right) {
    if (!row?.user_id) {
      continue;
    }
    const key = reactionSetKeyFromRow(row);
    if (isFreshOptimisticReactionKey(key)) {
      continue;
    }
    const prev = byKey.get(key);
    byKey.set(key, prev ? { ...prev, ...row } : row);
  }
  return [...byKey.values()];
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

export type LiveReactionPillSummary = {
  types: { type: string; mine: boolean }[];
  reactorCount: number;
  total: number;
};

/** One WhatsApp pill: unique types left-to-right, combined people count. */
export function liveReactionPill(
  reactions: Reaction[] | undefined,
  userId?: string,
): LiveReactionPillSummary {
  const types = cornerReactionChips(reactions, userId).map((row) => ({
    type: row.type,
    mine: row.mine,
  }));
  const reactors = new Set<string>();
  let total = 0;
  for (const row of reactions ?? []) {
    if (!row?.user_id) {
      continue;
    }
    total += 1;
    reactors.add(row.user_id);
  }
  return {
    types,
    reactorCount: reactors.size,
    total,
  };
}
