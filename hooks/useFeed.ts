import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { Alert } from 'react-native';

import { clipPostsQueryKey } from '@/lib/clipPost';
import { isHomeExcludedClipType } from '@/lib/clipPost';
import { OFFICIAL_CHALLENGE_TITLE } from '@/lib/constants';
import { asQuoteSnapshot } from '@/lib/quotePost';
import { isClipSharePost } from '@/lib/roundShare';
import { homeFeedAllowsChallengeContent } from '@/lib/privacyMode';
import { DEFAULT_POST_AUDIENCE, viewerCanSeeHomePost, type PostAudience } from '@/lib/postAudience';
import { reportAppError } from '@/lib/appErrors';
import { rawFeedError } from '@/lib/feedError';
import { logMissingPublishAuthor, safeUserId, sessionAuthor } from '@/lib/safeIds';
import {
  dropCachedCircleId,
  isMissingCircleIdColumn,
  resolvePostsSchema,
  selectWithoutCircleId,
  type PostsSchema,
} from '@/lib/postsSelect';
import { supabase } from '@/lib/supabase';
import type {
  CommentWithAuthor,
  ComposeInput,
  Post,
  PostMention,
  PostWithMeta,
  PublicProfile,
  Reaction,
  ReactionType,
} from '@/lib/types';
import { reportBadgeActivity } from '@/lib/badgeActivity';
import { queryClient as appQueryClient } from '@/lib/queryClient';
import { fetchAuthorsSharingAcceptedFriend, fetchCirclePreviews } from '@/lib/circles';
import { fetchFriends, type FriendEdge } from '@/lib/social';
import {
  getErrorMessage,
  isMentionAccessDenied,
  isMissingRelationError,
  isReactionConflict,
  isUnknownColumnError,
} from '@/utils/errors';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import {
  HOME_FIRST_PAINT_WINDOWS,
  HOME_PAGE_SIZE,
  HOME_QUERY_TYPE_OR,
  HOME_RAW_WINDOW,
  circleFofCandidateIds,
  filterHomeFeedPosts,
  homeFeedCursorFrom,
  takeHomeVisiblePage,
  uniquePostsById,
  withSatelliteTimeout,
  type HomeFeedAllowContext,
  type HomeFeedCursor,
} from '@/lib/homeFeed';

const REACTION_COLUMNS = 'id, user_id, post_id, comment_id, reaction_type, created_at';
const REACTION_COLUMNS_LEGACY = 'id, user_id, post_id, reaction_type, created_at';

function feedListKey(scope: string, userId?: string | null) {
  return ['feed', scope, userId] as const;
}

export { rawFeedError } from '@/lib/feedError';

let lastHomeFeedWarning: string | null = null;

export function peekHomeFeedWarning(): string | null {
  return lastHomeFeedWarning;
}

function asFeedPost(
  post: Post,
  author: PublicProfile | undefined,
  mentionedUserIds?: string[],
): PostWithMeta {
  return {
    ...(post as PostWithMeta),
    author,
    comments: [],
    reactions: [],
    mentions: (mentionedUserIds ?? []).map((userId) => ({
      userId,
      username: '',
      available: true,
    })),
  };
}

async function insertMentionRowsOnce(
  run: () => PromiseLike<{ error: { message?: string } | null }>,
) {
  let result = await run();
  if (result.error && !isMissingRelationError(result.error)) {
    result = await run();
  }
  if (result.error && !isMissingRelationError(result.error)) {
    throw new Error(getErrorMessage(result.error));
  }
}

type FeedScope =
  | { kind: 'challenge'; challengeId: string }
  | { kind: 'circle'; circleId: string }
  | { kind: 'circleIds'; circleIds: string[] }
  | { kind: 'circleDiscover' }
  | { kind: 'global' }
  | { kind: 'ids'; challengeIds: string[] }
  | { kind: 'authors'; authorIds: string[] }
  | { kind: 'wall'; hostId: string }
  | { kind: 'wallHosts'; hostIds: string[] };

function isCircleScope(scope: FeedScope): boolean {
  return scope.kind === 'circle' || scope.kind === 'circleIds' || scope.kind === 'circleDiscover';
}

type PostPage = {
  limit?: number;
  before?: HomeFeedCursor | null;
};

export type HomeFeedPage = {
  posts: PostWithMeta[];
  cursor: HomeFeedCursor | null;
  hasMore: boolean;
};

export type HomePageParam = {
  cursor: HomeFeedCursor | null;
  seenIds: string[];
};

async function queryPosts(scope: FeedScope, page?: PostPage): Promise<PostWithMeta[]> {
  if (scope.kind === 'ids' && scope.challengeIds.length === 0) {
    return [];
  }
  if (scope.kind === 'circleIds' && scope.circleIds.length === 0) {
    return [];
  }
  if (scope.kind === 'authors' && scope.authorIds.length === 0) {
    return [];
  }
  if (scope.kind === 'wall' && !scope.hostId) {
    return [];
  }
  if (scope.kind === 'wallHosts' && scope.hostIds.length === 0) {
    return [];
  }

  const schema = await resolvePostsSchema();
  if (!schema.hasCircleId && isCircleScope(scope)) {
    return [];
  }

  let select = schema.select;
  let result = await fetchPostRows(select, scope, true, page);
  if (result.error && isMissingDeletedAt(result.error)) {
    result = await fetchPostRows(select, scope, false, page);
  }
  if (result.error && isMissingCircleIdColumn(result.error)) {
    dropCachedCircleId();
    if (isCircleScope(scope)) {
      return [];
    }
    select = selectWithoutCircleId(select);
    result = await fetchPostRows(select, scope, true, page);
    if (result.error && isMissingDeletedAt(result.error)) {
      result = await fetchPostRows(select, scope, false, page);
    }
  }

  const { data, error } = result;
  if (error) {
    throw new Error(rawFeedError(error));
  }
  return ((data ?? []) as unknown as PostWithMeta[])
    .filter(
      (post) =>
        !post.deleted_at &&
        post.moderation_status !== 'under_review' &&
        post.moderation_status !== 'removed',
    )
    .map(withQuoteSnapshot);
}

function isMissingDeletedAt(error: { message?: string }): boolean {
  const text = String(error.message ?? '').toLowerCase();
  return (
    text.includes('deleted_at') &&
    (text.includes('does not exist') || text.includes('schema cache') || text.includes('42703'))
  );
}

const HOME_TYPE_SCOPES = new Set<FeedScope['kind']>([
  'authors',
  'ids',
  'circleIds',
  'circleDiscover',
  'wallHosts',
]);

function excludeHomeClipTypes<T extends { or: (filter: string) => T }>(
  query: T,
  select: string,
  scopeKind: FeedScope['kind'],
): T {
  if (!HOME_TYPE_SCOPES.has(scopeKind) || !/(^|,\s*)type(,|$)/.test(select)) {
    return query;
  }
  return query.or(HOME_QUERY_TYPE_OR);
}

function fetchPostRows(select: string, scope: FeedScope, hideDeleted: boolean, page?: PostPage) {
  const limit = page?.limit ?? 50;
  let query = supabase.from('posts').select(select).order('created_at', { ascending: false }).limit(limit);
  if (page?.before?.createdAt) {
    query = query.lt('created_at', page.before.createdAt);
  }
  if (hideDeleted) {
    query = query.is('deleted_at', null);
  }
  // Check-in posts stay on Home when they match joined challenges / friends.
  // Challenge detail still scopes by challenge_id + source.
  const hasSource = /(^|,\s*)source(,|$)/.test(select);
  const hasCircleId = /(^|,\s*)circle_id(,|$)/.test(select);
  const withHomeTypes = <T extends { or: (filter: string) => T }>(next: T) =>
    excludeHomeClipTypes(next, select, scope.kind);
  if (scope.kind === 'challenge') {
    query = query.eq('challenge_id', scope.challengeId);
    if (hasSource) {
      query = query.in('source', ['challenge', 'checkin']);
    }
    return query;
  }
  if (scope.kind === 'circle') {
    return hasCircleId ? query.eq('circle_id', scope.circleId) : query.limit(0);
  }
  if (scope.kind === 'circleIds') {
    return hasCircleId ? withHomeTypes(query.in('circle_id', scope.circleIds)) : query.limit(0);
  }
  if (scope.kind === 'circleDiscover') {
    return hasCircleId ? withHomeTypes(query.not('circle_id', 'is', null)) : query.limit(0);
  }
  if (scope.kind === 'ids') {
    return withHomeTypes(query.in('challenge_id', scope.challengeIds));
  }
  if (scope.kind === 'authors') {
    return withHomeTypes(query.in('author_id', scope.authorIds));
  }
  if (scope.kind === 'wall') {
    return query.or(
      `and(author_id.eq.${scope.hostId},wall_host_id.is.null),and(wall_host_id.eq.${scope.hostId},wall_removed_at.is.null)`,
    );
  }
  if (scope.kind === 'wallHosts') {
    return withHomeTypes(query.in('wall_host_id', scope.hostIds).is('wall_removed_at', null));
  }
  if (hasSource) {
    return query.in('source', ['feed', 'share']);
  }
  return query.is('challenge_id', null);
}

