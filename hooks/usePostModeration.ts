import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { copy } from '@/lib/copy';
import { clearSilencedAuthorCache } from '@/lib/moderation';
import { fetchBlockedPeerIds, fetchPublicProfilesByIds } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { PublicProfile } from '@/lib/types';
import { getErrorMessage, isMissingRelationError } from '@/utils/errors';

export type ModeratedPerson = {
  userId: string;
  createdAt: string;
  profile: PublicProfile | null;
};

function stripAuthorFromFeeds(queryClient: QueryClient, authorId: string) {
  queryClient.setQueriesData({ queryKey: ['feed'] }, (current) => {
    if (Array.isArray(current)) {
      return current.filter(
        (row) => !row || typeof row !== 'object' || row.author_id !== authorId,
      );
    }
    if (
      current &&
      typeof current === 'object' &&
      'author_id' in current &&
      current.author_id === authorId
    ) {
      return null;
    }
    return current;
  });
}

function stripPostFromFeeds(queryClient: QueryClient, postId: string) {
  queryClient.setQueriesData({ queryKey: ['feed'] }, (current) => {
    if (Array.isArray(current)) {
      return current.filter((row) => !row || typeof row !== 'object' || row.id !== postId);
    }
    if (current && typeof current === 'object' && 'id' in current && current.id === postId) {
      return null;
    }
    return current;
  });
}

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

/** Everyone the viewer can no longer reach, whichever side blocked. */
export function useBlockedUserIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['blocked-ids', user?.id],
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      try {
        return [...(await fetchBlockedPeerIds(user!.id))];
      } catch (error) {
        if (isMissingRelationError(error)) {
          return [];
        }
        throw new Error(getErrorMessage(error));
      }
    },
  });
}

/** Only the people I blocked, so the list can offer Unblock. */
export function useMyBlocks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-blocks', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<ModeratedPerson[]> => {
      const { data, error } = await supabase
        .from('blocks')
        .select('blocked_id, created_at')
        .order('created_at', { ascending: false });
      if (error) {
        if (isMissingRelationError(error)) {
          return [];
        }
        throw new Error(getErrorMessage(error));
      }
      return withProfiles(
        (data ?? []).map((row) => ({ userId: row.blocked_id, createdAt: row.created_at })),
      );
    },
  });
}

export function useMyMutes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-mutes', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<ModeratedPerson[]> => {
      const { data, error } = await supabase
        .from('mutes')
        .select('muted_user_id, created_at')
        .order('created_at', { ascending: false });
      if (error) {
        if (isMissingRelationError(error)) {
          return [];
        }
        throw new Error(getErrorMessage(error));
      }
      return withProfiles(
        (data ?? []).map((row) => ({ userId: row.muted_user_id, createdAt: row.created_at })),
      );
    },
  });
}

async function withProfiles(
  rows: { userId: string; createdAt: string }[],
): Promise<ModeratedPerson[]> {
  const ids = [...new Set(rows.map((row) => row.userId).filter(Boolean))];
  if (ids.length === 0) {
    return [];
  }
  let byId = new Map<string, PublicProfile>();
  try {
    const profiles = await fetchPublicProfilesByIds(ids);
    byId = new Map(profiles.map((profile) => [profile.id, profile]));
  } catch {
    // A missing profile still deserves an Unblock row.
  }
  return rows.map((row) => ({ ...row, profile: byId.get(row.userId) ?? null }));
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
    onSuccess: (_data, postId) => {
      queryClient.setQueryData(['post-hides', user?.id], (current: string[] | undefined) =>
        current?.includes(postId) ? current : [...(current ?? []), postId],
      );
      stripPostFromFeeds(queryClient, postId);
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const { error } = await supabase
        .from('posts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', postId)
        .eq('author_id', user.id);
      if (error) {
        throw new Error(copy('error.deletePost'));
      }
    },
    onSuccess: (_data, postId) => {
      stripPostFromFeeds(queryClient, postId);
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useRemoveFromWall() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const { error } = await supabase.rpc('remove_post_from_wall', { p_post_id: postId });
      if (error) {
        throw new Error(getErrorMessage(error));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

/** Everything the graph knows about one person, after block or unblock. */
function invalidateRelationship(
  queryClient: QueryClient,
  userId: string | undefined,
) {
  clearSilencedAuthorCache();
  void queryClient.invalidateQueries({ queryKey: ['feed'] });
  void queryClient.invalidateQueries({ queryKey: ['mutes', userId] });
  void queryClient.invalidateQueries({ queryKey: ['my-mutes', userId] });
  void queryClient.invalidateQueries({ queryKey: ['blocked-ids', userId] });
  void queryClient.invalidateQueries({ queryKey: ['my-blocks', userId] });
  void queryClient.invalidateQueries({ queryKey: ['blocked-peers', userId] });
  void queryClient.invalidateQueries({ queryKey: ['public-profile'] });
  void queryClient.invalidateQueries({ queryKey: ['friendship'] });
  void queryClient.invalidateQueries({ queryKey: ['friends'] });
  void queryClient.invalidateQueries({ queryKey: ['friend-count'] });
  void queryClient.invalidateQueries({ queryKey: ['follow'] });
  void queryClient.invalidateQueries({ queryKey: ['following'] });
  void queryClient.invalidateQueries({ queryKey: ['followers'] });
  void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
  void queryClient.invalidateQueries({ queryKey: ['people-search'] });
  void queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
  void queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
}

export function useBlockUser() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const { error } = await supabase.rpc('block_user', { p_target: targetUserId });
      if (error) {
        throw new Error(getErrorMessage(error));
      }
    },
    onSuccess: (_data, targetUserId) => {
      stripAuthorFromFeeds(queryClient, targetUserId);
      invalidateRelationship(queryClient, user?.id);
    },
  });
}

export function useUnblockUser() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const { error } = await supabase.rpc('unblock_user', { p_target: targetUserId });
      if (error) {
        throw new Error(getErrorMessage(error));
      }
    },
    onSuccess: () => {
      invalidateRelationship(queryClient, user?.id);
    },
  });
}

/** `muted` is the state right now, so passing true unmutes. */
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
    onSuccess: (_data, input) => {
      clearSilencedAuthorCache();
      if (!input.muted) {
        stripAuthorFromFeeds(queryClient, input.userId);
      }
      void queryClient.invalidateQueries({ queryKey: ['mutes', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['my-mutes', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
  });
}
