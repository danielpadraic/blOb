import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { reportBadgeActivity } from '@/lib/badgeActivity';
import {
  fetchCorporateChallengeIds,
  fetchHiddenRailPostIds,
  filterStoriesForRail,
  loadHiddenRailAuthors,
} from '@/lib/clipRail';
import { withSatelliteTimeout } from '@/lib/homeFeed';
import { OFFICIAL_BOB_ID } from '@/lib/official';
import { publishedRowId } from '@/lib/routes';
import { logMissingPublishAuthor, safeUserId, sessionAuthor } from '@/lib/safeIds';
import { supabase } from '@/lib/supabase';
import { WAVE_CLIP_MS } from '@/lib/waveClips';
import {
  SOCIAL_PAGE_SIZE,
  acceptFriendRequest,
  createStoryComment,
  createFeedEvent,
  createReel,
  createStory,
  fetchActiveStories,
  fetchChallengePreviewsByIds,
  fetchConversation,
  fetchConversations,
  fetchFeedEvents,
  fetchFollowers,
  fetchFollowing,
  fetchFriendRequests,
  fetchBlockedPeerIds,
  fetchFriendCount,
  fetchFriends,
  fetchFriendshipSnapshot,
  fetchMessages,
  fetchPublicProfilesByIds,
  fetchReel,
  fetchReels,
  fetchStory,
  fetchStoryChallengeOptions,
  fetchStoryComments,
  fetchStoryReactions,
  fetchViewedStoryIds,
  groupStories,
  detectPeopleSearch,
  notifyStoryShared,
  otherFriendshipUserId,
  searchPeople,
  followUser,
  createGroupConversation,
  getOrCreateDirectConversation,
  markConversationRead,
  rejectFriendRequest,
  sendFriendRequest,
  unfriendUser,
  sendMessage,
  toggleStoryReaction,
  unfollowUser,
  viewStory,
  type ConversationPreview,
  type CreateFeedEventInput,
  type CreateReelInput,
  type ReelItem,
  type CreateStoryInput,
  type FollowEdge,
  type FriendEdge,
  type FriendshipSnapshot,
  type FeedEventItem,
  type SendMessageInput,
} from '@/lib/social';
import type { Friendship, Message, Story, StoryComment, StoryReaction, StoryReactionType } from '@/types/social';

export type {
  ConversationPreview,
  CreateFeedEventInput,
  CreateReelInput,
  ReelItem,
  CreateStoryInput,
  FeedEventItem,
  FollowEdge,
  FriendEdge,
  FriendRequestLists,
  FriendshipSnapshot,
  PeopleRelation,
  SendMessageInput,
  StoryGroup,
} from '@/lib/social';

export const socialKeys = {
  followers: (userId: string) => ['followers', userId] as const,
  following: (userId: string) => ['following', userId] as const,
  friends: (userId: string) => ['friends', userId] as const,
  friendCount: (userId: string) => ['friend-count', userId] as const,
  requests: (userId: string) => ['friend-requests', userId] as const,
  peopleSearch: (userId: string, term: string) => ['people-search', userId, term] as const,
  friendship: (userId: string, targetId: string) => ['friendship', userId, targetId] as const,
  blockedPeers: (userId: string) => ['blocked-peers', userId] as const,
  follow: (userId: string, targetId: string) => ['follow', userId, targetId] as const,
  followCounts: (userId: string) => ['follow-counts', userId] as const,
  feed: (limit: number) => ['feed-events', limit] as const,
  stories: () => ['stories', 'active'] as const,
  story: (id: string) => ['story', id] as const,
  storyViews: (userId: string) => ['story-views', userId] as const,
  storyAuthors: (ids: string[]) => ['story-authors', ids] as const,
  storyChallengePreviews: (ids: string[]) => ['story-challenge-previews', ids] as const,
  storyRailFilters: (postIds: string[], challengeIds: string[]) =>
    ['story-rail-filters', [...postIds].sort().join(','), [...challengeIds].sort().join(',')] as const,
  storyReactions: (storyId: string) => ['story-reactions', storyId] as const,
  storyComments: (storyId: string) => ['story-comments', storyId] as const,
  reels: (limit: number) => ['reels', limit] as const,
  reel: (id: string) => ['reel', id] as const,
  conversations: (userId: string) => ['conversations', userId] as const,
  conversation: (id: string) => ['conversation', id] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
};

/** Put the new Wave in the rail/player cache with user_id before navigate. */
export function seedPublishedWave(
  queryClient: QueryClient,
  story: Story | null | undefined,
  author?: { id?: string | null; username?: string | null; display_name?: string | null; avatar_url?: string | null } | null,
) {
  const id = publishedRowId(story);
  if (!id || !story) {
    return;
  }
  const userId = safeUserId(author, story.user_id) ?? story.user_id;
  if (!userId) {
    logMissingPublishAuthor({ type: 'wave', postId: id, hasAuthor: false });
  }
  const seeded: Story = {
    ...story,
    id,
    user_id: userId || story.user_id,
  };
  queryClient.setQueryData(socialKeys.story(id), seeded);
  queryClient.setQueryData<Story[]>(socialKeys.stories(), (current) => {
    const rows = (current ?? []).filter((row) => row?.id && row.id !== id && !String(row.id).startsWith('optimistic-'));
    return [seeded, ...rows];
  });
}

