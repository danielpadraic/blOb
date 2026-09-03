import { format } from 'date-fns';

import { uniqueProofUrls } from '@/lib/challengeProofs';
import { isCheckinCompleteStage, isCheckinPost, type CheckinPostLike } from '@/lib/checkinPost';
import { asReactionType, POST_REACTION_TYPES, type PostReactionType } from '@/lib/reactions';
import type { CommentWithAuthor, PostWithMeta, Reaction, ReactionType } from '@/lib/types';
import { commentMediaUrls, commentTextWithoutMedia } from '@/utils/media';

export type LivePostLike = CheckinPostLike & {
  id?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
};

/** Oldest first so the live edge is the bottom of the thread. */
export function sortLivePosts<T extends LivePostLike>(posts: T[]): T[] {
  return [...posts]
    .filter((post) => Boolean(post?.id) && !post.deleted_at)
    .sort((a, b) => {
      const left = new Date(a.created_at ?? 0).getTime();
      const right = new Date(b.created_at ?? 0).getTime();
      if (left !== right) {
        return left - right;
      }
      return String(a.id).localeCompare(String(b.id));
    });
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

/** Prefill the lobby composer for Edit. Keep check-in captions as stored. */
export function liveEditPrefill(post: { content?: string | null; media_urls?: string[] | null } & CheckinPostLike): string {
  if (isLiveCheckinPost(post)) {
    return (post.content ?? '').trim();
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

export type LiveReactionCount = {
  type: PostReactionType;
  count: number;
  mine: boolean;
};

/** One chip per type that has at least one reaction. Glyph stays the picked type. */
export function liveReactionCounts(
  reactions: Reaction[] | undefined,
  userId?: string,
): LiveReactionCount[] {
  const counts = new Map<PostReactionType, { count: number; mine: boolean }>();
  for (const row of reactions ?? []) {
    const type = asReactionType(row.reaction_type);
    if (!POST_REACTION_TYPES.includes(type as PostReactionType)) {
      continue;
    }
    const key = type as PostReactionType;
    const current = counts.get(key) ?? { count: 0, mine: false };
    current.count += 1;
    if (userId && row.user_id === userId) {
      current.mine = true;
    }
    counts.set(key, current);
  }
  return POST_REACTION_TYPES.filter((type) => counts.has(type)).map((type) => ({
    type,
    count: counts.get(type)!.count,
    mine: counts.get(type)!.mine,
  }));
}

/** Add or remove that type only. Other types the same person picked stay. */
export function toggleLiveReactionList(
  current: Reaction[],
  userId: string,
  type: ReactionType,
  postId: string | null,
  commentId: string | null,
): Reaction[] {
  const existing = current.find(
    (row) => row.user_id === userId && asReactionType(row.reaction_type) === type,
  );
  if (existing) {
    return current.filter((row) => row.id !== existing.id);
  }
  return [
    ...current,
    {
      id: `optimistic-live-${type}-${commentId ?? postId ?? userId}-${userId}`,
      user_id: userId,
      post_id: postId,
      comment_id: commentId,
      reaction_type: type,
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
    };

/** Posts plus existing comments, oldest first. New replies are posts with parent_id. */
export function buildLiveThreadRows(posts: PostWithMeta[]): LiveThreadRow[] {
  const rows: LiveThreadRow[] = [];
  for (const post of sortLivePosts(posts)) {
    rows.push({ id: post.id, createdAt: post.created_at, kind: 'post', post });
    if (isCheckinPost(post)) {
      continue;
    }
    for (const comment of post.comments ?? []) {
      if (!comment?.id) {
        continue;
      }
      rows.push({
        id: `comment:${comment.id}`,
        createdAt: comment.created_at,
        kind: 'comment',
        comment,
        parent: post,
      });
    }
  }
  return rows.sort((a, b) => {
    const left = new Date(a.createdAt).getTime();
    const right = new Date(b.createdAt).getTime();
    if (left !== right) {
      return left - right;
    }
    return a.id.localeCompare(b.id);
  });
}
