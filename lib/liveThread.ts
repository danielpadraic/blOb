import { format } from 'date-fns';

import { findChallengesStack, type NavLike } from '@/lib/challengeNav';
import { uniqueProofUrls } from '@/lib/challengeProofs';
import { seedLiveAuthor } from '@/lib/safeIds';
import { checkinComposerPrefill } from '@/lib/checkin/captions';
import { isCheckinCompleteStage, isCheckinPost, type CheckinPostLike } from '@/lib/checkinPost';
import { liveCheckinKey } from '@/lib/liveFeedPatch';
import { displayReactionType, reactionCounts, type ReactionCount } from '@/lib/reactions';
import type { CommentWithAuthor, PostWithMeta, Reaction, ReactionType } from '@/lib/types';
import { commentMediaUrls, commentTextWithoutMedia } from '@/utils/media';
import { commentsForThread } from '@/lib/commentEdit';

export type LivePostLike = CheckinPostLike & {
  id?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
};

/** Shared empty list so refetching [] does not allocate a new posts array. */
export const EMPTY_LIVE_POSTS: [] = [];

/** Host, joined participants, and callout observers already in the room may post. */
export function canComposeInLive(input: {
  isHost?: boolean | null;
  isJoined?: boolean | null;
  isCalloutObserver?: boolean | null;
}): boolean {
  return Boolean(input.isHost || input.isJoined || input.isCalloutObserver);
}

/**
 * Empty Live body. "Join … to post" is only for a signed-in visitor who is not
 * the host, not joined, and not a callout observer already in the room.
 */
export function liveEmptyBody(input: {
  canCompose: boolean;
  isCalloutObserver?: boolean | null;
  isHost?: boolean | null;
  isJoined?: boolean | null;
  viewerOut?: boolean | null;
  watchingLine: string;
  quietBody: string;
  joinToPost: string;
  outWatchLive: string;
}): string {
  if (input.isCalloutObserver && !input.isHost && !input.isJoined) {
    return input.watchingLine;
  }
  if (input.canCompose) {
    if (input.viewerOut && input.isJoined) {
      return input.outWatchLive;
    }
    return input.quietBody;
  }
  return input.joinToPost;
}

/** First app file in a throw stack. Safari “Can't find variable” logs use this. */
export function liveErrorFile(error: unknown): string | null {
  const stack = error instanceof Error ? String(error.stack ?? '') : String(error ?? '');
  const match = stack.match(/((?:hooks|app|components|lib)\/[^:\s)]+\.(?:tsx?|jsx?))/i);
  if (match?.[1]) {
    return match[1];
  }
  const named = stack.match(/\/((?:hooks|app|components|lib)\/[^:?\s)]+\.(?:tsx?|jsx?))/i);
  return named?.[1] ?? null;
}

/** Oldest first so the live edge is the bottom of the thread. */
export function sortLivePosts<T extends LivePostLike>(posts: T[]): T[] {
  return [...posts]
    .filter((post) => Boolean(post?.id) && !post.deleted_at)
    .sort((a, b) => {
      const left = Date.parse(String(a.created_at ?? ''));
      const right = Date.parse(String(b.created_at ?? ''));
      const leftAt = Number.isFinite(left) ? left : 0;
      const rightAt = Number.isFinite(right) ? right : 0;
      if (leftAt !== rightAt) {
        return leftAt - rightAt;
      }
      return String(a.id ?? '').localeCompare(String(b.id ?? ''));
    });
}

/** FlatList key. Check-in rows use checkin_id so a stats patch does not remount the bubble. */
export function liveRowKey(
  row:
    | {
        id?: string | null;
        kind?: string | null;
        createdAt?: string | null;
        post?: { checkin_id?: string | null } | null;
      }
    | null
    | undefined,
  index = 0,
): string {
  try {
    if (row?.kind === 'post') {
      const checkinId = liveCheckinKey(row.post?.checkin_id);
      if (checkinId) {
        return `checkin:${checkinId}`;
      }
    }
    const id = String(row?.id ?? '').trim();
    if (id) {
      return id;
    }
    return `live:${row?.kind ?? 'row'}:${String(row?.createdAt ?? '')}:${index}`;
  } catch {
    return `live:row:${index}`;
  }
}