function withQuoteSnapshot(post: PostWithMeta): PostWithMeta {
  return {
    ...post,
    quote_snapshot: asQuoteSnapshot(post.quote_snapshot) ?? post.quote_snapshot ?? null,
  };
}

function postInsertPayload(
  schema: PostsSchema,
  base: {
    author_id: string;
    challenge_id?: string | null;
    circle_id?: string | null;
    content: string | null;
    media_urls: string[];
    audience?: string;
    audience_user_ids?: string[];
    quoted_post_id?: string | null;
    quote_snapshot?: PostWithMeta['quote_snapshot'];
    wall_host_id?: string | null;
    source?: Post['source'];
    type?: Post['type'];
    duration_ms?: number | null;
    parent_id?: string | null;
  },
) {
  const payload: Record<string, unknown> = {
    author_id: base.author_id,
    challenge_id: base.challenge_id ?? null,
    content: base.content,
    media_urls: base.media_urls,
  };
  if (schema.hasCircleId) {
    payload.circle_id = base.circle_id ?? null;
  }
  if (schema.hasAudience) {
    payload.audience = base.audience ?? DEFAULT_POST_AUDIENCE;
    payload.audience_user_ids = base.audience_user_ids ?? [];
  }
  if (schema.hasQuote && (base.quoted_post_id || base.quote_snapshot || base.parent_id)) {
    if (base.quoted_post_id) {
      payload.quoted_post_id = base.quoted_post_id;
    }
    if (base.quote_snapshot) {
      payload.quote_snapshot = base.quote_snapshot;
    }
  }
  if (schema.hasWall && base.wall_host_id) {
    payload.wall_host_id = base.wall_host_id;
  }
  if (schema.hasSource) {
    payload.source = base.source ?? 'feed';
  }
  if (schema.hasType) {
    payload.type = base.type ?? 'feed';
  }
  if (schema.hasDuration && base.duration_ms != null) {
    payload.duration_ms = base.duration_ms;
  }
  if (schema.hasParentId && base.parent_id) {
    payload.parent_id = base.parent_id;
  }
  return payload;
}

async function withSocial(posts: PostWithMeta[], viewerId?: string): Promise<PostWithMeta[]> {
  const ids = posts.map((post) => post.id);
  if (ids.length === 0) {
    return posts;
  }

  const commentsResult = await fetchComments(ids);
  const comments = (commentsResult.data ?? []) as CommentWithAuthor[];
  const commentIds = comments.map((comment) => comment.id).filter(Boolean);

  const [postReactionsResult, commentReactionsResult] = await Promise.all([
    fetchReactions({ column: 'post_id', ids }),
    commentIds.length > 0
      ? fetchReactions({ column: 'comment_id', ids: commentIds })
      : Promise.resolve({ data: [] as Reaction[], error: null }),
  ]);

  const commentsByPost = new Map<string, CommentWithAuthor[]>();
  const reactionsByComment = new Map<string, Reaction[]>();
  for (const reaction of commentReactionsResult.data ?? []) {
    if (!reaction.comment_id) {
      continue;
    }
    const list = reactionsByComment.get(reaction.comment_id) ?? [];
    list.push(reaction);
    reactionsByComment.set(reaction.comment_id, list);
  }

  for (const comment of comments) {
    const list = commentsByPost.get(comment.post_id) ?? [];
    list.push({
      ...comment,
      reactions: reactionsByComment.get(comment.id) ?? [],
    });
    commentsByPost.set(comment.post_id, list);
  }

  const reactionsByPost = new Map<string, Reaction[]>();
  for (const reaction of (postReactionsResult.data ?? []) as Reaction[]) {
    if (!reaction.post_id || reaction.comment_id) {
      continue;
    }
    const list = reactionsByPost.get(reaction.post_id) ?? [];
    list.push(reaction);
    reactionsByPost.set(reaction.post_id, list);
  }

  const withComments = posts.map((post) => ({
    ...post,
    comments: commentsByPost.get(post.id) ?? post.comments ?? [],
    reactions: reactionsByPost.get(post.id) ?? post.reactions ?? [],
  }));
  return withMentions(withComments, viewerId);
}

async function withMentions(posts: PostWithMeta[], viewerId?: string): Promise<PostWithMeta[]> {
  try {
  const postIds = posts.map((post) => post.id);
  const commentIds = posts.flatMap((post) => (post.comments ?? []).map((comment) => comment.id));
  type MentionRow = {
    post_id: string;
    mentioned_user_id?: string | null;
    challenge_id?: string | null;
    circle_id?: string | null;
  };
  let postMentionRows: { data: MentionRow[] | null; error: { message?: string; code?: string } | null } =
    await supabase
      .from('post_mentions')
      .select('post_id, mentioned_user_id, challenge_id, circle_id')
      .in('post_id', postIds);
  if (
    postMentionRows.error &&
    (isMissingCircleIdColumn(postMentionRows.error) ||
      isUnknownColumnError(postMentionRows.error) ||
      /challenge_id|circle_id/.test(String(postMentionRows.error.message ?? '')))
  ) {
    postMentionRows = await supabase
      .from('post_mentions')
      .select('post_id, mentioned_user_id')
      .in('post_id', postIds);
  }
  const commentMentionRows = {
    data: await fetchCommentMentions(commentIds),
    error: null as { message?: string } | null,
  };
  if (postMentionRows.error) {
    if (!isMissingRelationError(postMentionRows.error)) {
      console.log('[blob:feed] post_mentions skipped', postMentionRows.error.message);
    }
  }
  const postMentions = postMentionRows.error
    ? []
    : ((postMentionRows.data ?? []) as {
        post_id: string;
        mentioned_user_id?: string | null;
        challenge_id?: string | null;
        circle_id?: string | null;
      }[]);
  const commentMentions = commentMentionRows.error ? [] : (commentMentionRows.data ?? []);
  const mentionedIds = [
    ...postMentions.map((row) => row.mentioned_user_id).filter((id): id is string => Boolean(id)),
    ...commentMentions.map((row) => row.mentioned_user_id).filter((id): id is string => Boolean(id)),
    ...posts.map((post) => post.wall_host_id).filter((id): id is string => Boolean(id)),
  ];
  const unique = [...new Set(mentionedIds)];
  const challengeIds = [...new Set(postMentions.map((row) => row.challenge_id).filter((id): id is string => Boolean(id)))];
  const circleMentionIds = [...new Set(postMentions.map((row) => row.circle_id).filter((id): id is string => Boolean(id)))];
  const [profiles, blocked, challengeRows, circleRows] = await Promise.all([
    unique.length
      ? supabase.from('profiles').select('id, username, display_name, avatar_url, is_official').in('id', unique)
      : Promise.resolve({ data: [] as { id: string; username: string; display_name: string | null }[], error: null }),
    viewerId && unique.length ? fetchBlockedUserIds(viewerId) : Promise.resolve([] as string[]),
    challengeIds.length
      ? supabase.from('challenges').select('id, title').in('id', challengeIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null }[], error: null }),
    circleMentionIds.length
      ? fetchCirclePreviews(circleMentionIds).catch(() => new Map())
      : Promise.resolve(new Map()),
  ]);
  const byId = new Map((profiles.data ?? []).map((row) => [row.id, row]));
  const blockedIds = new Set(blocked);
  const challengeById = new Map((challengeRows.data ?? []).map((row) => [row.id, row]));

  const mentionsByPost = new Map<string, PostMention[]>();
  for (const row of postMentions) {
    const list = mentionsByPost.get(row.post_id) ?? [];
    if (row.circle_id) {
      const circle = circleRows.get(row.circle_id);
      list.push({
        userId: row.circle_id,
        username: circle?.name ?? 'Circle',
        displayName: circle?.name ?? 'Circle',
        available: true,
        kind: 'circle',
      });
    } else if (row.challenge_id) {
      const challenge = challengeById.get(row.challenge_id);
      const title = String(challenge?.title ?? '').trim() || 'this challenge';
      list.push({
        userId: row.challenge_id,
        username: title,
        displayName: title,
        available: Boolean(challenge),
        kind: 'challenge',
      });
    } else if (row.mentioned_user_id) {
      const profile = byId.get(row.mentioned_user_id);
      list.push({
        userId: row.mentioned_user_id,
        username: profile?.username ?? 'blob',
        displayName: profile?.display_name,
        available: Boolean(profile?.username) && !blockedIds.has(row.mentioned_user_id),
        kind: 'user',
      });
    }
    mentionsByPost.set(row.post_id, list);
  }
  const mentionsByComment = new Map<string, PostMention[]>();
  for (const row of commentMentions) {
    const profile = byId.get(row.mentioned_user_id);
    const list = mentionsByComment.get(row.comment_id) ?? [];
    list.push({
      userId: row.mentioned_user_id,
      username: profile?.username ?? 'blob',
      displayName: profile?.display_name,
      available: Boolean(profile?.username) && !blockedIds.has(row.mentioned_user_id),
    });
    mentionsByComment.set(row.comment_id, list);
  }

  return posts.map((post) => ({
    ...post,
    mentions: mentionsByPost.get(post.id) ?? [],
    wall_host: post.wall_host_id ? asPublicProfile(byId.get(post.wall_host_id) ?? null) ?? null : post.wall_host,
    comments: (post.comments ?? []).map((comment) => ({
      ...comment,
      mentions: mentionsByComment.get(comment.id) ?? comment.mentions,
    })),
  }));
  } catch (error) {
    if (!isMissingRelationError(error)) {
      console.log('[blob:feed] mentions skipped', getErrorMessage(error));
    }
    return posts;
  }
}