/** Put the new Round in the rail/player cache with author before navigate. */
export function seedPublishedReel(
  queryClient: QueryClient,
  reel: ReelItem | null | undefined,
  author?: { id?: string | null; username?: string | null; display_name?: string | null; avatar_url?: string | null } | null,
) {
  const id = publishedRowId(reel);
  if (!id || !reel) {
    return;
  }
  const userId = safeUserId(author, reel.user_id, reel.profile) ?? reel.user_id;
  const profile = reel.profile ?? (userId ? sessionAuthor(author, userId) : null);
  if (!userId) {
    logMissingPublishAuthor({ type: 'round', postId: id, hasAuthor: false });
  }
  const seeded: ReelItem = {
    ...reel,
    id,
    user_id: userId || reel.user_id,
    profile: (profile as ReelItem['profile']) ?? null,
  };
  queryClient.setQueryData(socialKeys.reel(id), seeded);
  queryClient.setQueriesData<ReelItem[]>({ queryKey: ['reels'] }, (current) => {
    if (!current) {
      return current;
    }
    const rows = current.filter((row) => row?.id && row.id !== id && !String(row.id).startsWith('optimistic-'));
    return [seeded, ...rows];
  });
}

function requireUserId(userId?: string | null): string {
  if (!userId) {
    throw new Error('You need to be signed in.');
  }
  return userId;
}

function invalidateFollowGraph(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  targetUserId: string,
) {
  void queryClient.invalidateQueries({ queryKey: socialKeys.follow(userId, targetUserId) });
  void queryClient.invalidateQueries({ queryKey: socialKeys.followCounts(targetUserId) });
  void queryClient.invalidateQueries({ queryKey: socialKeys.followCounts(userId) });
  void queryClient.invalidateQueries({ queryKey: socialKeys.followers(targetUserId) });
  void queryClient.invalidateQueries({ queryKey: socialKeys.following(userId) });
  void reportBadgeActivity();
}

function invalidateFriendship(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  targetUserId: string,
) {
  void queryClient.invalidateQueries({ queryKey: socialKeys.friendship(userId, targetUserId) });
  void queryClient.invalidateQueries({ queryKey: socialKeys.friends(userId) });
  void queryClient.invalidateQueries({ queryKey: socialKeys.friends(targetUserId) });
  void queryClient.invalidateQueries({ queryKey: socialKeys.friendCount(userId) });
  void queryClient.invalidateQueries({ queryKey: socialKeys.friendCount(targetUserId) });
  void queryClient.invalidateQueries({ queryKey: socialKeys.requests(userId) });
  void queryClient.invalidateQueries({ queryKey: socialKeys.requests(targetUserId) });
  void queryClient.invalidateQueries({ queryKey: socialKeys.blockedPeers(userId) });
  void queryClient.invalidateQueries({ queryKey: socialKeys.blockedPeers(targetUserId) });
  void queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
}

export function useFollowers(userId?: string | null) {
  const { user } = useAuth();
  const id = userId ?? user?.id ?? null;
  return useQuery({
    queryKey: socialKeys.followers(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => fetchFollowers(id!),
  });
}

export function useFollowing(userId?: string | null, options?: { enabled?: boolean }) {
  const { user } = useAuth();
  const id = userId ?? user?.id ?? null;
  return useQuery({
    queryKey: socialKeys.following(id ?? ''),
    enabled: Boolean(id) && options?.enabled !== false,
    queryFn: () => fetchFollowing(id!),
  });
}

export function useFriends(userId?: string | null, options?: { enabled?: boolean }) {
  const { user } = useAuth();
  const id = userId ?? user?.id ?? null;
  return useQuery({
    queryKey: socialKeys.friends(id ?? ''),
    enabled: Boolean(id) && options?.enabled !== false,
    queryFn: () => fetchFriends(id!),
  });
}

export function useFriendCount(userId?: string | null) {
  return useQuery({
    queryKey: socialKeys.friendCount(userId ?? ''),
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: () => fetchFriendCount(userId!),
  });
}

export function useFriendRequests(userId?: string | null) {
  const { user } = useAuth();
  const id = userId ?? user?.id ?? null;
  return useQuery({
    queryKey: socialKeys.requests(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => fetchFriendRequests(id!),
  });
}

export function usePeopleSearch(query: string) {
  const { user } = useAuth();
  const parsed = detectPeopleSearch(query);
  const term = parsed ? `${parsed.kind}:${parsed.term}` : '';
  return useQuery({
    queryKey: socialKeys.peopleSearch(user?.id ?? '', term),
    enabled: Boolean(user?.id && parsed),
    queryFn: () => searchPeople(query, user!.id),
  });
}

export function useFriendshipStatus(targetUserId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: socialKeys.friendship(user?.id ?? '', targetUserId ?? ''),
    enabled: Boolean(user?.id && targetUserId && user.id !== targetUserId),
    queryFn: () => fetchFriendshipSnapshot(user!.id, targetUserId!),
  });
}

export function useBlockedPeerIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: socialKeys.blockedPeers(user?.id ?? ''),
    enabled: Boolean(user?.id),
    queryFn: () => fetchBlockedPeerIds(user!.id),
  });
}