function asStats(value: unknown): PostWithMeta['checkin_stats'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as PostWithMeta['checkin_stats'];
}

const seededPostCache = new WeakMap<object, PostWithMeta>();

/** Fill author / media / stats so a bad Live row cannot throw on .id or .map. */
export function seedLiveFeedPosts(posts: unknown): PostWithMeta[] {
  if (!Array.isArray(posts)) {
    return [];
  }
  const out: PostWithMeta[] = [];
  for (const raw of posts) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const cached = seededPostCache.get(raw);
    if (cached) {
      out.push(cached);
      continue;
    }
    const post = raw as PostWithMeta;
    const id = String(post.id ?? '').trim();
    if (!id) {
      continue;
    }
    const seeded = seedLiveAuthor({ ...post, id });
    const comments = Array.isArray(post.comments)
      ? post.comments.filter((comment) => comment && comment.id).map((comment) => seedLiveAuthor(comment))
      : [];
    const next = {
      ...seeded,
      id,
      media_urls: uniqueProofUrls(post.media_urls),
      hidden_media_urls: uniqueProofUrls(post.hidden_media_urls),
      checkin_stats: asStats(post.checkin_stats),
      comments,
    };
    seededPostCache.set(raw, next);
    out.push(next);
  }
  return out;
}

/** Clock under a Live bubble: 9:44. */
export function formatLiveClock(date: string | Date | null | undefined): string {
  if (date == null) {
    return '';
  }
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) {
    return '';
  }
  return format(then, 'h:mm');
}

export function liveCheckinLabel(post: CheckinPostLike): 'Check-in' | 'Check-in Complete' {
  return isCheckinCompleteStage(post.checkin_stage) ? 'Check-in Complete' : 'Check-in';
}

/** Stage chip on the proof thumb. Never an invented activity sentence. */
export function liveCheckinHeadline(post: CheckinPostLike & { content?: string | null }): string {
  return liveCheckinLabel(post);
}

/** Per-proof caption for the maximized proof. Slot caption first, then the receipt line. */
export function liveProofCaption(
  post: { media_urls?: string[] | null; media_captions?: Array<string | null> | null },
  uri: string,
  fallback: string,
): string {
  const at = (post.media_urls ?? []).findIndex((url) => url === uri);
  const slot = at >= 0 ? (post.media_captions?.[at] ?? '').trim() : '';
  return slot || fallback;
}

const REPLY_SWIPE_SLOP = 14;

/** Swipe right to reply. Vertical scroll wins unless the drag is clearly sideways. */
export function liveSwipeClaimsReply(dx: number, dy: number): boolean {
  return dx > REPLY_SWIPE_SLOP && dx > Math.abs(dy) * 1.6;
}

/** iMessage feel: past this the release fires Reply. */
export const REPLY_SWIPE_TRIGGER = 52;
export const REPLY_SWIPE_MAX = 72;

export type LiveBackGestureOptions = {
  gestureEnabled: boolean;
  fullScreenGestureEnabled: false;
};

/** Live keeps swipe-to-reply. Overview/Board keep a normal stack back. */
export function liveScreenBackGesture(liveFocused: boolean): LiveBackGestureOptions {
  return {
    gestureEnabled: !liveFocused,
    fullScreenGestureEnabled: false,
  };
}

export type LiveGestureNav = {
  setOptions?: (options: LiveBackGestureOptions) => void;
  getParent?: () => LiveGestureNav | undefined;
  getState?: () => unknown;
};

/** Nested Live screen + the Lobby `[id]` screen. Never the tab bar. */
export function applyLiveBackGesture(nav: LiveGestureNav | null | undefined, liveFocused: boolean): void {
  const options = liveScreenBackGesture(liveFocused);
  nav?.setOptions?.(options);
  const stack = findChallengesStack(nav as NavLike);
  if (stack) {
    stack.setOptions?.(options);
    return;
  }
  nav?.getParent?.()?.setOptions?.(options);
}

