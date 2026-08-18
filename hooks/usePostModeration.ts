import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { getErrorMessage, isMissingRelationError } from '@/utils/errors';

export function useHiddenPostIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['post-hides', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('post_hides').select('post_id');
      if (error) {
        if (isMissingRelationError(error)) {
          return [];
        }
        throw new Error(getErrorMessage(error));
      }
      return (data ?? []).map((row) => row.post_id);
    },
  });
}

export function useMutedUserIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['mutes', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('mutes').select('muted_user_id');
      if (error) {
        if (isMissingRelationError(error)) {
          return [];
        }
        throw new Error(getErrorMessage(error));
      }
      return (data ?? []).map((row) => row.muted_user_id);
    },
  });
}

export function useHidePost() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const { error } = await supabase.from('post_hides').insert({ user_id: user.id, post_id: postId });
      if (error && !String(error.message).toLowerCase().includes('duplicate')) {
        throw new Error(getErrorMessage(error));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['post-hides', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useReportPost() {
  return useMutation({
    mutationFn: async (input: { postId: string; reason: string }) => {
      const { error } = await supabase.rpc('report_post', {
        p_post_id: input.postId,
        p_reason: input.reason,
      });
      if (error) {
        throw new Error(getErrorMessage(error));
      }
    },
  });
}

export function useSoftDeletePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.rpc('soft_delete_post', { p_post_id: postId });
      if (error) {
        throw new Error(getErrorMessage(error));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useToggleMute() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; muted: boolean }) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      if (input.muted) {
        const { error } = await supabase
          .from('mutes')
          .delete()
          .eq('user_id', user.id)
          .eq('muted_user_id', input.userId);
        if (error) {
          throw new Error(getErrorMessage(error));
        }
        return;
      }
      const { error } = await supabase.from('mutes').insert({
        user_id: user.id,
        muted_user_id: input.userId,
      });
      if (error && !String(error.message).toLowerCase().includes('duplicate')) {
        throw new Error(getErrorMessage(error));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mutes', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