export function useFollowUser() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const userId = requireUserId(user?.id);
      return followUser(userId, targetUserId);
    },
    onMutate: async (targetUserId) => {
      const userId = user?.id;
      if (!userId) {
        return;
      }
      await queryClient.cancelQueries({ queryKey: socialKeys.follow(userId, targetUserId) });
      await queryClient.cancelQueries({ queryKey: socialKeys.following(userId) });
      await queryClient.cancelQueries({ queryKey: socialKeys.followers(targetUserId) });
      await queryClient.cancelQueries({ queryKey: socialKeys.followCounts(targetUserId) });

      const previousFollow = queryClient.getQueryData<boolean>(
        socialKeys.follow(userId, targetUserId),
      );
      const previousFollowing = queryClient.getQueryData<FollowEdge[]>(socialKeys.following(userId));
      const previousFollowers = queryClient.getQueryData<FollowEdge[]>(
        socialKeys.followers(targetUserId),
      );
      const previousCounts = queryClient.getQueryData<{ followers: number; following: number }>(
        socialKeys.followCounts(targetUserId),
      );

      const now = new Date().toISOString();
      const edge: FollowEdge = {
        follower_id: userId,
        following_id: targetUserId,
        created_at: now,
        profile: null,
      };
      queryClient.setQueryData(socialKeys.follow(userId, targetUserId), true);
      queryClient.setQueryData<FollowEdge[]>(socialKeys.following(userId), (current) => {
        if (!current) {
          return current;
        }
        if (current.some((row) => row.following_id === targetUserId)) {
          return current;
        }
        return [edge, ...current];
      });
      queryClient.setQueryData<FollowEdge[]>(socialKeys.followers(targetUserId), (current) => {
        if (!current) {
          return current;
        }
        if (current.some((row) => row.follower_id === userId)) {
          return current;
        }
        return [edge, ...current];
      });
      if (previousCounts) {
        queryClient.setQueryData(socialKeys.followCounts(targetUserId), {
          ...previousCounts,
          followers: previousCounts.followers + 1,
        });
      }
      return { previousFollow, previousFollowing, previousFollowers, previousCounts, userId };
    },
    onError: (_error, targetUserId, context) => {
      if (!context?.userId) {
        return;
      }
      queryClient.setQueryData(socialKeys.follow(context.userId, targetUserId), context.previousFollow);
      if (context.previousFollowing) {
        queryClient.setQueryData(socialKeys.following(context.userId), context.previousFollowing);
      }
      if (context.previousFollowers) {
        queryClient.setQueryData(socialKeys.followers(targetUserId), context.previousFollowers);
      }
      if (context.previousCounts) {
        queryClient.setQueryData(socialKeys.followCounts(targetUserId), context.previousCounts);
      }
    },
    onSettled: (_data, _error, targetUserId) => {
      if (user?.id) {
        invalidateFollowGraph(queryClient, user.id, targetUserId);
      }
    },
  });
}

export function useUnfollowUser() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const userId = requireUserId(user?.id);
      await unfollowUser(userId, targetUserId);
    },
    onMutate: async (targetUserId) => {
      const userId = user?.id;
      if (!userId) {
        return;
      }
      await queryClient.cancelQueries({ queryKey: socialKeys.follow(userId, targetUserId) });
      await queryClient.cancelQueries({ queryKey: socialKeys.following(userId) });
      await queryClient.cancelQueries({ queryKey: socialKeys.followers(targetUserId) });
      await queryClient.cancelQueries({ queryKey: socialKeys.followCounts(targetUserId) });

      const previousFollow = queryClient.getQueryData<boolean>(
        socialKeys.follow(userId, targetUserId),
      );
      const previousFollowing = queryClient.getQueryData<FollowEdge[]>(socialKeys.following(userId));
      const previousFollowers = queryClient.getQueryData<FollowEdge[]>(
        socialKeys.followers(targetUserId),
      );
      const previousCounts = queryClient.getQueryData<{ followers: number; following: number }>(
        socialKeys.followCounts(targetUserId),
      );

      queryClient.setQueryData(socialKeys.follow(userId, targetUserId), false);
      queryClient.setQueryData<FollowEdge[]>(socialKeys.following(userId), (current) =>
        (current ?? []).filter((row) => row.following_id !== targetUserId),
      );
      queryClient.setQueryData<FollowEdge[]>(socialKeys.followers(targetUserId), (current) =>
        (current ?? []).filter((row) => row.follower_id !== userId),
      );
      if (previousCounts) {
        queryClient.setQueryData(socialKeys.followCounts(targetUserId), {
          ...previousCounts,
          followers: Math.max(previousCounts.followers - 1, 0),
        });
      }
      return { previousFollow, previousFollowing, previousFollowers, previousCounts, userId };
    },
    onError: (_error, targetUserId, context) => {
      if (!context?.userId) {
        return;
      }
      queryClient.setQueryData(socialKeys.follow(context.userId, targetUserId), context.previousFollow);
      if (context.previousFollowing) {
        queryClient.setQueryData(socialKeys.following(context.userId), context.previousFollowing);
      }
      if (context.previousFollowers) {
        queryClient.setQueryData(socialKeys.followers(targetUserId), context.previousFollowers);
      }
      if (context.previousCounts) {
        queryClient.setQueryData(socialKeys.followCounts(targetUserId), context.previousCounts);
      }
    },
    onSettled: (_data, _error, targetUserId) => {
      if (user?.id) {
        invalidateFollowGraph(queryClient, user.id, targetUserId);
      }
    },
  });
}

