import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  discardChallengeDraft,
  fetchChallengeDraft,
  fetchChallengeDrafts,
  fetchReusableChallenges,
  saveChallengeDraft,
  type ChallengeDraft,
  type ReusableChallenge,
} from '@/lib/challengeDraft';
import { useAuth } from '@/hooks/useAuth';

export function challengeDraftQueryKey(userId: string | undefined) {
  return ['challenge-draft', userId] as const;
}

export function challengeDraftsQueryKey(userId: string | undefined) {
  return ['challenge-drafts', userId] as const;
}

function syncDraftCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string | undefined,
  drafts: ChallengeDraft[] | null,
) {
  queryClient.setQueryData(challengeDraftsQueryKey(userId), drafts);
  queryClient.setQueryData(challengeDraftQueryKey(userId), drafts?.[0] ?? null);
}

export function useChallengeDraft() {
  const { user } = useAuth();
  return useQuery({
    queryKey: challengeDraftQueryKey(user?.id),
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<ChallengeDraft | null> => fetchChallengeDraft(user!.id),
  });
}

export function useChallengeDrafts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: challengeDraftsQueryKey(user?.id),
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<ChallengeDraft[]> => fetchChallengeDrafts(user!.id),
  });
}

export function useSaveChallengeDraft() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      draft: Omit<ChallengeDraft, 'userId' | 'updatedAt' | 'title'> & {
        updatedAt?: string;
        title?: string;
        id?: string | null;
      },
    ) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      return saveChallengeDraft({
        ...draft,
        id: draft.id ?? null,
        title: draft.title ?? '',
        userId: user.id,
        updatedAt: draft.updatedAt ?? new Date().toISOString(),
      });
    },
    onSuccess: (draft) => {
      queryClient.setQueryData(challengeDraftQueryKey(user?.id), draft);
      queryClient.setQueryData(challengeDraftsQueryKey(user?.id), (current: ChallengeDraft[] | undefined) => {
        const rest = (current ?? []).filter((item) => item.id && item.id !== draft.id);
        return [draft, ...rest];
      });
    },
  });
}

export function useDiscardChallengeDraft() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const listKey = challengeDraftsQueryKey(user?.id);
  const latestKey = challengeDraftQueryKey(user?.id);

  return useMutation({
    mutationFn: async (draftId?: string | null) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      await discardChallengeDraft(user.id, draftId);
      return draftId ?? null;
    },
    onMutate: async (draftId) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      await queryClient.cancelQueries({ queryKey: latestKey });
      const previousList = queryClient.getQueryData<ChallengeDraft[]>(listKey);
      const previousLatest = queryClient.getQueryData<ChallengeDraft | null>(latestKey);
      const next = (previousList ?? []).filter((item) => (draftId ? item.id !== draftId : false));
      syncDraftCaches(queryClient, user?.id, draftId ? next : []);
      return { previousList, previousLatest };
    },
    onError: (_error, _vars, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(listKey, context.previousList);
      }
      if (context && 'previousLatest' in context) {
        queryClient.setQueryData(latestKey, context.previousLatest);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({ queryKey: latestKey });
    },
  });
}

export function useReusableChallenges() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['reusable-challenges', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<ReusableChallenge[]> => fetchReusableChallenges(user!.id),
  });
}
