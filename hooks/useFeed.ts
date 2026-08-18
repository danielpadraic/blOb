import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { OFFICIAL_CHALLENGE_TITLE } from '@/lib/constants';
import { asQuoteSnapshot } from '@/lib/quotePost';
import { asPostAudience, DEFAULT_POST_AUDIENCE } from '@/lib/postAudience';
import { supabase } from '@/lib/supabase';
import type {
  CommentWithAuthor,
  ComposeInput,
  Post,
  PostWithMeta,
  PublicProfile,
  Reaction,
  ReactionType,
} from '@/lib/types';
import { reportBadgeActivity } from '@/lib/badgeActivity';
import { getErrorMessage } from '@/utils/errors';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';

const POST_COLUMNS =
  'id, author_id, challenge_id, content, media_urls, audience, audience_user_ids, moderation_status, quoted_post_id, quote_snapshot, deleted_at, created_at';
const POST_COLUMNS_LEGACY = 'id, author_id, challenge_id, content, media_urls, created_at';
const REACTION_COLUMNS = 'id, user_id, post_id, comment_id, reaction_type, created_at';
const REACTION_COLUMNS_LEGACY = 'id, user_id, post_id, reaction_type, created_at';

type FeedScope =
  | { kind: 'challenge'; challengeId: string }
  | { kind: 'global' }
  | { kind: 'ids'; challengeIds: string[] }
  | { kind: 'authors'; authorIds: string[] };