export function useSendFriendRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const userId = requireUserId(user?.id);
      return sendFriendRequest(userId, targetUserId);
    },
    onMutate: async (targetUserId) => {
      const userId = user?.id;
      if (!userId) {
        return;
      }
      await queryClient.cancelQueries({ queryKey: socialKeys.friendship(userId, targetUserId) });
      const previous = queryClient.getQueryData<FriendshipSnapshot>(
        socialKeys.friendship(userId, targetUserId),
      );
      const now = new Date().toISOString();
      const pair =
        userId < targetUserId
          ? { user_a_id: userId, user_b_id: targetUserId }
          : { user_a_id: targetUserId, user_b_id: userId };
      const friendship: Friendship = {
        ...pair,
        status: 'pending',
        requested_by: userId,
        created_at: now,
        accepted_at: null,
      };
      queryClient.setQueryData<FriendshipSnapshot>(socialKeys.friendship(userId, targetUserId), {
        status: 'pending',
        friendship,
        incoming: false,
      });
      return { previous, userId };
    },
    onError: (_error, targetUserId, context) => {
      if (context?.previous && context.userId) {
        queryClient.setQueryData(socialKeys.friendship(context.userId, targetUserId), context.previous);
      }
    },
    onSettled: (_data, _error, targetUserId) => {
      if (user?.id) {
        invalidateFriendship(queryClient, user.id, targetUserId);
      }
    },
  });
}

export function useAcceptFriendRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fromUserId: string) => {
      const userId = requireUserId(user?.id);
      return acceptFriendRequest(userId, fromUserId);
    },
    onMutate: async (fromUserId) => {
      const userId = user?.id;
      if (!userId) {
        return;
      }
      await queryClient.cancelQueries({ queryKey: socialKeys.friendship(userId, fromUserId) });
      await queryClient.cancelQueries({ queryKey: socialKeys.friends(userId) });
      const previousStatus = queryClient.getQueryData<FriendshipSnapshot>(
        socialKeys.friendship(userId, fromUserId),
      );
      const previousFriends = queryClient.getQueryData<FriendEdge[]>(socialKeys.friends(userId));
      const now = new Date().toISOString();
      queryClient.setQueryData<FriendshipSnapshot>(socialKeys.friendship(userId, fromUserId), (current) => {
        if (!current?.friendship) {
          return current;
        }
        const friendship = { ...current.friendship, status: 'accepted' as const, accepted_at: now };
        return { status: 'accepted', friendship, incoming: false };
      });
      queryClient.setQueryData<FriendEdge[]>(socialKeys.friends(userId), (current) => {
        if (!current || !previousStatus?.friendship) {
          return current;
        }
        if (current.some((row) => otherIdsMatch(row, previousStatus.friendship!))) {
          return current;
        }
        return [{ ...previousStatus.friendship, status: 'accepted', accepted_at: now, profile: null }, ...current];
      });
      return { previousStatus, previousFriends, userId };
    },
    onError: (_error, fromUserId, context) => {
      if (!context?.userId) {
        return;
      }
      if (context.previousStatus) {
        queryClient.setQueryData(socialKeys.friendship(context.userId, fromUserId), context.previousStatus);
      }
      if (context.previousFriends) {
        queryClient.setQueryData(socialKeys.friends(context.userId), context.previousFriends);
      }
    },
    onSettled: (_data, _error, fromUserId) => {
      if (user?.id) {
        invalidateFriendship(queryClient, user.id, fromUserId);
        void reportBadgeActivity();
      }
    },
  });
}

export function useRejectFriendRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (otherUserId: string) => {
      const userId = requireUserId(user?.id);
      await rejectFriendRequest(userId, otherUserId);
    },
    onMutate: async (otherUserId) => {
      const userId = user?.id;
      if (!userId) {
        return;
      }
      await queryClient.cancelQueries({ queryKey: socialKeys.friendship(userId, otherUserId) });
      const previous = queryClient.getQueryData<FriendshipSnapshot>(
        socialKeys.friendship(userId, otherUserId),
      );
      queryClient.setQueryData<FriendshipSnapshot>(socialKeys.friendship(userId, otherUserId), {
        status: 'none',
        friendship: null,
        incoming: false,
      });
      return { previous, userId };
    },
    onError: (_error, otherUserId, context) => {
      if (context?.previous && context.userId) {
        queryClient.setQueryData(socialKeys.friendship(context.userId, otherUserId), context.previous);
      }
    },
    onSettled: (_data, _error, otherUserId) => {
      if (user?.id) {
        invalidateFriendship(queryClient, user.id, otherUserId);
      }
    },
  });
}

