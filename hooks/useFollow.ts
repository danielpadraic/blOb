import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { reportBadgeActivity } from '@/lib/badgeActivity';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/utils/errors';
import { useAuth } from '@/hooks/useAuth';

export function useFollowState(userId?: string | null) {
  const { user } = useAuth();
  const isSelf = Boolean(userId && user?.id === userId);

  const followingQuery = useQuery({
    queryKey: ['follow', user?.id, userId],
    enabled: Boolean(user?.id && userId && !isSelf),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', user!.id)
        .eq('following_id', userId!)
        .maybeSingle();
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      return Boolean(data);
    },
  });

  const countsQuery = useQuery({
    queryKey: ['follow-counts', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<{ followers: number; following: number }> => {
      const [followers, following] = await Promise.all([
        supabase
          .from('follows')
          .select('follower_id', { count: 'exact', head: true })
          .eq('following_id', userId!),
        supabase
          .from('follows')
          .select('following_id', { count: 'exact', head: true })
          .eq('follower_id', userId!),
      ]);
      return {
        followers: followers.count ?? 0,
        following: following.count ?? 0,
      };
    },
  });

  return {
    isSelf,
    isFollowing: followingQuery.data ?? false,
    followers: countsQuery.data?.followers ?? 0,
    following: countsQuery.data?.following ?? 0,
    isLoading: followingQuery.isLoading || countsQuery.isLoading,
  };
}

export function useToggleFollow(userId?: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (nextFollowing: boolean) => {
      if (!user || !userId) {
        throw new Error('You need to be signed in.');
      }
      if (nextFollowing) {
        const { error } = await supabase.from('follows').insert({
          follower_id: user.id,
          following_id: userId,
        });
        if (error) {
          throw new Error(getErrorMessage(error));
        }
        return;
      }
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', userId);
      if (error) {
        throw new Error(getErrorMessage(error));
      }
    },
    onMutate: async (nextFollowing) => {
      await queryClient.cancelQueries({ queryKey: ['follow', user?.id, userId] });
      await queryClient.cancelQueries({ queryKey: ['follow-counts', userId] });
      const previousFollow = queryClient.getQueryData<boolean>(['follow', user?.id, userId]);
      const previousCounts = queryClient.getQueryData<{ followers: number; following: number }>([
        'follow-counts',
        userId,
      ]);
      queryClient.setQueryData(['follow', user?.id, userId], nextFollowing);
      if (previousCounts) {
        queryClient.setQueryData(['follow-counts', userId], {
          ...previousCounts,
          followers: Math.max(previousCounts.followers + (nextFollowing ? 1 : -1), 0),
        });
      }
      return { previousFollow, previousCounts };
    },
    onError: (_error, _next, context) => {
      if (context?.previousFollow !== undefined) {
        queryClient.setQueryData(['follow', user?.id, userId], context.previousFollow);
      }
      if (context?.previousCounts) {
        queryClient.setQueryData(['follow-counts', userId], context.previousCounts);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['follow', user?.id, userId] });
      void queryClient.invalidateQueries({ queryKey: ['follow-counts', userId] });
      if (user?.id) {
        void queryClient.invalidateQueries({ queryKey: ['following', user.id] });
      }
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: ['followers', userId] });
      }
      void reportBadgeActivity();
    },
  });
}