async function queryPosts(scope: FeedScope): Promise<PostWithMeta[]> {
  if (scope.kind === 'ids' && scope.challengeIds.length === 0) {
    return [];
  }
  if (scope.kind === 'authors' && scope.authorIds.length === 0) {
    return [];
  }

  const query = supabase
    .from('posts')
    .select(POST_COLUMNS)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  let { data, error } =
    scope.kind === 'challenge'
      ? await query.eq('challenge_id', scope.challengeId)
      : scope.kind === 'ids'
        ? await query.in('challenge_id', scope.challengeIds)
        : scope.kind === 'authors'
          ? await query.in('author_id', scope.authorIds)
          : await query.is('challenge_id', null);

  if (error && (isMissingAudienceColumn(error.message) || isMissingModerationColumn(error.message) || isMissingQuoteColumn(error.message))) {
    const legacy = supabase
      .from('posts')
      .select(POST_COLUMNS_LEGACY)
      .order('created_at', { ascending: false })
      .limit(50);
    const retry =
      scope.kind === 'challenge'
        ? await legacy.eq('challenge_id', scope.challengeId)
        : scope.kind === 'ids'
          ? await legacy.in('challenge_id', scope.challengeIds)
          : scope.kind === 'authors'
            ? await legacy.in('author_id', scope.authorIds)
            : await legacy.is('challenge_id', null);
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return ((data ?? []) as unknown as PostWithMeta[]).filter(
    (post) =>
      !post.deleted_at &&
      post.moderation_status !== 'under_review' &&
      post.moderation_status !== 'removed',
  ).map(withQuoteSnapshot);
}

function withQuoteSnapshot(post: PostWithMeta): PostWithMeta {
  return {
    ...post,
    quote_snapshot: asQuoteSnapshot(post.quote_snapshot) ?? post.quote_snapshot ?? null,
  };
}

function isMissingQuoteColumn(message: string): boolean {
  const text = message.toLowerCase();
  return (
    (text.includes('quoted_post_id') || text.includes('quote_snapshot') || text.includes('deleted_at')) &&
    (text.includes('does not exist') || text.includes('schema cache'))
  );
}

function isMissingModerationColumn(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes('moderation_status') && (text.includes('does not exist') || text.includes('schema cache'));
}

function isMissingAudienceColumn(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes('audience') && (text.includes('does not exist') || text.includes('schema cache'));
}

async function withSocial(posts: PostWithMeta[]): Promise<PostWithMeta[]> {
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

  return posts.map((post) => ({
    ...post,
    comments: commentsByPost.get(post.id) ?? post.comments ?? [],
    reactions: reactionsByPost.get(post.id) ?? post.reactions ?? [],
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
    .select('id, username, display_name, avatar_url')
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

async function fetchHiddenPostIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('post_hides').select('post_id').eq('user_id', userId);
  if (error) {
    return [];
  }
  return (data ?? []).map((row) => row.post_id);
}

async function fetchMutedUserIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('mutes').select('muted_user_id').eq('user_id', userId);
  if (error) {
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

async function fetchOfficialAnnouncementPosts(): Promise<PostWithMeta[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select('id, created_by')
    .eq('is_official', true);
  if (error || !data?.length) {
    if (error) {
      console.log('[blob:feed] official challenges lookup failed', error.message);
    }
    return [];
  }
  const challengeIds = data.map((row) => row.id);
  const hostIds = new Set(data.map((row) => row.created_by).filter(Boolean));
  const posts = await queryPosts({ kind: 'ids', challengeIds });
  return posts.filter((post) => hostIds.has(post.author_id) && asPostAudience(post.audience) === 'public');
}

async function fetchPosts(input: {
  challengeId?: string | null;
  userId?: string;
}): Promise<PostWithMeta[]> {
  if (input.challengeId) {
    const rows = await queryPosts({ kind: 'challenge', challengeId: input.challengeId });
    return hydrateAuthors(await withSocial(rows));
  }

  if (!input.userId) {
    return [];
  }

  const [joinedIds, hostedIds, friendIds, official, hiddenIds, mutedIds] = await Promise.all([
    fetchJoinedChallengeIds(input.userId),
    fetchHostedChallengeIds(input.userId),
    fetchFriendIds(input.userId),
    fetchOfficialAnnouncementPosts(),
    fetchHiddenPostIds(input.userId),
    fetchMutedUserIds(input.userId),
  ]);
  const challengeIds = [...new Set([...joinedIds, ...hostedIds])];
  const authorIds = [...new Set([input.userId, ...friendIds])];

  const [challengePosts, people] = await Promise.all([
    queryPosts({ kind: 'ids', challengeIds }),
    queryPosts({ kind: 'authors', authorIds }),
  ]);

  const hidden = new Set(hiddenIds);
  const muted = new Set(mutedIds);
  const userId = input.userId;

  return hydrateAuthors(
    await withSocial(
      dedupePosts([people, challengePosts, official])
        .filter((post) => {
          if (hidden.has(post.id)) {
            return false;
          }
          if (post.author_id !== userId && muted.has(post.author_id)) {
            return false;
          }
          return true;
        })
        .slice(0, 50),
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
  const content = `Logged today for the ${title} 💪`;
  const media_urls = input.mediaUrls ?? [];

  const payload = {
    author_id: input.userId,
    challenge_id: input.challengeId,
    content,
    media_urls,
    audience: DEFAULT_POST_AUDIENCE,
    audience_user_ids: [] as string[],
  };

  const created = await supabase.from('posts').insert(payload).select(POST_COLUMNS).single();
  if (!created.error) {
    return created.data as Post;
  }

  if (media_urls.length > 0) {
    const retry = await supabase.from('posts').insert(payload).select(POST_COLUMNS).single();
    if (!retry.error) {
      return retry.data as Post;
    }
    const missingMedia =
      retry.error.message.toLowerCase().includes('media_urls') ||
      retry.error.message.toLowerCase().includes('schema cache') ||
      retry.error.message.toLowerCase().includes('does not exist');
    if (!missingMedia) {
      throw new Error('Your workout is logged, but we couldn’t attach the photos to the post.');
    }
  }

  const withoutMedia = await supabase
    .from('posts')
    .insert({
      author_id: input.userId,
      challenge_id: input.challengeId,
      content,
      audience: DEFAULT_POST_AUDIENCE,
      audience_user_ids: [],
    })
    .select(POST_COLUMNS)
    .single();
  if (withoutMedia.error) {
    console.log('[blob:submit] auto-post failed', withoutMedia.error.message);
    return null;
  }
  return withoutMedia.data as Post;
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
      const rows = await queryPosts({ kind: 'authors', authorIds: [authorId!] });
      const hidden = user?.id ? new Set(await fetchHiddenPostIds(user.id)) : new Set<string>();
      const publicOnly = rows.filter(
        (post) => asPostAudience(post.audience) === 'public' && !hidden.has(post.id),
      );
      return hydrateAuthors(await withSocial(publicOnly));
    },
  });
}

export function usePost(postId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['feed', 'post', postId, user?.id],
    enabled: Boolean(postId),
    queryFn: async (): Promise<PostWithMeta | null> => {
      const { data, error } = await supabase
        .from('posts')
        .select(POST_COLUMNS)
        .eq('id', postId!)
        .maybeSingle();
      if (error && isMissingQuoteColumn(error.message)) {
        const legacy = await supabase
          .from('posts')
          .select(POST_COLUMNS_LEGACY)
          .eq('id', postId!)
          .maybeSingle();
        if (legacy.error || !legacy.data) {
          return null;
        }
        const rows = await hydrateAuthors(await withSocial([legacy.data as PostWithMeta]));
        return rows[0] ?? null;
      }
      if (error || !data || (data as PostWithMeta).deleted_at) {
        return null;
      }
      const rows = await hydrateAuthors(await withSocial([withQuoteSnapshot(data as PostWithMeta)]));
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
      if (!content && media_urls.length === 0 && !quoted_post_id) {
        throw new Error('Write something, or attach a photo first.');
      }
      if (audience === 'specific' && audience_user_ids.length === 0) {
        throw new Error('Pick at least one person.');
      }
      const payload = {
        author_id: user.id,
        challenge_id: challengeId ?? null,
        content: content || null,
        media_urls,
        audience,
        audience_user_ids,
        quoted_post_id,
        quote_snapshot: quoted_post_id ? (input.quoteSnapshot ?? null) : null,
      };
      const created = await supabase.from('posts').insert(payload).select(POST_COLUMNS).single();
      if (!created.error) {
        return created.data;
      }
      if (quoted_post_id && isMissingQuoteColumn(created.error.message)) {
        throw new Error('Repost isn’t wired on the server yet. Apply the latest migration.');
      }
      if (!isMissingAudienceColumn(created.error.message)) {
        throw new Error(getErrorMessage(created.error));
      }
      const { data, error } = await supabase
        .from('posts')
        .insert({
          author_id: user.id,
          challenge_id: challengeId ?? null,
          content: content || null,
          media_urls,
        })
        .select(POST_COLUMNS_LEGACY)
        .single();
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      return data;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['feed', key] });
      const previous = queryClient.getQueryData<PostWithMeta[]>(['feed', key]);
      if (user) {
        const optimistic: PostWithMeta = {
          id: `optimistic-${Date.now()}`,
          author_id: user.id,
          challenge_id: challengeId ?? null,
          content: input.content.trim() || null,
          media_urls: input.mediaUrls ?? [],
          audience: input.audience ?? DEFAULT_POST_AUDIENCE,
          audience_user_ids: input.audience === 'specific' ? (input.audienceUserIds ?? []) : [],
          quoted_post_id: input.quotedPostId ?? null,
          quote_snapshot: input.quoteSnapshot ?? null,
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
      void reportBadgeActivity();
    },
  });
}

export function useToggleReaction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      post: PostWithMeta;
      type: ReactionType;
      commentId?: string | null;
    }) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const existing = findExistingReaction(input.post, user.id, input.type, input.commentId);

      if (existing) {
        const { error } = await supabase.from('reactions').delete().eq('id', existing.id);
        if (error) {
          throw new Error(getErrorMessage(error));
        }
        return;
      }

      const inserted = input.commentId
        ? await supabase.from('reactions').insert({
            user_id: user.id,
            comment_id: input.commentId,
            reaction_type: input.type,
          })
        : await supabase.from('reactions').insert({
            user_id: user.id,
            post_id: input.post.id,
            reaction_type: input.type,
          });
      if (inserted.error) {
        const text = inserted.error.message.toLowerCase();
        if (input.commentId && (text.includes('comment_id') || text.includes('null value'))) {
          throw new Error('Comment reactions need a database update. Run the latest SQL in supabase/migrations.');
        }
        throw new Error(getErrorMessage(inserted.error));
      }
    },
    onMutate: async (input) => {
      if (!user) {
        return;
      }
      const key = input.post.challenge_id ?? 'global';
      await queryClient.cancelQueries({ queryKey: ['feed', key] });
      const previous = queryClient.getQueryData<PostWithMeta[]>(['feed', key]);
      queryClient.setQueryData<PostWithMeta[]>(['feed', key], (current) =>
        (current ?? []).map((post) => {
          if (post.id !== input.post.id) {
            return post;
          }
          return applyOptimisticReaction(post, user.id, input.type, input.commentId);
        }),
      );
      return { previous, key };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous && context.key) {
        queryClient.setQueryData(['feed', context.key], context.previous);
      }
    },
    onSettled: (_data, _error, variables) => {
      const key = variables.post.challenge_id ?? 'global';
      void queryClient.invalidateQueries({ queryKey: ['feed', key] });
      void queryClient.invalidateQueries({ queryKey: ['feed', 'author'] });
    },
  });
}