export function useUnfriend() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (otherUserId: string) => {
      const userId = requireUserId(user?.id);
      await unfriendUser(userId, otherUserId);
    },
    onMutate: async (otherUserId) => {
      const userId = user?.id;
      if (!userId) {
        return;
      }
      await queryClient.cancelQueries({ queryKey: socialKeys.friendship(userId, otherUserId) });
      await queryClient.cancelQueries({ queryKey: socialKeys.friends(userId) });
      const previous = queryClient.getQueryData<FriendshipSnapshot>(
        socialKeys.friendship(userId, otherUserId),
      );
      const previousFriends = queryClient.getQueryData<FriendEdge[]>(socialKeys.friends(userId));
      queryClient.setQueryData<FriendshipSnapshot>(socialKeys.friendship(userId, otherUserId), {
        status: 'none',
        friendship: null,
        incoming: false,
      });
      queryClient.setQueryData<FriendEdge[]>(socialKeys.friends(userId), (current) =>
        (current ?? []).filter((row) => otherFriendshipUserId(row, userId) !== otherUserId),
      );
      return { previous, previousFriends, userId };
    },
    onError: (_error, otherUserId, context) => {
      if (!context?.userId) {
        return;
      }
      if (context.previous) {
        queryClient.setQueryData(socialKeys.friendship(context.userId, otherUserId), context.previous);
      }
      if (context.previousFriends) {
        queryClient.setQueryData(socialKeys.friends(context.userId), context.previousFriends);
      }
    },
    onSettled: (_data, _error, otherUserId) => {
      if (user?.id) {
        invalidateFriendship(queryClient, user.id, otherUserId);
        void queryClient.invalidateQueries({ queryKey: ['feed'] });
        void queryClient.invalidateQueries({ queryKey: ['friends'] });
      }
    },
  });
}

function otherIdsMatch(left: Friendship, right: Friendship) {
  return left.user_a_id === right.user_a_id && left.user_b_id === right.user_b_id;
}

/** Social activity feed (`feed_events`). Home uses `hooks/useFeed.ts` for posts. */
export function useFeedEvents(limit = SOCIAL_PAGE_SIZE) {
  const { user } = useAuth();
  return useQuery({
    queryKey: socialKeys.feed(limit),
    enabled: Boolean(user?.id),
    queryFn: () => fetchFeedEvents(limit, user!.id),
  });
}

/** @deprecated Use `useFeed` from `@/hooks/useFeed` for posts, or `useFeedEvents` for activity. */
export function useFeed(limit = SOCIAL_PAGE_SIZE) {
  return useFeedEvents(limit);
}

export function useCreateFeedEvent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateFeedEventInput) => {
      const userId = requireUserId(user?.id);
      return createFeedEvent(userId, input);
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['feed-events'] });
      const previous = queryClient.getQueriesData<FeedEventItem[]>({ queryKey: ['feed-events'] });
      if (user?.id) {
        const optimistic: FeedEventItem = {
          id: `optimistic-${Date.now()}`,
          actor_id: user.id,
          event_type: input.event_type,
          target_type: input.target_type ?? null,
          target_id: input.target_id ?? null,
          challenge_id: input.challenge_id ?? null,
          metadata: input.metadata ?? {},
          visibility: input.visibility ?? 'public',
          created_at: new Date().toISOString(),
          actor: null,
          challenge: null,
        };
        queryClient.setQueriesData<FeedEventItem[]>({ queryKey: ['feed-events'] }, (current) =>
          current ? [optimistic, ...current] : current,
        );
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['feed-events'] });
    },
  });
}

