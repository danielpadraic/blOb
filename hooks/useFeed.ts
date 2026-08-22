import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { Alert } from 'react-native';

import { OFFICIAL_CHALLENGE_TITLE } from '@/lib/constants';
import { asQuoteSnapshot } from '@/lib/quotePost';
import { asPostAudience, DEFAULT_POST_AUDIENCE, type PostAudience } from '@/lib/postAudience';
import { resolvePostsSchema, type PostsSchema } from '@/lib/postsSelect';
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
import { getErrorMessage, isMissingRelationError } from '@/utils/errors';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';

const REACTION_COLUMNS = 'id, user_id, post_id, comment_id, reaction_type, created_at';
const REACTION_COLUMNS_LEGACY = 'id, user_id, post_id, reaction_type, created_at';

type FeedScope =
  | { kind: 'challenge'; challengeId: string }
  | { kind: 'global' }
  | { kind: 'ids'; challengeIds: string[] }
  | { kind: 'authors'; authorIds: string[] }
  | { kind: 'wall'; hostId: string };

async function queryPosts(scope: FeedScope): Promise<PostWithMeta[]> {
  if (scope.kind === 'ids' && scope.challengeIds.length === 0) {
    return [];
  }
  if (scope.kind === 'authors' && scope.authorIds.length === 0) {
    return [];
  }
  if (scope.kind === 'wall' && !scope.hostId) {
    return [];
  }

  const schema = await resolvePostsSchema();
  const result = await fetchPostRows(schema.select, scope, true);
  const { data, error } =
    result.error && isMissingDeletedAt(result.error)
      ? await fetchPostRows(schema.select, scope, false)
      : result;

  if (error) {
    throw new Error(getErrorMessage(error));
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

function fetchPostRows(select: string, scope: FeedScope, hideDeleted: boolean) {
  let query = supabase.from('posts').select(select).order('created_at', { ascending: false }).limit(50);
  if (hideDeleted) {
    query = query.is('deleted_at', null);
  }
  // Check-in posts stay on Home when they match joined challenges / friends.
  // Challenge detail still scopes by challenge_id + source.
  const hasSource = /(^|,\s*)source(,|$)/.test(select);
  if (scope.kind === 'challenge') {
    query = query.eq('challenge_id', scope.challengeId);
    if (hasSource) {
      query = query.in('source', ['challenge', 'checkin']);
    }
    return query;
  }
  if (scope.kind === 'ids') {
    return query.in('challenge_id', scope.challengeIds);
  }
  if (scope.kind === 'authors') {
    return query.in('author_id', scope.authorIds);
  }
  if (scope.kind === 'wall') {
    return query.or(
      `and(author_id.eq.${scope.hostId},wall_host_id.is.null),and(wall_host_id.eq.${scope.hostId},wall_removed_at.is.null)`,
    );
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
    content: string | null;
    media_urls: string[];
    audience?: string;
    audience_user_ids?: string[];
    quoted_post_id?: string | null;
    quote_snapshot?: PostWithMeta['quote_snapshot'];
    wall_host_id?: string | null;
    source?: Post['source'];
  },
) {
  const payload: Record<string, unknown> = {
    author_id: base.author_id,
    challenge_id: base.challenge_id ?? null,
    content: base.content,
    media_urls: base.media_urls,
  };
  if (schema.hasAudience) {
    payload.audience = base.audience ?? DEFAULT_POST_AUDIENCE;
    payload.audience_user_ids = base.audience_user_ids ?? [];
  }
  if (schema.hasQuote && base.quoted_post_id) {
    payload.quoted_post_id = base.quoted_post_id;
    payload.quote_snapshot = base.quote_snapshot ?? null;
  }
  if (schema.hasWall && base.wall_host_id) {
    payload.wall_host_id = base.wall_host_id;
  }
  if (schema.hasSource) {
    payload.source = base.source ?? 'feed';
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
  const postIds = posts.map((post) => post.id);
  const commentIds = posts.flatMap((post) => (post.comments ?? []).map((comment) => comment.id));
  const [postMentionRows, commentMentionRows] = await Promise.all([
    supabase.from('post_mentions').select('post_id, mentioned_user_id').in('post_id', postIds),
    commentIds.length > 0
      ? supabase.from('comment_mentions').select('comment_id, mentioned_user_id').in('comment_id', commentIds)
      : Promise.resolve({ data: [] as { comment_id: string; mentioned_user_id: string }[], error: null }),
  ]);
  if (postMentionRows.error && !isMissingRelationError(postMentionRows.error)) {
    console.log('[blob:feed] post_mentions skipped', postMentionRows.error.message);
  }
  const postMentions = postMentionRows.error ? [] : (postMentionRows.data ?? []);
  const commentMentions = commentMentionRows.error ? [] : (commentMentionRows.data ?? []);
  const mentionedIds = [
    ...postMentions.map((row) => row.mentioned_user_id),
    ...commentMentions.map((row) => row.mentioned_user_id),
    ...posts.map((post) => post.wall_host_id).filter((id): id is string => Boolean(id)),
  ];
  const unique = [...new Set(mentionedIds)];
  const [profiles, blocked] = await Promise.all([
    unique.length
      ? supabase.from('profiles').select('id, username, display_name, avatar_url, is_official').in('id', unique)
      : Promise.resolve({ data: [] as { id: string; username: string; display_name: string | null }[], error: null }),
    viewerId && unique.length
      ? supabase
          .from('friendships')
          .select('user_a_id, user_b_id')
          .eq('status', 'blocked')
          .or(`user_a_id.eq.${viewerId},user_b_id.eq.${viewerId}`)
      : Promise.resolve({ data: [] as { user_a_id: string; user_b_id: string }[], error: null }),
  ]);
  const byId = new Map((profiles.data ?? []).map((row) => [row.id, row]));
  const blockedIds = new Set<string>();
  for (const row of blocked.data ?? []) {
    blockedIds.add(row.user_a_id === viewerId ? row.user_b_id : row.user_a_id);
  }

  const mentionsByPost = new Map<string, PostMention[]>();
  for (const row of postMentions) {
    const profile = byId.get(row.mentioned_user_id);
    const list = mentionsByPost.get(row.post_id) ?? [];
    list.push({
      userId: row.mentioned_user_id,
      username: profile?.username ?? 'blob',
      displayName: profile?.display_name,
      available: Boolean(profile?.username) && !blockedIds.has(row.mentioned_user_id),
    });
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
    if (!post.author) {
      ids.add(post.author_id);
    }
    for (const comment of post.comments ?? []) {
      if (!comment.author) {
        ids.add(comment.author_id);
      }
    }
  }
  if (ids.size === 0) {
    return posts;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, is_official')
    .in('id', [...ids]);
  if (error || !data) {
    return posts;
  }

  const byId = new Map(data.map((row) => [row.id, asPublicProfile(row)]));
  return posts.map((post) => ({
    ...post,
    author: post.author ?? byId.get(post.author_id),
    comments: (post.comments ?? []).map((comment) => ({
      ...comment,
      author: comment.author ?? byId.get(comment.author_id),
    })),
  }));
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

/** Same visibility as Home for one author: public, friends-if-accepted, official exception. */
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
  if (post.wall_removed_at) {
    return false;
  }
  if (post.wall_host_id && post.wall_host_id !== input.profileId) {
    return false;
  }
  if (input.viewerId && post.author_id === input.viewerId) {
    return true;
  }
  if (input.officialAuthor && post.author_id === input.profileId) {
    return true;
  }
  if (input.friendsWithAuthor && post.author_id === input.profileId) {
    return true;
  }
  if (post.wall_host_id === input.profileId) {
    return true;
  }
  const audience = asPostAudience(post.audience);
  if (audience === 'public') {
    return true;
  }
  if (audience === 'friends' && input.friendsWithAuthor) {
    return true;
  }
  if (
    audience === 'specific' &&
    input.viewerId &&
    (post.audience_user_ids ?? []).includes(input.viewerId)
  ) {
    return true;
  }
  return false;
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

async function fetchFriendIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('user_a_id, user_b_id')
    .eq('status', 'accepted')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);
  if (error) {
    console.log('[blob:feed] friends lookup failed', error.message);
    return [];
  }
  return (data ?? []).map((row) => (row.user_a_id === userId ? row.user_b_id : row.user_a_id));
}

async function fetchHostedChallengeIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('challenges').select('id').eq('created_by', userId);
  if (error) {
    console.log('[blob:feed] hosted challenges lookup failed', error.message);
    return [];
  }
  return (data ?? []).map((row) => row.id);
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

async function fetchPosts(input: {
  challengeId?: string | null;
  userId?: string;
}): Promise<PostWithMeta[]> {
  if (input.challengeId) {
    const rows = await queryPosts({ kind: 'challenge', challengeId: input.challengeId });
    return hydrateAuthors(await withSocial(rows, input.userId));
  }

  if (!input.userId) {
    return [];
  }

  const [joinedIds, hostedIds, friendIds, officialIds, recommendedIds, hiddenIds, mutedIds] =
    await Promise.all([
      fetchJoinedChallengeIds(input.userId),
      fetchHostedChallengeIds(input.userId),
      fetchFriendIds(input.userId),
      fetchOfficialAuthorIds(),
      fetchRecommendedCreatorIds(input.userId),
      fetchHiddenPostIds(input.userId),
      fetchMutedUserIds(input.userId),
    ]);
  const challengeIds = [...new Set([...joinedIds, ...hostedIds])];
  const challengeIdSet = new Set(challengeIds);
  const official = new Set(officialIds);
  const friends = new Set(friendIds);
  const recommended = new Set(recommendedIds);
  const authorIds = [...new Set([input.userId, ...friendIds, ...officialIds, ...recommendedIds])];

  const [challengePosts, people] = await Promise.all([
    queryPosts({ kind: 'ids', challengeIds }),
    queryPosts({ kind: 'authors', authorIds }),
  ]);

  const hidden = new Set(hiddenIds);
  const muted = new Set(mutedIds);
  const userId = input.userId;

  return hydrateAuthors(
    await withSocial(
      dedupePosts([people, challengePosts])
        .filter((post) => {
          if (hidden.has(post.id)) {
            return false;
          }
          if (post.author_id !== userId && muted.has(post.author_id) && !official.has(post.author_id)) {
            return false;
          }
          if (official.has(post.author_id) || post.author_id === userId || friends.has(post.author_id)) {
            return true;
          }
          if (post.challenge_id && challengeIdSet.has(post.challenge_id)) {
            return true;
          }
          if (recommended.has(post.author_id)) {
            return asPostAudience(post.audience) === 'public';
          }
          return false;
        })
        .slice(0, 50),
      userId,
    ),
  );
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
    return created.data as unknown as Post;
  }

  if (media_urls.length > 0) {
    const retry = await supabase.from('posts').insert(payload).select(schema.select).single();
    if (!retry.error) {
      return retry.data as unknown as Post;
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
  return withoutMedia.data as unknown as Post;
}

export function useFeed(challengeId?: string | null) {
  const { user } = useAuth();
  const key = challengeId ?? 'global';

  return useQuery({
    queryKey: ['feed', key, user?.id],
    queryFn: () => fetchPosts({ challengeId, userId: user?.id }),
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
        user?.id ? fetchFriendIds(user.id) : Promise.resolve([] as string[]),
        fetchOfficialAuthorIds(),
      ]);
      const hidden = new Set(hiddenIds);
      const friends = new Set(friendIds);
      const official = new Set(officialIds);
      const visible = rows.filter((post) =>
        viewerCanSeeProfilePost(post, {
          viewerId: user?.id,
          profileId,
          friendsWithAuthor: friends.has(profileId),
          officialAuthor: official.has(profileId),
          hidden,
        }),
      );
      return hydrateAuthors(await withSocial(visible, user?.id));
    },
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

function asPublicProfile(
  profile: {
    id: string;
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    is_official?: boolean | null;
  } | null,
): PublicProfile | undefined {
  if (!profile) {
    return undefined;
  }
  return {
    id: profile.id,
    username: profile.username ?? 'blob',
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
      if (!content && media_urls.length === 0 && !quoted_post_id && !attachedId) {
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
        content: content || null,
        media_urls,
        audience,
        audience_user_ids,
        quoted_post_id,
        quote_snapshot: quoted_post_id ? (input.quoteSnapshot ?? null) : null,
        wall_host_id: input.wallHostId ?? null,
        source: input.source ?? 'feed',
      });
      const created = await supabase.from('posts').insert(payload).select(schema.select).single();
      if (created.error) {
        throw new Error(getErrorMessage(created.error));
      }
      const createdPost = created.data as unknown as Post;
      const mentionIds = [...new Set((input.mentionedUserIds ?? []).filter((id) => id && id !== user.id))];
      if (mentionIds.length > 0 && createdPost.id) {
        const mentions = await supabase.from('post_mentions').insert(
          mentionIds.map((mentioned_user_id) => ({
            post_id: createdPost.id,
            mentioned_user_id,
            author_id: user.id,
          })),
        );
        if (mentions.error && !isMissingRelationError(mentions.error)) {
          console.log('[blob:feed] post_mentions insert failed', mentions.error.message);
        }
      }
      return createdPost;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['feed', key] });
      const previous = queryClient.getQueryData<PostWithMeta[]>(['feed', key]);
      if (user) {
        const optimistic: PostWithMeta = {
          id: `optimistic-${Date.now()}`,
          author_id: user.id,
          challenge_id: input.challengeId ?? challengeId ?? null,
          content: input.content.trim() || null,
          media_urls: input.mediaUrls ?? [],
          audience: input.audience ?? DEFAULT_POST_AUDIENCE,
          audience_user_ids: input.audience === 'specific' ? (input.audienceUserIds ?? []) : [],
          quoted_post_id: input.quotedPostId ?? null,
          quote_snapshot: input.quoteSnapshot ?? null,
          wall_host_id: input.wallHostId ?? null,
          source: input.source ?? 'feed',
          mentions: (input.mentionedUserIds ?? []).map((userId) => ({
            userId,
            username: '',
            available: true,
          })),
          created_at: new Date().toISOString(),
          author: asPublicProfile(profile ?? { id: user.id }),
          comments: [],
          reactions: [],
        };
        queryClient.setQueryData<PostWithMeta[]>(['feed', key], [
          optimistic,
          ...(previous ?? []),
        ]);
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['feed', key], context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['feed-events'] });
      void queryClient.invalidateQueries({ queryKey: ['feed', 'author'] });
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
      queryClient.setQueriesData<PostWithMeta[]>({ queryKey: ['feed'] }, (current) =>
        current?.map((post) =>
          post.id === input.postId
            ? {
                ...post,
                audience: input.audience,
                audience_user_ids: input.audience === 'specific' ? (input.audienceUserIds ?? []) : [],
              }
            : post,
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
      const existing = findUserReaction(input.post, user.id, input.commentId);

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
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
      Alert.alert('Couldn’t save reaction');
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

function patchFeedPosts(
  queryClient: QueryClient,
  postId: string,
  updater: (post: PostWithMeta) => PostWithMeta,
) {
  queryClient.setQueriesData({ queryKey: ['feed'] }, (current) => {
    if (!current) {
      return current;
    }
    if (Array.isArray(current)) {
      let changed = false;
      const next = current.map((post) => {
        if (!post || (post as PostWithMeta).id !== postId) {
          return post;
        }
        changed = true;
        return updater(post as PostWithMeta);
      });
      return changed ? next : current;
    }
    if (typeof current === 'object' && current && (current as PostWithMeta).id === postId) {
      return updater(current as PostWithMeta);
    }
    return current;
  });
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

async function insertCommentMentions(
  commentId: string,
  authorId: string,
  mentionedUserIds?: string[],
) {
  const ids = [...new Set((mentionedUserIds ?? []).filter((id) => id && id !== authorId))];
  if (ids.length === 0) {
    return;
  }
  const { error } = await supabase.from('comment_mentions').insert(
    ids.map((mentioned_user_id) => ({
      comment_id: commentId,
      mentioned_user_id,
      author_id: authorId,
    })),
  );
  if (error && !isMissingRelationError(error)) {
    console.log('[blob:feed] comment_mentions insert failed', error.message);
  }
}

export function useCreateComment(challengeId?: string | null) {
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const queryClient = useQueryClient();
  const key = challengeId ?? 'global';

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
      await queryClient.cancelQueries({ queryKey: ['feed', key] });
      const previous = queryClient.getQueryData<PostWithMeta[]>(['feed', key]);
      if (user) {
        const optimistic: CommentWithAuthor = {
          id: `optimistic-comment-${Date.now()}`,
          post_id: input.postId,
          author_id: user.id,
          parent_id: input.parentId ?? null,
          content: input.content,
          created_at: new Date().toISOString(),
          author: asPublicProfile(profile ?? { id: user.id }),
          reactions: [],
        };
        queryClient.setQueryData<PostWithMeta[]>(['feed', key], (current) =>
          (current ?? []).map((post) =>
            post.id === input.postId
              ? { ...post, comments: [...(post.comments ?? []), optimistic] }
              : post,
          ),
        );
      }
      return { previous };
    },
    onSuccess: (data) => {
      queryClient.setQueryData<PostWithMeta[]>(['feed', key], (current) =>
        (current ?? []).map((post) => {
          if (post.id !== data.post_id) {
            return post;
          }
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
        }),
      );
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['feed', key], context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['feed', key] });
      void queryClient.invalidateQueries({ queryKey: ['feed', 'author'] });
    },
  });
}

export function useDeletePost(challengeId?: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = challengeId ?? 'global';

  return useMutation({
    mutationFn: async (postId: string) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const { error } = await supabase.from('posts').delete().eq('id', postId).eq('author_id', user.id);
      if (error) {
        throw new Error(getErrorMessage(error));
      }
    },
    onMutate: async (postId) => {
      await queryClient.cancelQueries({ queryKey: ['feed', key] });
      const previous = queryClient.getQueryData<PostWithMeta[]>(['feed', key]);
      queryClient.setQueryData<PostWithMeta[]>(['feed', key], (current) =>
        (current ?? []).filter((post) => post.id !== postId),
      );
      return { previous };
    },
    onError: (_error, _postId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['feed', key], context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['feed', key] });
      void queryClient.invalidateQueries({ queryKey: ['feed', 'author'] });
    },
  });
}