async function fetchReactions(input: {
  column: 'post_id' | 'comment_id';
  ids: string[];
}): Promise<{ data: Reaction[]; error: { message: string } | null }> {
  const full = await supabase
    .from('reactions')
    .select(REACTION_COLUMNS)
    .in(input.column, input.ids);
  if (!full.error) {
    return { data: (full.data ?? []) as Reaction[], error: null };
  }
  if (input.column === 'comment_id') {
    return { data: [], error: full.error };
  }
  const legacy = await supabase
    .from('reactions')
    .select(REACTION_COLUMNS_LEGACY)
    .in('post_id', input.ids);
  if (legacy.error) {
    return { data: [], error: legacy.error };
  }
  return {
    data: ((legacy.data ?? []) as Reaction[]).map((row) => ({ ...row, comment_id: null })),
    error: null,
  };
}

async function fetchComments(postIds: string[]) {
  const nested = await supabase
    .from('comments')
    .select('id, post_id, author_id, parent_id, content, created_at')
    .in('post_id', postIds)
    .order('created_at', { ascending: true });
  if (!nested.error) {
    return nested;
  }
  const missingParent =
    nested.error.message.toLowerCase().includes('parent_id') ||
    nested.error.message.toLowerCase().includes('column');
  if (!missingParent) {
    return nested;
  }
  return supabase
    .from('comments')
    .select('id, post_id, author_id, content, created_at')
    .in('post_id', postIds)
    .order('created_at', { ascending: true });
}

async function hydrateAuthors(posts: PostWithMeta[]): Promise<PostWithMeta[]> {
  const ids = new Set<string>();
  for (const post of posts) {
    const authorId = String(post.author_id ?? '').trim();
    if (!post.author && authorId) {
      ids.add(authorId);
    }
    if (post.wall_host_id && !post.wall_host) {
      ids.add(post.wall_host_id);
    }
    for (const comment of post.comments ?? []) {
      const commentAuthorId = String(comment.author_id ?? '').trim();
      if (!comment.author && commentAuthorId) {
        ids.add(commentAuthorId);
      }
    }
  }
  if (ids.size === 0) {
    return posts.map((post) => ({
      ...post,
      author: post.author ?? stubAuthor(post.author_id),
      comments: (post.comments ?? []).map((comment) => ({
        ...comment,
        author: comment.author ?? stubAuthor(comment.author_id),
      })),
    }));
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, is_official')
    .in('id', [...ids]);
  if (error || !data) {
    return posts.map((post) => ({
      ...post,
      author: post.author ?? stubAuthor(post.author_id),
      comments: (post.comments ?? []).map((comment) => ({
        ...comment,
        author: comment.author ?? stubAuthor(comment.author_id),
      })),
    }));
  }

  const byId = new Map(
    (data ?? [])
      .filter((row) => row?.id)
      .map((row) => [row.id, asPublicProfile(row)])
      .filter((entry): entry is [string, PublicProfile] => Boolean(entry[1])),
  );
  return posts.map((post) => ({
    ...post,
    author: post.author ?? byId.get(post.author_id) ?? stubAuthor(post.author_id),
    wall_host: post.wall_host
      ?? (post.wall_host_id ? byId.get(post.wall_host_id) ?? post.wall_host ?? null : post.wall_host),
    comments: (post.comments ?? []).map((comment) => ({
      ...comment,
      author: comment.author ?? byId.get(comment.author_id) ?? stubAuthor(comment.author_id),
    })),
  }));
}

async function hydrateCircles(posts: PostWithMeta[]): Promise<PostWithMeta[]> {
  const ids = [
    ...new Set(posts.map((post) => post.circle_id).filter((id): id is string => Boolean(id))),
  ];
  if (ids.length === 0) {
    return posts;
  }
  try {
    const byId = await fetchCirclePreviews(ids);
    return posts.map((post) => ({
      ...post,
      circle: post.circle_id ? byId.get(post.circle_id) ?? post.circle ?? null : null,
    }));
  } catch (error) {
    if (!isMissingRelationError(error)) {
      console.log('[blob:feed] circle hydrate skipped', getErrorMessage(error));
    }
    return posts;
  }
}

function dedupePosts(groups: PostWithMeta[][]): PostWithMeta[] {
  const byId = new Map<string, PostWithMeta>();
  for (const group of groups) {
    for (const post of group) {
      byId.set(post.id, post);
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/** Profile wall: same audience rule as Home, plus wall-host / hide filters. */
function viewerCanSeeProfilePost(
  post: PostWithMeta,
  input: {
    viewerId?: string;
    profileId: string;
    friendsWithAuthor: boolean;
    officialAuthor: boolean;
    hidden: Set<string>;
  },
): boolean {
  if (input.hidden.has(post.id)) {
    return false;
  }
  if (post.hidden_from_home && post.author_id !== input.viewerId) {
    return false;
  }
  if (isHomeExcludedClipType(post.type)) {
    return false;
  }
  if (post.wall_removed_at) {
    return false;
  }
  if (post.wall_host_id && post.wall_host_id !== input.profileId) {
    return false;
  }
  return viewerCanSeeHomePost({
    viewerId: input.viewerId,
    authorId: post.author_id,
    audience: post.audience,
    audienceUserIds: post.audience_user_ids,
    friendsWithAuthor: input.friendsWithAuthor,
    officialAuthor: input.officialAuthor && post.author_id === input.profileId,
    wallHostId: post.wall_host_id,
  });
}

async function fetchBlockedUserIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('user_a_id, user_b_id')
    .eq('status', 'blocked')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);
  if (error) {
    if (!isMissingRelationError(error)) {
      console.log('[blob:feed] blocked lookup skipped', error.message);
    }
    return [];
  }
  return (data ?? []).map((row) => (row.user_a_id === userId ? row.user_b_id : row.user_a_id));
}

async function fetchHiddenPostIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('post_hides').select('post_id').eq('user_id', userId);
  if (error) {
    if (!isMissingRelationError(error)) {
      console.log('[blob:feed] post_hides lookup skipped', error.message);
    }
    return [];
  }
  return (data ?? []).map((row) => row.post_id);
}

async function fetchMutedUserIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('mutes').select('muted_user_id').eq('user_id', userId);
  if (error) {
    if (!isMissingRelationError(error)) {
      console.log('[blob:feed] mutes lookup skipped', error.message);
    }
    return [];
  }
  return (data ?? []).map((row) => row.muted_user_id);
}

async function fetchJoinedChallengeIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('challenge_participants')
    .select('challenge_id')
    .eq('user_id', userId);
  if (error) {
    console.log('[blob:feed] joined challenges lookup failed', error.message);
    return [];
  }
  return (data ?? []).map((row) => row.challenge_id);
}

function friendsKey(userId: string) {
  return ['friends', userId] as const;
}

function friendIdsFromEdges(userId: string, edges: FriendEdge[]): string[] {
  return edges.map((row) => (row.user_a_id === userId ? row.user_b_id : row.user_a_id));
}

async function friendIdsForUser(userId: string): Promise<string[]> {
  try {
    const edges = await appQueryClient.ensureQueryData({
      queryKey: friendsKey(userId),
      queryFn: () => fetchFriends(userId),
      staleTime: 30_000,
    });
    return friendIdsFromEdges(userId, edges);
  } catch (error) {
    console.log(
      '[blob:feed] friends lookup failed',
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }
}

async function fetchJoinedCircleIds(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.from('circle_members').select('circle_id').eq('user_id', userId);
    if (error) {
      if (!isMissingRelationError(error)) {
        console.log('[blob:feed] circles lookup skipped', error.message);
      }
      return [];
    }
    return (data ?? []).map((row) => row.circle_id).filter(Boolean);
  } catch (error) {
    if (!isMissingRelationError(error)) {
      console.log('[blob:feed] circles lookup skipped', getErrorMessage(error));
    }
    return [];
  }
}

async function fetchHostedChallengeIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('challenges').select('id').eq('created_by', userId);
  if (error) {
    console.log('[blob:feed] hosted challenges lookup failed', error.message);
    return [];
  }
  return (data ?? []).map((row) => row.id);
}

async function fetchCorporateChallengeIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return new Set();
  }
  const { data, error } = await supabase.from('challenges').select('id, privacy_mode').in('id', unique);
  if (error) {
    console.log('[blob:feed] privacy lookup skipped', error.message);
    return new Set();
  }
  return new Set(
    (data ?? [])
      .filter((row) => !homeFeedAllowsChallengeContent(row.privacy_mode))
      .map((row) => row.id),
  );
}