export function useStory(id?: string | null) {
  return useQuery({
    queryKey: socialKeys.story(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => fetchStory(id!),
  });
}

export function useStoryGroups(options?: { includeEmptyOwn?: boolean }) {
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const storiesQuery = useActiveStories();
  const viewedQuery = useViewedStoryIds();
  const friendsQuery = useFriends();
  const followingQuery = useFollowing();

  const authorIds = useMemo(
    () => [...new Set((storiesQuery.data ?? []).map((story) => story.user_id))].sort(),
    [storiesQuery.data],
  );

  const authorsQuery = useQuery({
    queryKey: socialKeys.storyAuthors(authorIds),
    enabled: authorIds.length > 0,
    queryFn: () => fetchPublicProfilesByIds(authorIds),
  });

  const circleIds = useMemo(() => {
    const ids = new Set<string>();
    ids.add(OFFICIAL_BOB_ID);
    if (user?.id) {
      ids.add(user.id);
    }
    for (const friend of friendsQuery.data ?? []) {
      if (user?.id) {
        ids.add(otherFriendshipUserId(friend, user.id));
      }
    }
    for (const follow of followingQuery.data ?? []) {
      ids.add(follow.following_id);
    }
    return ids;
  }, [friendsQuery.data, followingQuery.data, user?.id]);

  const profiles = useMemo(() => {
    const map = new Map<string, { display_name: string | null; username: string; avatar_url: string | null }>();
    const selfId = safeUserId(profile, user?.id);
    if (profile && selfId) {
      map.set(selfId, profile);
    }
    for (const friend of friendsQuery.data ?? []) {
      const id = safeUserId(friend.profile);
      if (id && friend.profile) {
        map.set(id, friend.profile);
      }
    }
    for (const follow of followingQuery.data ?? []) {
      const id = safeUserId(follow.profile);
      if (id && follow.profile) {
        map.set(id, follow.profile);
      }
    }
    for (const author of authorsQuery.data ?? []) {
      if (author?.id) {
        map.set(author.id, author);
      }
    }
    return map;
  }, [authorsQuery.data, friendsQuery.data, followingQuery.data, profile, user?.id]);

  const postIds = useMemo(
    () => (storiesQuery.data ?? []).map((story) => story.post_id).filter((id): id is string => Boolean(id)),
    [storiesQuery.data],
  );
  const challengeIds = useMemo(
    () =>
      (storiesQuery.data ?? [])
        .map((story) => story.challenge_id)
        .filter((id): id is string => Boolean(id)),
    [storiesQuery.data],
  );
  const railFilterQuery = useQuery({
    queryKey: socialKeys.storyRailFilters(postIds, challengeIds),
    enabled: Boolean(user?.id) && (postIds.length > 0 || challengeIds.length > 0),
    queryFn: async () => {
      const [hiddenPostIds, corporateChallengeIds, hiddenAuthorIds] = await Promise.all([
        fetchHiddenRailPostIds(postIds),
        fetchCorporateChallengeIds(challengeIds),
        loadHiddenRailAuthors(),
      ]);
      return { hiddenPostIds, corporateChallengeIds, hiddenAuthorIds };
    },
  });
  const railStories = useMemo(
    () =>
      filterStoriesForRail({
        stories: storiesQuery.data ?? [],
        hiddenPostIds: railFilterQuery.data?.hiddenPostIds ?? new Set(),
        corporateChallengeIds: railFilterQuery.data?.corporateChallengeIds ?? new Set(),
        hiddenAuthorIds: railFilterQuery.data?.hiddenAuthorIds ?? new Set(),
        viewerId: user?.id,
      }),
    [railFilterQuery.data, storiesQuery.data, user?.id],
  );

  const groups = useMemo(
    () =>
      groupStories({
        stories: railStories,
        userId: user?.id,
        profiles,
        circleIds,
        includeEmptyOwn: Boolean(options?.includeEmptyOwn),
      }),
    [circleIds, options?.includeEmptyOwn, profiles, railStories, user?.id],
  );

  const viewedIds = useMemo(() => new Set(viewedQuery.data ?? []), [viewedQuery.data]);

  return {
    groups,
    viewedIds,
    storiesQuery,
    viewedQuery,
    isLoading: storiesQuery.isLoading,
  };
}

export function useStoryChallengePreviews(ids: string[]) {
  const unique = useMemo(() => [...new Set(ids.filter(Boolean))].sort(), [ids]);
  return useQuery({
    queryKey: socialKeys.storyChallengePreviews(unique),
    enabled: unique.length > 0,
    queryFn: () => fetchChallengePreviewsByIds(unique),
  });
}

export function useActiveStories() {
  const { user } = useAuth();
  return useQuery({
    queryKey: socialKeys.stories(),
    enabled: Boolean(user?.id),
    retry: false,
    queryFn: async () => {
      try {
        return await withSatelliteTimeout(fetchActiveStories(), []);
      } catch {
        return [];
      }
    },
  });
}

export function useViewedStoryIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: socialKeys.storyViews(user?.id ?? ''),
    enabled: Boolean(user?.id),
    queryFn: () => fetchViewedStoryIds(user!.id),
  });
}

export function useStoryChallengeOptions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['story-challenges', user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchStoryChallengeOptions(user!.id),
  });
}

export function useCreateStory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateStoryInput) => {
      const userId = requireUserId(user?.id);
      return createStory(userId, input);
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: socialKeys.stories() });
      const previous = queryClient.getQueryData<Story[]>(socialKeys.stories());
      if (user?.id) {
        const now = new Date();
        const clips = input.clips?.length ? input.clips : [{ startMs: 0, durationMs: WAVE_CLIP_MS }];
        const optimistic = clips.map((clip, index) => ({
          id: `optimistic-${now.getTime()}-${index}`,
          user_id: user.id,
          media_url: input.media_url,
          media_type: input.media_type,
          challenge_id: input.challenge_id ?? null,
          caption:
            clip.caption?.trim() ||
            (clips.length === 1 ? input.caption?.trim() || null : null),
          expires_at: input.expires_at ?? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          created_at: now.toISOString(),
          sequence_index: index,
          clip_start_ms: clip.startMs,
          clip_duration_ms: clip.durationMs,
          thumbnail_url: input.thumbnail_url ?? null,
        })) as Story[];
        queryClient.setQueryData<Story[]>(socialKeys.stories(), [...optimistic, ...(previous ?? [])]);
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(socialKeys.stories(), context.previous);
      }
    },
    onSuccess: (stories) => {
      queryClient.setQueryData<Story[]>(socialKeys.stories(), (current) => {
        const withoutOptimistic = (current ?? []).filter(
          (row) => row?.id && !row.id.startsWith('optimistic-'),
        );
        const live = stories
          .filter((row) => Boolean(row?.id))
          .map((row) => ({
            ...row,
            user_id: row.user_id || user?.id || row.user_id,
          }));
        const ids = new Set(live.map((row) => row.id));
        return [...live, ...withoutOptimistic.filter((row) => row?.id && !ids.has(row.id))];
      });
      for (const story of stories) {
        if (story?.id) {
          seedPublishedWave(queryClient, story, { id: user?.id ?? story.user_id });
        }
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['stories'] });
      void queryClient.invalidateQueries({ queryKey: ['wave-groups'] });
      void queryClient.invalidateQueries({ queryKey: socialKeys.stories() });
    },
  });
}

