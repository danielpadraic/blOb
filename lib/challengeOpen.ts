import type { QueryClient } from '@tanstack/react-query';

import {
  firstRouteParam,
  type ChallengeLoadSnapshot,
} from '@/lib/challengeLoad';
import { fetchChallengeById, normalizeChallenge } from '@/lib/challenges';
import { queryClient as appQueryClient } from '@/lib/queryClient';
import { challengeDetailHref } from '@/lib/routes';
import type { ChallengeWithStats } from '@/lib/types';

type ChallengeHref = ReturnType<typeof challengeDetailHref>;

export async function loadChallengeDetail(
  id: string,
  snapshot?: ChallengeLoadSnapshot | ChallengeWithStats | null,
): Promise<ChallengeWithStats> {
  const challenge = await fetchChallengeById(id, snapshot);
  return {
    ...challenge,
    participant_count: Number(
      (snapshot as { participant_count?: number } | null | undefined)?.participant_count ?? 0,
    ),
  };
}

export function seedChallengeDetailQuery(
  snapshot: ChallengeLoadSnapshot | ChallengeWithStats | null | undefined,
  client: Pick<QueryClient, 'getQueryData' | 'setQueryData'> = appQueryClient,
): string {
  const id = firstRouteParam(snapshot?.id);
  if (!id || !snapshot) {
    return '';
  }
  if (client.getQueryData(['challenge', id])) {
    return id;
  }
  try {
    client.setQueryData(['challenge', id], {
      ...normalizeChallenge(snapshot as Record<string, unknown>),
      participant_count: Number(
        (snapshot as { participant_count?: number }).participant_count ?? 0,
      ),
    } satisfies ChallengeWithStats);
  } catch {
    // Snapshot is only a shell. Never block View.
  }
  return id;
}

export function prefetchChallengeDetail(
  id: string,
  snapshot?: ChallengeLoadSnapshot | ChallengeWithStats | null,
  client: Pick<QueryClient, 'prefetchQuery'> = appQueryClient,
): void {
  const challengeId = firstRouteParam(id);
  if (!challengeId) {
    return;
  }
  void client.prefetchQuery({
    queryKey: ['challenge', challengeId],
    queryFn: () => loadChallengeDetail(challengeId, snapshot),
  });
}

export function openChallengeLobby(
  router: { push: (href: ChallengeHref) => void },
  input: {
    id?: string | null;
    snapshot?: ChallengeLoadSnapshot | ChallengeWithStats | null;
    returnTo?: 'lobby' | 'feed';
    postId?: string | null;
    extra?: { tab?: 'overview' | 'board' | 'feed'; receipt?: boolean };
  },
  client: QueryClient = appQueryClient,
): boolean {
  const id = firstRouteParam(input.id) || firstRouteParam(input.snapshot?.id);
  if (!id) {
    return false;
  }
  seedChallengeDetailQuery(input.snapshot ? { ...input.snapshot, id } : { id }, client);
  prefetchChallengeDetail(id, input.snapshot, client);
  router.push(challengeDetailHref(id, input.returnTo ?? 'lobby', input.postId, input.extra));
  return true;
}