async function fetchOfficialAuthorIds(): Promise<string[]> {
  const { data, error } = await supabase.from('profiles').select('id').eq('is_official', true);
  if (error) {
    console.log('[blob:feed] official authors lookup failed', error.message);
    return [];
  }
  return (data ?? []).map((row) => row.id).filter(Boolean);
}

async function fetchRecommendedCreatorIds(userId: string): Promise<string[]> {
  const full = await supabase
    .from('profiles')
    .select('id, is_official, is_creator, profile_visibility')
    .neq('id', userId)
    .or('is_official.eq.true,is_creator.eq.true')
    .limit(40);
  if (!full.error && full.data) {
    return (full.data as Array<{
      id: string;
      is_official?: boolean | null;
      is_creator?: boolean | null;
      profile_visibility?: string | null;
    }>)
      .filter((row) => {
        if (row.is_official) {
          return true;
        }
        if (!row.is_creator) {
          return false;
        }
        const visibility = String(row.profile_visibility ?? 'public');
        return visibility === 'public';
      })
      .map((row) => row.id);
  }
  if (full.error) {
    console.log('[blob:feed] recommended creators lookup skipped', full.error.message);
  }
  return fetchOfficialAuthorIds();
}

type HomeFeedContextBase = {
  challengeIds: string[];
  circleIds: string[];
  friendIds: string[];
  officialIds: string[];
  recommendedIds: string[];
  hiddenIds: string[];
  mutedIds: string[];
  blockedIds: string[];
};

let homeCtxCache: { userId: string; at: number; value: HomeFeedContextBase } | null = null;

async function loadHomeFeedContext(userId: string, fresh = false): Promise<HomeFeedContextBase> {
  if (
    !fresh &&
    homeCtxCache &&
    homeCtxCache.userId === userId &&
    Date.now() - homeCtxCache.at < 30_000
  ) {
    return homeCtxCache.value;
  }
  lastHomeFeedWarning = null;
  const noteHomeError = (error: unknown) => {
    const message = rawFeedError(error);
    console.log('[blob:feed]', message);
    if (!lastHomeFeedWarning) {
      lastHomeFeedWarning = message;
      reportAppError({ route: 'feed/home', error, message });
    }
  };
  const emptyIds = async (run: () => Promise<string[]>) => {
    try {
      return await run();
    } catch (error) {
      noteHomeError(error);
      return [] as string[];
    }
  };
  const satelliteIds = (run: () => Promise<string[]>) =>
    withSatelliteTimeout(emptyIds(run), [] as string[]);
  const [joinedIds, friendIds] = await Promise.all([
    emptyIds(() => fetchJoinedChallengeIds(userId)),
    satelliteIds(() => friendIdsForUser(userId)),
  ]);
  const [hostedIds, circleIds, officialIds, recommendedIds, hiddenIds, mutedIds, blockedIds] =
    await Promise.all([
      satelliteIds(() => fetchHostedChallengeIds(userId)),
      satelliteIds(() => fetchJoinedCircleIds(userId)),
      satelliteIds(() => fetchOfficialAuthorIds()),
      satelliteIds(() => fetchRecommendedCreatorIds(userId)),
      satelliteIds(() => fetchHiddenPostIds(userId)),
      satelliteIds(() => fetchMutedUserIds(userId)),
      satelliteIds(() => fetchBlockedUserIds(userId)),
    ]);
  const value = {
    challengeIds: [...new Set([...joinedIds, ...hostedIds])],
    circleIds,
    friendIds,
    officialIds,
    recommendedIds,
    hiddenIds,
    mutedIds,
    blockedIds,
  };
  homeCtxCache = { userId, at: Date.now(), value };
  return value;
}

async function queryHomeSources(input: {
  challengeIds: string[];
  circleIds: string[];
  authorIds: string[];
  wallHostIds: string[];
  hasCircleId: boolean;
  before: HomeFeedCursor | null;
}): Promise<PostWithMeta[]> {
  const page = { limit: HOME_RAW_WINDOW, before: input.before };
  const none: PostWithMeta[] = [];
  const note = (error: unknown) => {
    const message = rawFeedError(error);
    console.log('[blob:feed]', message);
    reportAppError({ route: 'feed/home', error, message });
    if (!lastHomeFeedWarning) {
      lastHomeFeedWarning = message;
    }
  };
  const skip = (error: unknown) => {
    note(error);
    return none;
  };
  let primaryError: unknown = null;
  const [people, challengePosts] = await Promise.all([
    queryPosts({ kind: 'authors', authorIds: input.authorIds }, page).catch((error) => {
      primaryError = error;
      return skip(error);
    }),
    queryPosts({ kind: 'ids', challengeIds: input.challengeIds }, page).catch((error) => {
      primaryError = error;
      return skip(error);
    }),
  ]);
  const [circlePosts, discoverCircles, wall] = await Promise.all([
    withSatelliteTimeout(
      queryPosts({ kind: 'circleIds', circleIds: input.circleIds }, page).catch(skip),
      none,
    ),
    input.hasCircleId
      ? withSatelliteTimeout(
          queryPosts({ kind: 'circleDiscover' }, page).catch(skip),
          none,
        )
      : Promise.resolve(none),
    withSatelliteTimeout(
      queryPosts({ kind: 'wallHosts', hostIds: input.wallHostIds }, page).catch(skip),
      none,
    ),
  ]);
  if (primaryError && people.length === 0 && challengePosts.length === 0) {
    throw primaryError instanceof Error ? primaryError : new Error(rawFeedError(primaryError));
  }
  return dedupePosts([people, challengePosts, circlePosts, discoverCircles, wall]);
}

async function fetchHomeFeedPage(input: {
  userId: string;
  cursor: HomeFeedCursor | null;
  seenIds: string[];
}): Promise<HomeFeedPage> {
  const first = !input.cursor;
  const base = await loadHomeFeedContext(input.userId, first);
  const schema = await resolvePostsSchema();
  const authorIds = [...new Set([input.userId, ...base.friendIds, ...base.officialIds, ...base.recommendedIds])];
  const wallHostIds = [...new Set([input.userId, ...base.friendIds])];
  const friends = new Set(base.friendIds);
  const official = new Set(base.officialIds);
  const recommended = new Set(base.recommendedIds);
  const challengeIdSet = new Set(base.challengeIds);
  const circleIdSet = new Set(base.circleIds);
  const hidden = new Set(base.hiddenIds);
  const muted = new Set(base.mutedIds);
  const blocked = new Set(base.blockedIds);

  let cursor = input.cursor;
  let scanned: PostWithMeta[] = [];
  let hasMore = false;
  const windows = first ? HOME_FIRST_PAINT_WINDOWS : 2;

  for (let i = 0; i < windows; i += 1) {
    const raw = await queryHomeSources({
      challengeIds: base.challengeIds,
      circleIds: base.circleIds,
      authorIds,
      wallHostIds,
      hasCircleId: schema.hasCircleId,
      before: cursor,
    });
    if (raw.length === 0) {
      hasMore = false;
      break;
    }
    scanned = uniquePostsById([...scanned, ...raw]);
    hasMore = raw.length >= HOME_RAW_WINDOW;
    cursor = homeFeedCursorFrom(raw);
    if (!cursor) {
      hasMore = false;
      break;
    }
    const preview = await hydrateCircles(scanned);
    let corporateIds = new Set<string>();
    try {
      corporateIds = await fetchCorporateChallengeIds(
        preview.map((post) => post.challenge_id).filter((id): id is string => Boolean(id)),
      );
    } catch (error) {
      console.log('[blob:feed]', rawFeedError(error));
    }
    let fofAuthors = new Set<string>();
    try {
      fofAuthors = await fetchAuthorsSharingAcceptedFriend(
        input.userId,
        friends,
        circleFofCandidateIds(preview, {
          viewerId: input.userId,
          friends,
          circleIds: circleIdSet,
        }),
      );
    } catch (error) {
      console.log('[blob:feed]', rawFeedError(error));
    }
    const allow: HomeFeedAllowContext = {
      viewerId: input.userId,
      hidden,
      muted,
      blocked,
      friends,
      official,
      recommended,
      challengeIds: challengeIdSet,
      circleIds: circleIdSet,
      corporateIds,
      fofAuthors,
    };
    const filtered = filterHomeFeedPosts(preview, allow);
    const visible = takeHomeVisiblePage(filtered, input.seenIds);
    if (visible.length >= HOME_PAGE_SIZE || !hasMore) {
      const page = await hydrateAuthors(visible);
      return {
        posts: page,
        cursor: homeFeedCursorFrom(page) ?? cursor,
        hasMore: hasMore || filtered.length > visible.length,
      };
    }
  }

  const preview = scanned.length > 0 ? await hydrateCircles(scanned) : [];
  let corporateIds = new Set<string>();
  try {
    corporateIds = await fetchCorporateChallengeIds(
      preview.map((post) => post.challenge_id).filter((id): id is string => Boolean(id)),
    );
  } catch {
    corporateIds = new Set();
  }
  let fofAuthors = new Set<string>();
  try {
    fofAuthors = await fetchAuthorsSharingAcceptedFriend(
      input.userId,
      friends,
      circleFofCandidateIds(preview, { viewerId: input.userId, friends, circleIds: circleIdSet }),
    );
  } catch {
    fofAuthors = new Set();
  }
  const allow: HomeFeedAllowContext = {
    viewerId: input.userId,
    hidden,
    muted,
    blocked,
    friends,
    official,
    recommended,
    challengeIds: challengeIdSet,
    circleIds: circleIdSet,
    corporateIds,
    fofAuthors,
  };
  const filtered = filterHomeFeedPosts(preview, allow);
  const visible = takeHomeVisiblePage(filtered, input.seenIds);
  const page = await hydrateAuthors(visible);
  return {
    posts: page,
    cursor: homeFeedCursorFrom(page) ?? homeFeedCursorFrom(scanned),
    hasMore: hasMore || filtered.length > visible.length,
  };
}