export function useViewStory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (storyId: string) => {
      const userId = requireUserId(user?.id);
      await viewStory(userId, storyId);
      return storyId;
    },
    onMutate: async (storyId) => {
      if (!user?.id) {
        return;
      }
      const key = socialKeys.storyViews(user.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<string[]>(key);
      queryClient.setQueryData<string[]>(key, (current) =>
        current?.includes(storyId) ? current : [...(current ?? []), storyId],
      );
      return { previous, key };
    },
    onError: (_error, _storyId, context) => {
      if (context?.previous && context.key) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },
    onSettled: () => {
      if (user?.id) {
        void queryClient.invalidateQueries({ queryKey: socialKeys.storyViews(user.id) });
      }
    },
  });
}

export function useStoryReactions(storyId?: string | null) {
  return useQuery({
    queryKey: socialKeys.storyReactions(storyId ?? ''),
    enabled: Boolean(storyId),
    queryFn: () => fetchStoryReactions(storyId!),
  });
}

export function useStoryComments(storyId?: string | null) {
  return useQuery({
    queryKey: socialKeys.storyComments(storyId ?? ''),
    enabled: Boolean(storyId),
    queryFn: () => fetchStoryComments(storyId!),
  });
}

export function useToggleStoryReaction(storyId?: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (type: StoryReactionType) => {
      const userId = requireUserId(user?.id);
      if (!storyId) {
        throw new Error('Missing Wave.');
      }
      await toggleStoryReaction(userId, storyId, type);
    },
    onMutate: async (type) => {
      if (!user?.id || !storyId) {
        return;
      }
      const key = socialKeys.storyReactions(storyId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<StoryReaction[]>(key);
      queryClient.setQueryData<StoryReaction[]>(key, (current) => {
        const list = current ?? [];
        const existing = list.find((row) => row.user_id === user.id && row.reaction_type === type);
        if (existing) {
          return list.filter((row) => row.id !== existing.id);
        }
        return [
          ...list,
          {
            id: `optimistic-${type}`,
            story_id: storyId,
            user_id: user.id,
            reaction_type: type,
            created_at: new Date().toISOString(),
          },
        ];
      });
      return { previous, key };
    },
    onError: (_error, _type, context) => {
      if (context?.previous && context.key) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },
    onSettled: () => {
      if (storyId) {
        void queryClient.invalidateQueries({ queryKey: socialKeys.storyReactions(storyId) });
      }
    },
  });
}

export function useCreateStoryComment(storyId?: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const userId = requireUserId(user?.id);
      if (!storyId) {
        throw new Error('Missing Wave.');
      }
      return createStoryComment(userId, storyId, body);
    },
    onSettled: () => {
      if (storyId) {
        void queryClient.invalidateQueries({ queryKey: socialKeys.storyComments(storyId) });
      }
    },
  });
}

export function useShareStory() {
  const startChat = useGetOrCreateConversation();
  const send = useSendMessage();
  return useMutation({
    mutationFn: async (input: { storyId: string; friendId: string; url: string; note?: string }) => {
      const conversation = await startChat.mutateAsync(input.friendId);
      const note = input.note?.trim();
      await send.mutateAsync({
        conversation_id: conversation.id,
        body: note ? `${note}\n${input.url}` : input.url,
      });
      await notifyStoryShared(input.storyId, input.friendId);
    },
  });
}

export function useReels(limit = SOCIAL_PAGE_SIZE, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: socialKeys.reels(limit),
    enabled: options?.enabled !== false,
    retry: false,
    queryFn: async () => {
      try {
        return await fetchReels(limit);
      } catch {
        return [];
      }
    },
  });
}

export function useReel(id?: string | null) {
  return useQuery({
    queryKey: socialKeys.reel(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => fetchReel(id!),
  });
}

export function useCreateReel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateReelInput) => {
      const userId = requireUserId(user?.id);
      return createReel(userId, input);
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['reels'] });
      const previous = queryClient.getQueriesData<ReelItem[]>({ queryKey: ['reels'] });
      if (user?.id) {
        const optimistic: ReelItem = {
          id: `optimistic-${Date.now()}`,
          user_id: user.id,
          video_url: input.video_url,
          thumbnail_url: input.thumbnail_url ?? null,
          caption: input.caption?.trim() || null,
          challenge_id: input.challenge_id ?? null,
          duration_ms: input.duration_ms ?? null,
          created_at: new Date().toISOString(),
          profile: sessionAuthor(null, user.id) as ReelItem['profile'],
        };
        queryClient.setQueriesData<ReelItem[]>({ queryKey: ['reels'] }, (current) =>
          current ? [optimistic, ...current] : current,
        );
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSuccess: (reel) => {
      seedPublishedReel(queryClient, reel as ReelItem, { id: user?.id ?? (reel as ReelItem)?.user_id });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['reels'] });
      void queryClient.invalidateQueries({ queryKey: ['host-round-prompt'] });
    },
  });
}

export function useConversations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: socialKeys.conversations(user?.id ?? ''),
    enabled: Boolean(user?.id),
    queryFn: () => fetchConversations(user!.id),
  });
}

