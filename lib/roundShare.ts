import { homeFeedAllowsChallengeContent } from '@/lib/privacyMode';
import { asPostAudience, type PostAudience } from '@/lib/postAudience';
import type { QuoteSnapshot } from '@/lib/types';

export type RoundShareSnapshot = QuoteSnapshot & {
  reel_id?: string | null;
  story_id?: string | null;
  kind?: 'round' | 'wave';
};

export function isRoundSharePost(post: { type?: string | null } | null | undefined): boolean {
  return post?.type === 'round_share';
}

export function isClipSharePost(post: { type?: string | null } | null | undefined): boolean {
  return post?.type === 'round_share' || post?.type === 'wave_share';
}

export function canShareRoundToFeed(privacyMode?: string | null): boolean {
  return homeFeedAllowsChallengeContent(privacyMode);
}

/** Hide the row until corporate privacy is known. */
export function canOfferShareToFeed(input: {
  kind?: string | null;
  postId?: string | null;
  challengeId?: string | null;
  privacyMode?: string | null;
}): boolean {
  if (!input.postId || input.kind !== 'round') {
    return false;
  }
  if (input.challengeId && input.privacyMode == null) {
    return false;
  }
  return canShareRoundToFeed(input.privacyMode);
}

/** Share audience cannot widen past the Round’s audience. */
export function allowedShareAudiences(roundAudience?: string | null): PostAudience[] {
  const audience = asPostAudience(roundAudience);
  if (audience === 'public') {
    return ['friends', 'public', 'specific'];
  }
  if (audience === 'friends') {
    return ['friends', 'specific'];
  }
  if (audience === 'specific') {
    return ['specific'];
  }
  return ['friends'];
}

export function clampShareAudience(
  roundAudience: string | null | undefined,
  chosen: PostAudience,
): PostAudience {
  const allowed = allowedShareAudiences(roundAudience);
  if (allowed.includes(chosen)) {
    return chosen;
  }
  return allowed[0] ?? 'friends';
}

export function clampShareAudienceUserIds(
  roundAudience: string | null | undefined,
  roundUserIds: string[] | null | undefined,
  shareUserIds: string[] | null | undefined,
): string[] {
  if (asPostAudience(roundAudience) !== 'specific') {
    return shareUserIds ?? [];
  }
  const allowed = new Set(roundUserIds ?? []);
  return (shareUserIds ?? []).filter((id) => allowed.has(id));
}

export function asRoundShareSnapshot(raw: unknown): RoundShareSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const reelId = typeof row.reel_id === 'string' ? row.reel_id : null;
  const username = typeof row.username === 'string' ? row.username : 'blob';
  const authorId = typeof row.author_id === 'string' ? row.author_id : '';
  if (!authorId && !username && !reelId) {
    return null;
  }
  return {
    author_id: authorId,
    display_name: typeof row.display_name === 'string' ? row.display_name : username,
    username,
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    body: typeof row.body === 'string' ? row.body : '',
    media_preview_url: typeof row.media_preview_url === 'string' ? row.media_preview_url : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    audience: typeof row.audience === 'string' ? row.audience : null,
    reel_id: reelId,
    story_id: typeof row.story_id === 'string' ? row.story_id : null,
    kind: row.kind === 'wave' ? 'wave' : 'round',
  };
}

export function snapshotFromRound(input: {
  reelId?: string;
  storyId?: string;
  kind?: 'round' | 'wave';
  authorId: string;
  authorName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  caption?: string | null;
  coverUrl?: string | null;
  createdAt: string;
  audience?: string | null;
}): RoundShareSnapshot {
  const username = input.username?.trim() || 'blob';
  const kind = input.kind ?? (input.storyId && !input.reelId ? 'wave' : 'round');
  return {
    author_id: input.authorId,
    display_name: input.authorName?.trim() || username,
    username,
    avatar_url: input.avatarUrl ?? null,
    body: (input.caption ?? '').trim().slice(0, 140),
    media_preview_url: input.coverUrl ?? null,
    created_at: input.createdAt,
    audience: input.audience ?? null,
    reel_id: input.reelId ?? null,
    story_id: input.storyId ?? null,
    kind,
  };
}

export function roundShareClipUnavailable(parent: {
  deleted_at?: string | null;
  hidden_from_rail?: boolean | null;
  type?: string | null;
} | null | undefined): boolean {
  if (!parent) {
    return true;
  }
  if (parent.deleted_at) {
    return true;
  }
  if (parent.hidden_from_rail) {
    return true;
  }
  return parent.type != null && parent.type !== 'round' && parent.type !== 'wave';
}

export function reelIdFromShare(post: {
  parent_id?: string | null;
  quote_snapshot?: unknown;
}): string | null {
  const snap = asRoundShareSnapshot(post.quote_snapshot);
  return snap?.reel_id ?? null;
}

export function storyIdFromShare(post: {
  parent_id?: string | null;
  quote_snapshot?: unknown;
}): string | null {
  const snap = asRoundShareSnapshot(post.quote_snapshot);
  return snap?.story_id ?? null;
}

export function clipShareKind(post: { type?: string | null; quote_snapshot?: unknown }): 'wave' | 'round' {
  if (post.type === 'wave_share') {
    return 'wave';
  }
  const snap = asRoundShareSnapshot(post.quote_snapshot);
  return snap?.kind === 'wave' ? 'wave' : 'round';
}