async function fetchPosts(input: {
  challengeId?: string | null;
  circleId?: string | null;
  userId?: string;
}): Promise<PostWithMeta[]> {
  if (input.circleId) {
    const rows = await queryPosts({ kind: 'circle', circleId: input.circleId });
    return hydrateCircles(
      await hydrateAuthors(
        await withSocial(
          rows.filter((post) => post.type !== 'circle_invite'),
          input.userId,
        ),
      ),
    );
  }

  if (input.challengeId) {
    const rows = await queryPosts({ kind: 'challenge', challengeId: input.challengeId });
    return hydrateAuthors(await withSocial(rows, input.userId));
  }

  if (!input.userId) {
    return [];
  }
  try {
    const page = await fetchHomeFeedPage({ userId: input.userId, cursor: null, seenIds: [] });
    return page.posts;
  } catch (error) {
    const message = rawFeedError(error);
    console.log('[blob:feed]', message);
    lastHomeFeedWarning = lastHomeFeedWarning ?? message;
    reportAppError({ route: 'feed/home', error, message });
    return [];
  }
}

export async function insertWorkoutCheckInPost(input: {
  userId: string;
  challengeId: string;
  challengeTitle?: string | null;
  mediaUrls?: string[];
}): Promise<Post | null> {
  const title = input.challengeTitle?.trim() || OFFICIAL_CHALLENGE_TITLE;
  const content = `Checked in today for the ${title} 💪`;
  const media_urls = input.mediaUrls ?? [];

  const schema = await resolvePostsSchema();
  const payload = postInsertPayload(schema, {
    author_id: input.userId,
    challenge_id: input.challengeId,
    content,
    media_urls,
    audience: DEFAULT_POST_AUDIENCE,
    audience_user_ids: [],
    source: 'checkin',
  });

  const created = await supabase.from('posts').insert(payload).select(schema.select).single();
  if (!created.error) {
    const post = created.data as unknown as Post;
    return post;
  }

  if (media_urls.length > 0) {
    const retry = await supabase.from('posts').insert(payload).select(schema.select).single();
    if (!retry.error) {
      const post = retry.data as unknown as Post;
      return post;
    }
    const missingMedia =
      retry.error.message.toLowerCase().includes('media_urls') ||
      retry.error.message.toLowerCase().includes('schema cache') ||
      retry.error.message.toLowerCase().includes('does not exist');
    if (!missingMedia) {
      throw new Error('Your check-in went through, but we couldn’t attach the photos to the post.');
    }
  }

  const withoutMedia = await supabase
    .from('posts')
    .insert(
      postInsertPayload(schema, {
        author_id: input.userId,
        challenge_id: input.challengeId,
        content,
        media_urls: [],
        audience: DEFAULT_POST_AUDIENCE,
        audience_user_ids: [],
        source: 'checkin',
      }),
    )
    .select(schema.select)
    .single();
  if (withoutMedia.error) {
    console.log('[blob:submit] auto-post failed', withoutMedia.error.message);
    return null;
  }
  const post = withoutMedia.data as unknown as Post;
  return post;
}

export function useFeed(challengeId?: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = challengeId ?? 'global';
  const home = !challengeId;
  const homeKey = feedListKey('global', user?.id);
  const hydratedSocial = useRef(new Set<string>());

  const homeQuery = useInfiniteQuery({
    queryKey: homeKey,
    enabled: home && Boolean(user?.id),
    staleTime: 30_000,
    retry: false,
    placeholderData: keepPreviousData,
    initialPageParam: null as HomePageParam | null,
    queryFn: async ({ pageParam }) => {
      try {
        return await fetchHomeFeedPage({
          userId: user!.id,
          cursor: pageParam?.cursor ?? null,
          seenIds: pageParam?.seenIds ?? [],
        });
      } catch (error) {
        const message = rawFeedError(error);
        console.log('[blob:feed]', message);
        reportAppError({ route: 'feed/home', error, message });
        lastHomeFeedWarning = lastHomeFeedWarning ?? message;
        throw error;
      }
    },
    getNextPageParam: (last, all) => {
      if (!last.hasMore) {
        return undefined;
      }
      return {
        cursor: last.cursor,
        seenIds: uniquePostsById(all.flatMap((page) => page.posts)).map((post) => post.id),
      };
    },
  });

  const challengeQuery = useQuery({
    queryKey: feedListKey(key, user?.id),
    enabled: !home,
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      return await fetchPosts({ challengeId, userId: user?.id });
    },
  });

  const homePosts = useMemo(
    () => uniquePostsById(homeQuery.data?.pages.flatMap((page) => page.posts) ?? []),
    [homeQuery.data],
  );

  useEffect(() => {
    if (home && homeQuery.isRefetching && !homeQuery.isFetchingNextPage) {
      hydratedSocial.current.clear();
    }
  }, [home, homeQuery.isFetchingNextPage, homeQuery.isRefetching]);

  useEffect(() => {
    if (!home || !user?.id || homePosts.length === 0) {
      return;
    }
    const pending = homePosts.filter(
      (post) => !Array.isArray(post.comments) && !hydratedSocial.current.has(post.id),
    );
    if (pending.length === 0) {
      return;
    }
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      void (async () => {
        try {
          const parentIds = [
            ...new Set(
              pending
                .filter((post) => isClipSharePost(post))
                .map((post) => post.parent_id ?? post.quoted_post_id)
                .filter((id): id is string => Boolean(id)),
            ),
          ];
          const [hydrated, parents] = await Promise.all([
            hydrateAuthors(await withSocial(pending, user.id)),
            parentIds.length > 0 ? fetchPostsByIds(parentIds, user.id) : Promise.resolve([] as PostWithMeta[]),
          ]);
          if (cancelled) {
            return;
          }
          const parentsById = new Map(parents.map((row) => [row.id, row]));
          const byId = new Map(
            hydrated.map((post) => {
              if (!isClipSharePost(post)) {
                return [post.id, post] as const;
              }
              const parentId = post.parent_id ?? post.quoted_post_id;
              return [post.id, { ...post, share_parent: parentId ? parentsById.get(parentId) ?? null : null }] as const;
            }),
          );
          for (const id of byId.keys()) {
            hydratedSocial.current.add(id);
          }
          queryClient.setQueryData<InfiniteData<HomeFeedPage, HomePageParam | null>>(homeKey, (current) =>
            mapInfiniteHomePages(current, (post) => byId.get(post.id) ?? post),
          );
        } catch (error) {
          console.log('[blob:feed] social hydrate skipped', rawFeedError(error));
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [home, homeKey, homePosts, queryClient, user?.id]);

  if (home) {
    return {
      ...homeQuery,
      data: homePosts,
      warning: lastHomeFeedWarning,
    };
  }

  return {
    ...challengeQuery,
    fetchNextPage: async () => challengeQuery,
    hasNextPage: false,
    isFetchingNextPage: false,
    warning: null,
  };
}

export function useCircleFeed(circleId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: feedListKey(circleId ? `circle:${circleId}` : 'circle', user?.id),
    enabled: Boolean(circleId),
    staleTime: 30_000,
    queryFn: () => fetchPosts({ circleId, userId: user?.id }),
  });
}

export function useAuthorFeed(authorId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['feed', 'author', authorId, user?.id],
    enabled: Boolean(authorId),
    queryFn: async (): Promise<PostWithMeta[]> => {
      const profileId = authorId!;
      const schema = await resolvePostsSchema();
      const authored = await queryPosts({ kind: 'authors', authorIds: [profileId] });
      let wall: PostWithMeta[] = [];
      if (schema.hasWall) {
        try {
          wall = await queryPosts({ kind: 'wall', hostId: profileId });
        } catch {
          wall = [];
        }
      }
      const rows = dedupePosts([authored, wall]);
      const [hiddenIds, friendIds, officialIds] = await Promise.all([
        user?.id ? fetchHiddenPostIds(user.id) : Promise.resolve([] as string[]),
        user?.id ? friendIdsForUser(user.id) : Promise.resolve([] as string[]),
        fetchOfficialAuthorIds(),
      ]);
      const hidden = new Set(hiddenIds);
      const friends = new Set(friendIds);
      const official = new Set(officialIds);
      const visible = rows.filter((post) =>
        viewerCanSeeProfilePost(post, {
          viewerId: user?.id,
          profileId,
          friendsWithAuthor: friends.has(post.author_id),
          officialAuthor: official.has(post.author_id),
          hidden,
        }),
      );
      return hydrateAuthors(await withSocial(visible, user?.id));
    },
  });
}