export function isLiveCheckinPost(post: CheckinPostLike): boolean {
  return isCheckinPost(post);
}

/** InlineComposer puts photo/GIF URLs on their own lines. Split them for the lobby post. */
export function liveComposeFromInline(content: string): { text: string; mediaUrls: string[] } {
  const trimmed = content.trim();
  if (!trimmed) {
    return { text: '', mediaUrls: [] };
  }
  return {
    text: commentTextWithoutMedia(trimmed).trim(),
    mediaUrls: commentMediaUrls(trimmed),
  };
}

/** Prefill the lobby composer for Edit. Check-in: real caption only — never the Complete sentinel. */
export function liveEditPrefill(post: { content?: string | null; media_urls?: string[] | null } & CheckinPostLike): string {
  if (isLiveCheckinPost(post)) {
    return checkinComposerPrefill(post.content);
  }
  return liveChatText(post.content, post.media_urls);
}

/** Keep existing proof files. New attachments append. Check-in never drops the last file. */
export function liveEditMediaUrls(
  post: { media_urls?: string[] | null } & CheckinPostLike,
  added: string[],
): string[] {
  const existing = uniqueProofUrls(post.media_urls ?? []);
  const next = uniqueProofUrls([...existing, ...added]);
  if (isLiveCheckinPost(post) && next.length === 0) {
    return existing;
  }
  return next;
}

export function liveChatText(content?: string | null, mediaUrls?: string[] | null): string {
  const text = (content ?? '').trim();
  if (!text) {
    return '';
  }
  const skip = new Set([...(mediaUrls ?? []), ...commentMediaUrls(text)]);
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !skip.has(line))
    .join('\n');
}

export function liveQuotePreview(post: CheckinPostLike & { content?: string | null }): string {
  if (isCheckinPost(post)) {
    return liveCheckinLabel(post);
  }
  const text = liveChatText(post.content, post.media_urls);
  if (text) {
    return text;
  }
  return (post.media_urls ?? []).some(Boolean) ? 'Photo' : '';
}

/** One line for a reply quote or composer preview. Never a stacked card. */
export function liveQuoteLine(name?: string | null, snippet?: string | null): string {
  const who = String(name ?? '').replace(/\s+/g, ' ').trim();
  const what = String(snippet ?? '').replace(/\s+/g, ' ').trim();
  if (what === 'Check-in' || what === 'Check-in Complete') {
    return who;
  }
  if (who && what) {
    return `${who} · ${what}`;
  }
  return who || what;
}

export function findLiveParent(
  posts: PostWithMeta[],
  parentId?: string | null,
): PostWithMeta | null {
  if (!parentId) {
    return null;
  }
  return posts.find((post) => post.id === parentId) ?? null;
}

export type LiveReactionCount = ReactionCount;

/** One chip per type that has at least one reaction. `care` counts as LOL. */
export function liveReactionCounts(
  reactions: Reaction[] | undefined,
  userId?: string,
): LiveReactionCount[] {
  return reactionCounts(reactions, userId);
}

/** One type per person. Tap the same type again to clear it. */
export function toggleLiveReactionList(
  current: Reaction[],
  userId: string,
  type: ReactionType,
  postId: string | null,
  commentId: string | null,
): Reaction[] {
  const nextType = displayReactionType(type) as ReactionType;
  const existing = current.find((row) => row.user_id === userId);
  if (existing && displayReactionType(existing.reaction_type) === nextType) {
    return current.filter((row) => row.id !== existing.id);
  }
  if (existing) {
    return current.map((row) =>
      row.user_id === userId ? { ...row, reaction_type: nextType } : row,
    );
  }
  return [
    ...current,
    {
      id: `optimistic-live-${nextType}-${commentId ?? postId ?? userId}-${userId}`,
      user_id: userId,
      post_id: postId,
      comment_id: commentId,
      reaction_type: nextType,
      created_at: new Date().toISOString(),
    },
  ];
}