function findExistingReaction(
  post: PostWithMeta,
  userId: string,
  type: ReactionType,
  commentId?: string | null,
): Reaction | undefined {
  const pool = commentId
    ? post.comments?.find((comment) => comment.id === commentId)?.reactions
    : post.reactions;
  return pool?.find(
    (reaction) => reaction.user_id === userId && reaction.reaction_type === type,
  );
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
  const existing = current.find(
    (reaction) => reaction.user_id === userId && reaction.reaction_type === type,
  );
  if (existing) {
    return current.filter((reaction) => reaction.id !== existing.id);
  }
  return [
    ...current,
    {
      id: `optimistic-${type}-${commentId ?? postId}-${userId}`,
      user_id: userId,
      post_id: postId,
      comment_id: commentId,
      reaction_type: type,
      created_at: new Date().toISOString(),
    },
  ];
}

function isPersistedId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function useCreateComment(challengeId?: string | null) {
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const queryClient = useQueryClient();
  const key = challengeId ?? 'global';

  return useMutation({
    mutationFn: async (input: { postId: string; content: string; parentId?: string | null }) => {
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
        return nested.data;
      }

      const { data, error } = await supabase.from('comments').insert(base).select().single();
      if (error) {
        throw new Error(getErrorMessage(error));
      }
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