export async function fetchPostsByIds(ids: string[], viewerId?: string): Promise<PostWithMeta[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return [];
  }
  const schema = await resolvePostsSchema();
  const filtered = await supabase
    .from('posts')
    .select(schema.select)
    .in('id', unique)
    .is('deleted_at', null);
  const { data, error } =
    filtered.error && isMissingDeletedAt(filtered.error)
      ? await supabase.from('posts').select(schema.select).in('id', unique)
      : filtered;
  if (error || !data) {
    return [];
  }
  const rows = (data as unknown as PostWithMeta[]).filter((row) => !row.deleted_at);
  return hydrateCircles(await hydrateAuthors(await withSocial(rows, viewerId)));
}

export function usePostsByIds(ids: string[]) {
  const { user } = useAuth();
  const key = [...new Set(ids.filter(Boolean))].sort();
  return useQuery({
    queryKey: clipPostsQueryKey(key),
    enabled: key.length > 0,
    queryFn: () => fetchPostsByIds(key, user?.id),
  });
}

export function usePost(postId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['feed', 'post', postId, user?.id],
    enabled: Boolean(postId),
    queryFn: async (): Promise<PostWithMeta | null> => {
      const schema = await resolvePostsSchema();
      const filtered = await supabase
        .from('posts')
        .select(schema.select)
        .eq('id', postId!)
        .is('deleted_at', null)
        .maybeSingle();
      const { data, error } =
        filtered.error && isMissingDeletedAt(filtered.error)
          ? await supabase.from('posts').select(schema.select).eq('id', postId!).maybeSingle()
          : filtered;
      if (error || !data || (data as unknown as PostWithMeta).deleted_at) {
        return null;
      }
      const rows = await hydrateAuthors(
        await withSocial([withQuoteSnapshot(data as unknown as PostWithMeta)], user?.id),
      );
      return rows[0] ?? null;
    },
  });
}

function stubAuthor(authorId?: string | null): PublicProfile | undefined {
  const id = String(authorId ?? '').trim();
  if (!id) {
    return undefined;
  }
  return asPublicProfile({ id });
}

function asPublicProfile(
  profile: {
    id?: string | null;
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    is_official?: boolean | null;
  } | null,
): PublicProfile | undefined {
  const id = String(profile?.id ?? '').trim();
  if (!profile || !id) {
    return undefined;
  }
  return {
    id,
    username: profile.username?.trim() || 'blob',
    display_name: profile.display_name ?? null,
    avatar_url: profile.avatar_url ?? null,
    bio: null,
    skill_tags: [],
    primary_activities: [],
    show_fitness_stats_publicly: false,
    is_official: Boolean(profile.is_official),
    created_at: new Date().toISOString(),
    height_cm: null,
    current_weight: null,
    goal_weight: null,
    weight_unit: null,
    typical_weekly_workout_frequency: null,
  };
}

/** Optimistic check-in row so Live can render before the join lands. */
export function seedChallengeLivePost(
  queryClient: QueryClient,
  challengeId: string,
  userId: string | undefined,
  post: PostWithMeta,
) {
  const id = String(challengeId ?? '').trim();
  if (!id || !post?.id) {
    return;
  }
  queryClient.setQueryData(feedListKey(id, userId), (current) =>
    prependFeedCache(current ?? [], post),
  );
}

/** Seed Home / post cache with author_id + session profile before navigate. Never throw. */
export function seedPublishedPost(
  queryClient: QueryClient,
  userId: string | undefined,
  post: PostWithMeta,
) {
  if (!post?.id) {
    return;
  }
  const authorId = safeUserId(post.author, post.author_id, userId) ?? post.author_id;
  const author =
    post.author ??
    (authorId
      ? asPublicProfile({
          ...(post.author ?? {}),
          ...sessionAuthor(post.author, authorId),
          id: authorId,
        })
      : undefined);
  if (!safeUserId(author, authorId)) {
    logMissingPublishAuthor({ type: post.type, postId: post.id, hasAuthor: false });
  }
  const seeded: PostWithMeta = {
    ...post,
    author_id: authorId || post.author_id,
    author,
    comments: post.comments ?? [],
    reactions: post.reactions ?? [],
  };
  if (userId) {
    queryClient.setQueryData(['feed', 'post', seeded.id, userId], seeded);
  }
  queryClient.setQueryData(['feed', 'post', seeded.id], seeded);
  if (!isHomeExcludedClipType(seeded.type)) {
    queryClient.setQueryData(feedListKey('global', userId), (current) =>
      prependFeedCache(current ?? [], seeded),
    );
  }
}

export function useCreatePost(challengeId?: string | null) {
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const queryClient = useQueryClient();
  const key = challengeId ?? 'global';

  return useMutation({
    mutationFn: async (input: ComposeInput) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const content = input.content.trim();
      const media_urls = input.mediaUrls?.filter(Boolean) ?? [];
      const audience = input.audience ?? DEFAULT_POST_AUDIENCE;
      const audience_user_ids = audience === 'specific' ? (input.audienceUserIds ?? []) : [];
      const quoted_post_id = input.quotedPostId ?? null;
      const attachedId = input.challengeId ?? challengeId ?? null;
      const circleId = input.circleId ?? null;
      if (attachedId && circleId && input.type !== 'circle_challenge_share') {
        throw new Error('A post can’t belong to a challenge and a Circle.');
      }
      if (!content && media_urls.length === 0 && !quoted_post_id && !attachedId && !circleId) {
        throw new Error('Write something, or attach a photo first.');
      }
      if (audience === 'specific' && audience_user_ids.length === 0) {
        throw new Error('Pick at least one person.');
      }
      const schema = await resolvePostsSchema();
      if (quoted_post_id && !schema.hasQuote) {
        throw new Error('Repost isn’t wired on the server yet. Apply the latest migration.');
      }
      const payload = postInsertPayload(schema, {
        author_id: user.id,
        challenge_id: attachedId,
        circle_id: circleId,
        content: content || null,
        media_urls,
        audience,
        audience_user_ids,
        quoted_post_id,
        quote_snapshot: quoted_post_id ? (input.quoteSnapshot ?? null) : null,
        wall_host_id: input.wallHostId ?? null,
        source: input.source ?? 'feed',
        type: input.type ?? 'feed',
        duration_ms: input.durationMs ?? null,
        parent_id: input.parentId ?? null,
      });
      const created = await supabase.from('posts').insert(payload).select(schema.select).single();
      if (created.error) {
        throw new Error(getErrorMessage(created.error));
      }
      const createdPost = created.data as unknown as Post;
      const entities = (input.mentionedEntities ?? []).filter((row) => row.id);
      const mentionIds = [
        ...new Set(
          (entities.length > 0
            ? entities.filter((row) => row.kind === 'user').map((row) => row.id)
            : (input.mentionedUserIds ?? [])
          ).filter((id) => id && id !== user.id),
        ),
      ];
      const challengeMentions = [...new Set(entities.filter((row) => row.kind === 'challenge').map((row) => row.id))];
      const circleMentions = [...new Set(entities.filter((row) => row.kind === 'circle').map((row) => row.id))];
      if ((mentionIds.length > 0 || challengeMentions.length > 0 || circleMentions.length > 0) && createdPost.id) {
        try {
          await insertMentionRowsOnce(() =>
            supabase.from('post_mentions').insert([
              ...mentionIds.map((mentioned_user_id) => ({
                post_id: createdPost.id,
                mentioned_user_id,
                author_id: user.id,
              })),
              ...challengeMentions.map((challenge_id) => ({
                post_id: createdPost.id,
                challenge_id,
                author_id: user.id,
              })),
              ...circleMentions.map((circle_id) => ({
                post_id: createdPost.id,
                circle_id,
                author_id: user.id,
              })),
            ]),
          );
        } catch (error) {
          await supabase.from('posts').delete().eq('id', createdPost.id).eq('author_id', user.id);
          throw error;
        }
      }
      return createdPost;
    },
    onMutate: async (input) => {
      const listKey = feedListKey(input.circleId ? `circle:${input.circleId}` : key, user?.id);
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData(listKey);
      const optimisticId = `optimistic-${Date.now()}`;
      if (user) {
        const authorId = safeUserId(profile, user.id) ?? user.id;
        const optimistic: PostWithMeta = {
          id: optimisticId,
          author_id: authorId,
          challenge_id: input.challengeId ?? challengeId ?? null,
          circle_id: input.circleId ?? null,
          content: input.content.trim() || null,
          media_urls: input.mediaUrls ?? [],
          audience: input.audience ?? DEFAULT_POST_AUDIENCE,
          audience_user_ids: input.audience === 'specific' ? (input.audienceUserIds ?? []) : [],
          quoted_post_id: input.quotedPostId ?? null,
          quote_snapshot: input.quoteSnapshot ?? null,
          wall_host_id: input.wallHostId ?? null,
          wall_host: input.wallHostId ? { id: input.wallHostId } : null,
          source: input.source ?? 'feed',
          type: input.type ?? 'feed',
          duration_ms: input.durationMs ?? null,
          parent_id: input.parentId ?? null,
          mentions: (input.mentionedUserIds ?? []).map((userId) => ({
            userId,
            username: '',
            available: true,
          })),
          created_at: new Date().toISOString(),
          author: asPublicProfile({ ...(profile ?? {}), id: authorId }),
          comments: [],
          reactions: [],
        };
        if (!isHomeExcludedClipType(optimistic.type)) {
          queryClient.setQueryData(listKey, prependFeedCache(previous, optimistic));
        }
      }
      return { previous, optimisticId, listKey };
    },
    onSuccess: (createdPost, input, context) => {
      if (!context || !user) {
        return;
      }
      try {
        const authorId = safeUserId(profile, user.id, createdPost?.author, createdPost?.author_id) ?? user.id;
        const author =
          asPublicProfile({ ...(profile ?? {}), id: authorId }) ??
          createdPost?.author ??
          stubAuthor(authorId);
        const posted = asFeedPost(createdPost, author, input.mentionedUserIds);
        seedPublishedPost(queryClient, user.id, posted);
        if (isHomeExcludedClipType(posted.type ?? input.type)) {
          return;
        }
        queryClient.setQueryData(context.listKey, (current) => {
          let replaced = false;
          const mapped = mapFeedCache(current, (posts) => {
            const defined = posts.filter((post): post is PostWithMeta => Boolean(post?.id));
            const next = defined.map((post) => {
              if (post.id !== context.optimisticId) {
                return post;
              }
              replaced = true;
              return { ...posted, comments: post.comments ?? [], reactions: post.reactions ?? [] };
            });
            return replaced ? next : [posted, ...defined.filter((post) => post.id !== posted.id)];
          });
          return mapped ?? prependFeedCache(current, posted);
        });
      } catch {
        logMissingPublishAuthor({
          type: input.type ?? createdPost?.type,
          postId: createdPost?.id,
          hasAuthor: Boolean(createdPost?.author),
        });
      }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.listKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['feed-events'] });
      void reportBadgeActivity();
    },
  });
}