export function applyLiveReaction(
  post: PostWithMeta,
  userId: string,
  type: ReactionType,
  commentId?: string | null,
): PostWithMeta {
  if (!commentId) {
    return {
      ...post,
      reactions: toggleLiveReactionList(post.reactions ?? [], userId, type, post.id, null),
    };
  }
  return {
    ...post,
    comments: (post.comments ?? []).map((comment) =>
      comment.id === commentId
        ? {
            ...comment,
            reactions: toggleLiveReactionList(comment.reactions ?? [], userId, type, null, commentId),
          }
        : comment,
    ),
  };
}

export type LiveThreadRow =
  | { id: string; createdAt: string; kind: 'post'; post: PostWithMeta }
  | {
      id: string;
      createdAt: string;
      kind: 'comment';
      comment: CommentWithAuthor;
      parent: PostWithMeta;
    }
  /** Full-width separator, not a bubble. Built by insertLiveDayBreaks. */
  | {
      id: string;
      createdAt: string;
      kind: 'day';
      periodKey: string;
      dateLine: string;
      dayLine: string | null;
    };

export function isLiveSystemPost(post: { type?: string | null } | null | undefined): boolean {
  const type = post?.type;
  return type === 'circle_join' || type === 'circle_invite';
}

export function findLiveHighlightIndex(
  rows: LiveThreadRow[],
  highlightPostId?: string | null,
  highlightCommentId?: string | null,
): number {
  const commentId = String(highlightCommentId ?? '').trim();
  if (commentId) {
    const commentAt = rows.findIndex(
      (row) => row.kind === 'comment' && row.comment.id === commentId,
    );
    if (commentAt >= 0) {
      return commentAt;
    }
  }
  const postId = String(highlightPostId ?? '').trim();
  if (!postId) {
    return -1;
  }
  return rows.findIndex((row) => row.kind === 'post' && row.post.id === postId);
}

/** Posts plus existing comments, oldest first. New replies are posts with parent_id. */
export function buildLiveThreadRows(posts: PostWithMeta[]): LiveThreadRow[] {
  const rows: LiveThreadRow[] = [];
  for (const post of sortLivePosts(posts)) {
    const postId = String(post.id ?? '').trim();
    if (!postId) {
      continue;
    }
    rows.push({ id: postId, createdAt: post.created_at ?? '', kind: 'post', post });
    for (const comment of commentsForThread(post.comments ?? [])) {
      if (!comment?.id) {
        continue;
      }
      rows.push({
        id: `comment:${comment.id}`,
        createdAt: comment.created_at ?? '',
        kind: 'comment',
        comment,
        parent: post,
      });
    }
  }
  return rows.sort((a, b) => {
    const left = Date.parse(String(a.createdAt ?? ''));
    const right = Date.parse(String(b.createdAt ?? ''));
    const leftAt = Number.isFinite(left) ? left : 0;
    const rightAt = Number.isFinite(right) ? right : 0;
    if (leftAt !== rightAt) {
      return leftAt - rightAt;
    }
    return liveRowKey(a).localeCompare(liveRowKey(b));
  });
}

/** Keep the same row object when the source post/comment did not change. */
export function reuseLiveThreadRows(prev: LiveThreadRow[], next: LiveThreadRow[]): LiveThreadRow[] {
  if (prev.length === 0) {
    return next;
  }
  const prevById = new Map(prev.map((row) => [row.id, row]));
  let unchanged = prev.length === next.length;
  const out = next.map((row, index) => {
    const old = prevById.get(row.id);
    if (!old || old.kind !== row.kind) {
      unchanged = false;
      return row;
    }
    if (row.kind === 'day' && old.kind === 'day') {
      if (old.periodKey === row.periodKey && old.dateLine === row.dateLine && old.dayLine === row.dayLine) {
        return old;
      }
      unchanged = false;
      return row;
    }
    if (row.kind === 'post' && old.kind === 'post' && old.post === row.post) {
      return old;
    }
    if (row.kind === 'comment' && old.kind === 'comment' && old.comment === row.comment && old.parent === row.parent) {
      return old;
    }
    if (unchanged && old !== row && prev[index] !== row) {
      unchanged = false;
    } else {
      unchanged = false;
    }
    return row;
  });
  return unchanged && out.every((row, index) => row === prev[index]) ? prev : out;
}