export function useConversation(conversationId?: string | null) {
  const { user } = useAuth();
  const valid = Boolean(conversationId && conversationId !== 'new');
  const list = useConversations();
  const cached = list.data?.find((row) => row.id === conversationId) ?? null;
  const fallback = useQuery({
    queryKey: socialKeys.conversation(conversationId ?? ''),
    enabled: Boolean(user?.id && valid),
    queryFn: () => fetchConversation(user!.id, conversationId!),
  });
  return {
    data: cached ?? fallback.data ?? null,
    isLoading: Boolean(valid && !cached && fallback.isLoading),
    error:
      fallback.error ??
      (valid &&
      !cached &&
      fallback.isSuccess &&
      !fallback.data
        ? new Error('Couldn’t open this chat.')
        : null),
    refetch: fallback.refetch,
  };
}

export function useMessages(conversationId?: string | null) {
  const queryClient = useQueryClient();
  const valid = Boolean(conversationId && conversationId !== 'new');
  const query = useQuery({
    queryKey: socialKeys.messages(conversationId ?? ''),
    enabled: valid,
    queryFn: () => fetchMessages(conversationId!),
  });

  useEffect(() => {
    if (!valid || !conversationId) {
      return;
    }
    const channelName = `messages:${conversationId}`;
    for (const existing of supabase.getChannels()) {
      if (existing.topic === channelName || existing.topic === `realtime:${channelName}`) {
        void supabase.removeChannel(existing);
      }
    }
    const channel = supabase.channel(channelName);
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as Message;
          if (!row?.id) {
            return;
          }
          queryClient.setQueryData<Message[]>(socialKeys.messages(conversationId), (current) => {
            const withoutOptimistic = (current ?? []).filter(
              (item) => item.id !== row.id && !item.id.startsWith('optimistic-'),
            );
            if (withoutOptimistic.some((item) => item.id === row.id)) {
              return current;
            }
            return [...withoutOptimistic, row].sort(
              (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
            );
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient, valid]);

  return query;
}

export function useSendMessage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SendMessageInput) => {
      const userId = requireUserId(user?.id);
      return sendMessage(userId, input);
    },
    onMutate: async (input) => {
      const userId = user?.id;
      if (!userId) {
        return;
      }
      const messageKey = socialKeys.messages(input.conversation_id);
      const conversationKey = socialKeys.conversations(userId);
      await queryClient.cancelQueries({ queryKey: messageKey });
      await queryClient.cancelQueries({ queryKey: conversationKey });
      const previousMessages = queryClient.getQueryData<Message[]>(messageKey);
      const previousConversations = queryClient.getQueryData<ConversationPreview[]>(conversationKey);
      const now = new Date().toISOString();
      const optimistic: Message = {
        id: `optimistic-${Date.now()}`,
        conversation_id: input.conversation_id,
        sender_id: userId,
        body: input.body?.trim() || null,
        media_url: input.media_url?.trim() || null,
        created_at: now,
      };
      queryClient.setQueryData<Message[]>(messageKey, [...(previousMessages ?? []), optimistic]);
      queryClient.setQueryData<ConversationPreview[]>(conversationKey, (current) => {
        if (!current) {
          return current;
        }
        return [...current]
          .map((conversation) =>
            conversation.id === input.conversation_id
              ? {
                  ...conversation,
                  updated_at: now,
                  last_message: optimistic,
                  unread: false,
                }
              : conversation,
          )
          .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
      });
      return { previousMessages, previousConversations, messageKey, conversationKey };
    },
    onError: (_error, _input, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(context.messageKey, context.previousMessages);
      }
      if (context?.previousConversations) {
        queryClient.setQueryData(context.conversationKey, context.previousConversations);
      }
    },
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: socialKeys.messages(input.conversation_id) });
      if (user?.id) {
        void queryClient.invalidateQueries({ queryKey: socialKeys.conversations(user.id) });
      }
    },
  });
}

export function useMarkConversationRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const userId = requireUserId(user?.id);
      await markConversationRead(userId, conversationId);
      return conversationId;
    },
    onMutate: async (conversationId) => {
      if (!user?.id) {
        return;
      }
      const key = socialKeys.conversations(user.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ConversationPreview[]>(key);
      queryClient.setQueryData<ConversationPreview[]>(key, (current) =>
        current?.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, unread: false } : conversation,
        ),
      );
      return { previous, key };
    },
    onError: (_error, _conversationId, context) => {
      if (context?.previous && context.key) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },
    onSettled: () => {
      if (user?.id) {
        void queryClient.invalidateQueries({ queryKey: socialKeys.conversations(user.id) });
      }
    },
  });
}

export function useGetOrCreateConversation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (otherUserId: string) => {
      const userId = requireUserId(user?.id);
      return getOrCreateDirectConversation(userId, otherUserId);
    },
    onSettled: () => {
      if (user?.id) {
        void queryClient.invalidateQueries({ queryKey: socialKeys.conversations(user.id) });
      }
    },
  });
}

export function useCreateGroupConversation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memberIds: string[]) => createGroupConversation(memberIds),
    onSettled: () => {
      if (user?.id) {
        void queryClient.invalidateQueries({ queryKey: socialKeys.conversations(user.id) });
      }
    },
  });
}