export function useUpdatePostAudience() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      postId: string;
      audience: PostAudience;
      audienceUserIds?: string[];
    }) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const audience = input.audience;
      const audience_user_ids = audience === 'specific' ? (input.audienceUserIds ?? []) : [];
      if (audience === 'specific' && audience_user_ids.length === 0) {
        throw new Error('Pick at least one person.');
      }
      const { error } = await supabase
        .from('posts')
        .update({ audience, audience_user_ids })
        .eq('id', input.postId)
        .eq('author_id', user.id);
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      return input;
    },
    onSuccess: (input) => {
      queryClient.setQueriesData({ queryKey: ['feed'] }, (current) =>
        mapFeedCache(current, (posts) =>
          posts.map((post) =>
            post.id === input.postId
              ? {
                  ...post,
                  audience: input.audience,
                  audience_user_ids: input.audience === 'specific' ? (input.audienceUserIds ?? []) : [],
                }
              : post,
          ),
        ),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

type ToggleReactionInput = {
  post: PostWithMeta;
  type: ReactionType;
  commentId?: string | null;
};

type ToggleReactionResult =
  | { action: 'removed' }
  | { action: 'added'; reaction: Reaction }
  | { action: 'updated'; reaction: Reaction };

export function useToggleReaction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inflight = useRef(new Set<string>());
  const mutation = useMutation({
    mutationFn: async (input: ToggleReactionInput): Promise<ToggleReactionResult> => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      let existing = findUserReaction(input.post, user.id, input.commentId);
      if (input.commentId && (!existing || !isPersistedId(existing.id))) {
        const fetched = await supabase
          .from('reactions')
          .select(REACTION_COLUMNS)
          .eq('user_id', user.id)
          .eq('comment_id', input.commentId)
          .maybeSingle();
        if (fetched.data) {
          existing = fetched.data as Reaction;
        }
      }

      if (existing && isPersistedId(existing.id) && existing.reaction_type === input.type) {
        const { error } = await supabase.from('reactions').delete().eq('id', existing.id);
        if (error) {
          throw new Error(getErrorMessage(error));
        }
        return { action: 'removed' };
      }

      if (existing && isPersistedId(existing.id)) {
        const updated = await supabase
          .from('reactions')
          .update({ reaction_type: input.type })
          .eq('id', existing.id)
          .select(REACTION_COLUMNS)
          .single();
        if (updated.error) {
          throw new Error(getErrorMessage(updated.error));
        }
        return { action: 'updated', reaction: updated.data as Reaction };
      }

      const inserted = input.commentId
        ? await supabase
            .from('reactions')
            .insert({
              user_id: user.id,
              comment_id: input.commentId,
              reaction_type: input.type,
            })
            .select(REACTION_COLUMNS)
            .single()
        : await supabase
            .from('reactions')
            .insert({
              user_id: user.id,
              post_id: input.post.id,
              reaction_type: input.type,
            })
            .select(REACTION_COLUMNS)
            .single();
      if (inserted.error && isReactionConflict(inserted.error) && input.commentId) {
        const again = await supabase
          .from('reactions')
          .select(REACTION_COLUMNS)
          .eq('user_id', user.id)
          .eq('comment_id', input.commentId)
          .maybeSingle();
        if (again.data) {
          const row = again.data as Reaction;
          if (row.reaction_type === input.type) {
            return { action: 'added', reaction: row };
          }
          const updated = await supabase
            .from('reactions')
            .update({ reaction_type: input.type })
            .eq('id', row.id)
            .select(REACTION_COLUMNS)
            .single();
          if (!updated.error && updated.data) {
            return { action: 'updated', reaction: updated.data as Reaction };
          }
        }
        return { action: 'added', reaction: (again.data as Reaction) ?? existing! };
      }
      if (inserted.error) {
        const text = inserted.error.message.toLowerCase();
        if (input.commentId && (text.includes('comment_id') || text.includes('null value'))) {
          throw new Error('Comment reactions need a database update. Run the latest SQL in supabase/migrations.');
        }
        throw new Error(getErrorMessage(inserted.error));
      }
      return { action: 'added', reaction: inserted.data as Reaction };
    },
    onMutate: async (input) => {
      if (!user) {
        return;
      }
      await queryClient.cancelQueries({ queryKey: ['feed'] });
      const previous = queryClient.getQueriesData({ queryKey: ['feed'] });
      patchFeedPosts(queryClient, input.post.id, (post) =>
        applyOptimisticReaction(post, user.id, input.type, input.commentId),
      );
      return { previous };
    },
    onSuccess: (result, input) => {
      if (!user || result.action === 'removed') {
        return;
      }
      const optimisticId = optimisticReactionId(input.type, input.commentId ?? input.post.id, user.id);
      patchFeedPosts(queryClient, input.post.id, (post) =>
        replaceReactionId(post, optimisticId, result.reaction, input.commentId, user.id),
      );
    },
    onError: (error, _variables, context) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
      if (!isReactionConflict(error)) {
        Alert.alert('Couldn’t save reaction');
      }
    },
  });

  return {
    ...mutation,
    mutate(input: ToggleReactionInput) {
      const guard = `${input.post.id}:${input.commentId ?? ''}`;
      if (inflight.current.has(guard)) {
        return;
      }
      inflight.current.add(guard);
      mutation.mutate(input, {
        onSettled: () => {
          inflight.current.delete(guard);
        },
      });
    },
  };
}

function optimisticReactionId(type: ReactionType, targetId: string, userId: string) {
  return `optimistic-${type}-${targetId}-${userId}`;
}

function isInfiniteHomeData(value: unknown): value is InfiniteData<HomeFeedPage, HomePageParam | null> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray((value as InfiniteData<HomeFeedPage>).pages) &&
      (value as InfiniteData<HomeFeedPage>).pages.every(
        (page) => page && Array.isArray((page as HomeFeedPage).posts),
      ),
  );
}

function mapInfiniteHomePages(
  current: InfiniteData<HomeFeedPage, HomePageParam | null> | undefined,
  mapPost: (post: PostWithMeta) => PostWithMeta,
): InfiniteData<HomeFeedPage, HomePageParam | null> | undefined {
  if (!current) {
    return current;
  }
  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      posts: page.posts.map(mapPost),
    })),
  };
}

function mapFeedCache(current: unknown, mapPosts: (posts: PostWithMeta[]) => PostWithMeta[]): unknown {
  if (!current) {
    return current;
  }
  if (Array.isArray(current)) {
    return mapPosts(current as PostWithMeta[]);
  }
  if (isInfiniteHomeData(current)) {
    return {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        posts: mapPosts(page.posts),
      })),
    };
  }
  if (typeof current === 'object' && current && (current as PostWithMeta).id) {
    const [next] = mapPosts([current as PostWithMeta]);
    return next ?? current;
  }
  return current;
}

