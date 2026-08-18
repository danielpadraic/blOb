import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { reportBadgeActivity } from '@/lib/badgeActivity';
import {
  SOCIAL_PAGE_SIZE,
  acceptFriendRequest,
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
  fetchFriends,
  fetchFriendshipSnapshot,
  fetchMessages,
  fetchPublicProfilesByIds,
  fetchReels,
  fetchStory,
  fetchStoryChallengeOptions,
  fetchViewedStoryIds,
  groupStories,
  otherFriendshipUserId,
  searchPeople,
  followUser,
  getOrCreateDirectConversation,
  markConversationRead,
  rejectFriendRequest,
  sendFriendRequest,
  sendMessage,
  unfollowUser,
  viewStory,
  type ConversationPreview,
  type CreateFeedEventInput,
  type CreateReelInput,
  type CreateStoryInput,
  type FollowEdge,
  type FriendEdge,
  type FriendshipSnapshot,
  type FeedEventItem,
  type SendMessageInput,
} from '@/lib/social';
import type { Friendship, Message, Reel, Story } from '@/types/social';

export type {
  ConversationPreview,
  CreateFeedEventInput,
  CreateReelInput,
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
  requests: (userId: string) => ['friend-requests', userId] as const,
  peopleSearch: (userId: string, term: string) => ['people-search', userId, term] as const,
  friendship: (userId: string, targetId: string) => ['friendship', userId, targetId] as const,
  follow: (userId: string, targetId: string) => ['follow', userId, targetId] as const,
  followCounts: (userId: string) => ['follow-counts', userId] as const,
  feed: (limit: number) => ['feed-events', limit] as const,
  stories: () => ['stories', 'active'] as const,
  story: (id: string) => ['story', id] as const,
  storyViews: (userId: string) => ['story-views', userId] as const,
  storyAuthors: (ids: string[]) => ['story-authors', ids] as const,
  storyChallengePreviews: (ids: string[]) => ['story-challenge-previews', ids] as const,
  reels: (limit: number) => ['reels', limit] as const,
  conversations: (userId: string) => ['conversations', userId] as const,
  conversation: (id: string) => ['conversation', id] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
};

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
  void queryClient.invalidateQueries({ queryKey: socialKeys.requests(userId) });
  void queryClient.invalidateQueries({ queryKey: socialKeys.requests(targetUserId) });
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

export function useFollowing(userId?: string | null) {
  const { user } = useAuth();
  const id = userId ?? user?.id ?? null;
  return useQuery({
    queryKey: socialKeys.following(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => fetchFollowing(id!),
  });
}

export function useFriends(userId?: string | null) {
  const { user } = useAuth();
  const id = userId ?? user?.id ?? null;
  return useQuery({
    queryKey: socialKeys.friends(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => fetchFriends(id!),
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
  const term = query.trim();
  return useQuery({
    queryKey: socialKeys.peopleSearch(user?.id ?? '', term),
    enabled: Boolean(user?.id && term.length >= 2),
    queryFn: () => searchPeople(term, user!.id),
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

export function useStoryGroups() {
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
    if (profile) {
      map.set(profile.id, profile);
    }
    for (const friend of friendsQuery.data ?? []) {
      if (friend.profile) {
        map.set(friend.profile.id, friend.profile);
      }
    }
    for (const follow of followingQuery.data ?? []) {
      if (follow.profile) {
        map.set(follow.profile.id, follow.profile);
      }
    }
    for (const author of authorsQuery.data ?? []) {
      map.set(author.id, author);
    }
    return map;
  }, [authorsQuery.data, friendsQuery.data, followingQuery.data, profile]);

  const groups = useMemo(
    () =>
      groupStories({
        stories: storiesQuery.data ?? [],
        userId: user?.id,
        profiles,
        circleIds,
        includeEmptyOwn: true,
      }),
    [circleIds, profiles, storiesQuery.data, user?.id],
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
    queryFn: fetchActiveStories,
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
        const optimistic: Story = {
          id: `optimistic-${now.getTime()}`,
          user_id: user.id,
          media_url: input.media_url,
          media_type: input.media_type,
          challenge_id: input.challenge_id ?? null,
          caption: input.caption?.trim() || null,
          expires_at: input.expires_at ?? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          created_at: now.toISOString(),
        };
        queryClient.setQueryData<Story[]>(socialKeys.stories(), [optimistic, ...(previous ?? [])]);
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(socialKeys.stories(), context.previous);
      }
    },
    onSettled: () => {
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

export function useReels(limit = SOCIAL_PAGE_SIZE) {
  return useQuery({
    queryKey: socialKeys.reels(limit),
    queryFn: () => fetchReels(limit),
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
      const previous = queryClient.getQueriesData<Reel[]>({ queryKey: ['reels'] });
      if (user?.id) {
        const optimistic: Reel = {
          id: `optimistic-${Date.now()}`,
          user_id: user.id,
          video_url: input.video_url,
          thumbnail_url: input.thumbnail_url ?? null,
          caption: input.caption?.trim() || null,
          challenge_id: input.challenge_id ?? null,
          duration_ms: input.duration_ms ?? null,
          created_at: new Date().toISOString(),
        };
        queryClient.setQueriesData<Reel[]>({ queryKey: ['reels'] }, (current) =>
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
      void queryClient.invalidateQueries({ queryKey: ['reels'] });
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
  const list = useConversations();
  const cached = list.data?.find((row) => row.id === conversationId) ?? null;
  const fallback = useQuery({
    queryKey: socialKeys.conversation(conversationId ?? ''),
    enabled: Boolean(user?.id && conversationId && !cached && !list.isLoading),
    queryFn: () => fetchConversation(user!.id, conversationId!),
  });
  return {
    data: cached ?? fallback.data ?? null,
    isLoading: list.isLoading || fallback.isLoading,
    error: list.error ?? fallback.error,
  };
}

export function useMessages(conversationId?: string | null) {
  return useQuery({
    queryKey: socialKeys.messages(conversationId ?? ''),
    enabled: Boolean(conversationId),
    queryFn: () => fetchMessages(conversationId!),
  });
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