function prependFeedCache(current: unknown, post: PostWithMeta): unknown {
  if (!post?.id) {
    return current;
  }
  if (!current) {
    return [post];
  }
  if (Array.isArray(current)) {
    return [post, ...(current as PostWithMeta[]).filter((row) => row?.id && row.id !== post.id)];
  }
  if (isInfiniteHomeData(current)) {
    const first = current.pages[0] ?? { posts: [], cursor: null, hasMore: true };
    return {
      ...current,
      pages: [
        {
          ...first,
          posts: [post, ...first.posts.filter((row) => row?.id && row.id !== post.id)],
        },
        ...current.pages.slice(1).map((page) => ({
          ...page,
          posts: page.posts.filter((row) => row?.id && row.id !== post.id),
        })),
      ],
    };
  }
  return current;
}

export function isHomeSocialFeedKey(queryKey: readonly unknown[]): boolean {
  return (
    queryKey[0] === 'feed' &&
    (queryKey[1] === 'global' || queryKey[1] === 'author' || queryKey[1] === 'post')
  );
}

export function removePostFromHomeFeeds(queryClient: QueryClient, postId: string) {
  queryClient.setQueriesData(
    { predicate: (query) => isHomeSocialFeedKey(query.queryKey) },
    (current) =>
      mapFeedCache(current, (posts) => posts.filter((post) => !post || post.id !== postId)),
  );
}

export function patchFeedPosts(
  queryClient: QueryClient,
  postId: string,
  updater: (post: PostWithMeta) => PostWithMeta,
) {
  queryClient.setQueriesData({ queryKey: ['feed'] }, (current) =>
    mapFeedCache(current, (posts) => {
      let changed = false;
      const next = posts.map((post) => {
        if (!post || post.id !== postId) {
          return post;
        }
        changed = true;
        return updater(post);
      });
      return changed ? next : posts;
    }),
  );
}

function findUserReaction(
  post: PostWithMeta,
  userId: string,
  commentId?: string | null,
): Reaction | undefined {
  const pool = commentId
    ? post.comments?.find((comment) => comment.id === commentId)?.reactions
    : post.reactions;
  return pool?.find((reaction) => reaction.user_id === userId);
}

function applyOptimisticReaction(
  post: PostWithMeta,
  userId: string,
  type: ReactionType,
  commentId?: string | null,
): PostWithMeta {
  if (!commentId) {
    return { ...post, reactions: toggleReactionList(post.reactions ?? [], userId, type, post.id, null) };
  }
  return {
    ...post,
    comments: (post.comments ?? []).map((comment) =>
      comment.id === commentId
        ? {
            ...comment,
            reactions: toggleReactionList(comment.reactions ?? [], userId, type, null, commentId),
          }
        : comment,
    ),
  };
}

function toggleReactionList(
  current: Reaction[],
  userId: string,
  type: ReactionType,
  postId: string | null,
  commentId: string | null,
): Reaction[] {
  const existing = current.find((reaction) => reaction.user_id === userId);
  if (existing && existing.reaction_type === type) {
    return current.filter((reaction) => reaction.id !== existing.id);
  }
  if (existing) {
    return current.map((reaction) =>
      reaction.user_id === userId ? { ...reaction, reaction_type: type } : reaction,
    );
  }
  return [
    ...current,
    {
      id: optimisticReactionId(type, commentId ?? postId ?? userId, userId),
      user_id: userId,
      post_id: postId,
      comment_id: commentId,
      reaction_type: type,
      created_at: new Date().toISOString(),
    },
  ];
}

function replaceReactionId(
  post: PostWithMeta,
  optimisticId: string,
  reaction: Reaction,
  commentId?: string | null,
  userId?: string,
): PostWithMeta {
  function swap(list: Reaction[]) {
    const byOptimistic = list.some((row) => row.id === optimisticId);
    if (byOptimistic) {
      return list.map((row) => (row.id === optimisticId ? reaction : row));
    }
    if (userId) {
      return list.map((row) => (row.user_id === userId ? reaction : row));
    }
    return list;
  }
  if (!commentId) {
    return { ...post, reactions: swap(post.reactions ?? []) };
  }
  return {
    ...post,
    comments: (post.comments ?? []).map((comment) =>
      comment.id === commentId ? { ...comment, reactions: swap(comment.reactions ?? []) } : comment,
    ),
  };
}

function isPersistedId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

async function fetchCommentMentions(commentIds: string[]) {
  if (commentIds.length === 0) {
    return [] as { comment_id: string; mentioned_user_id: string }[];
  }
  const run = () =>
    supabase.from('comment_mentions').select('comment_id, mentioned_user_id').in('comment_id', commentIds);
  let result = await run();
  if (result.error) {
    result = await run();
  }
  if (result.error) {
    if (!isMissingRelationError(result.error) && !isMentionAccessDenied(result.error)) {
      console.log('[blob:feed] comment_mentions skipped', result.error.message);
    }
    return [];
  }
  return (result.data ?? []) as { comment_id: string; mentioned_user_id: string }[];
}

async function insertCommentMentions(
  commentId: string,
  authorId: string,
  mentionedUserIds?: string[],
) {
  const ids = [...new Set((mentionedUserIds ?? []).filter((id) => id && id !== authorId))];
  if (ids.length === 0) {
    return;
  }
  try {
    await insertMentionRowsOnce(() =>
      supabase.from('comment_mentions').insert(
        ids.map((mentioned_user_id) => ({
          comment_id: commentId,
          mentioned_user_id,
          author_id: authorId,
        })),
      ),
    );
  } catch (error) {
    if (!isMentionAccessDenied(error) && !isMissingRelationError(error)) {
      console.log('[blob:feed] comment_mentions insert skipped', getErrorMessage(error));
    }
  }
}

export function useCreateComment(challengeId?: string | null) {
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      postId: string;
      content: string;
      parentId?: string | null;
      mentionedUserIds?: string[];
    }) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }

      const base = {
        post_id: input.postId,
        author_id: user.id,
        content: input.content,
      };

      if (input.parentId) {
        if (!isPersistedId(input.parentId)) {
          throw new Error('That reply is still posting. Wait a beat and try again.');
        }
        const nested = await supabase
          .from('comments')
          .insert({ ...base, parent_id: input.parentId })
          .select()
          .single();
        if (nested.error) {
          throw new Error(getErrorMessage(nested.error));
        }
        await insertCommentMentions(nested.data.id, user.id, input.mentionedUserIds);
        return nested.data;
      }

      const { data, error } = await supabase.from('comments').insert(base).select().single();
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      await insertCommentMentions(data.id, user.id, input.mentionedUserIds);
      return data;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['feed'] });
      const previous = queryClient.getQueriesData({ queryKey: ['feed'] });
      if (user) {
        const optimistic: CommentWithAuthor = {
          id: `optimistic-comment-${Date.now()}`,
          post_id: input.postId,
          author_id: user.id,
          parent_id: input.parentId ?? null,
          content: input.content,
          created_at: new Date().toISOString(),
          author: asPublicProfile({ ...(profile ?? {}), id: profile?.id ?? user.id }),
          reactions: [],
        };
        patchFeedPosts(queryClient, input.postId, (post) => ({
          ...post,
          comments: [...(post.comments ?? []), optimistic],
        }));
      }
      return { previous };
    },
    onSuccess: (data) => {
      patchFeedPosts(queryClient, data.post_id, (post) => {
        let replaced = false;
        const comments = (post.comments ?? []).map((comment) => {
          if (
            replaced ||
            !comment.id.startsWith('optimistic-comment-') ||
            comment.content !== data.content ||
            (comment.parent_id ?? null) !== (data.parent_id ?? null)
          ) {
            return comment;
          }
          replaced = true;
          return {
            ...comment,
            id: data.id,
            parent_id: data.parent_id,
            created_at: data.created_at,
          };
        });
        return { ...post, comments };
      });
    },
    onError: (_error, _input, context) => {
      for (const [queryKey, data] of context?.previous ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
  });
}

export function useDeletePost(_challengeId?: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const { error } = await supabase.rpc('soft_delete_post', { p_post_id: postId });
      if (error) {
        throw new Error(getErrorMessage(error) || 'Couldn’t delete.');
      }
    },
    onMutate: async (postId) => {
      await queryClient.cancelQueries({ queryKey: ['feed'] });
      const previous = queryClient.getQueriesData({ queryKey: ['feed'] });
      queryClient.setQueriesData({ queryKey: ['feed'] }, (current) => {
        if (isInfiniteHomeData(current) || Array.isArray(current)) {
          return mapFeedCache(current, (posts) => posts.filter((post) => !post || post.id !== postId));
        }
        if (typeof current === 'object' && current && (current as PostWithMeta).id === postId) {
          return { ...(current as PostWithMeta), deleted_at: new Date().toISOString() };
        }
        return current;
      });
      return { previous };
    },
    onError: (_error, _postId, context) => {
      for (const [queryKey, data] of context?.previous ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
  });
}
