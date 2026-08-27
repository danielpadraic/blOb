import type { QueryClient } from '@tanstack/react-query';

import {
  firstRouteParam,
  type ChallengeLoadSnapshot,
} from '@/lib/challengeLoad';
import { fetchChallengeById, normalizeChallenge } from '@/lib/challenges';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { queryClient as appQueryClient } from '@/lib/queryClient';
import { challengeDetailHref } from '@/lib/routes';
import type { FeedChallengePreview } from '@/lib/social';
import type { ChallengeWithStats } from '@/lib/types';

type ChallengeHref = ReturnType<typeof challengeDetailHref>;

export type ChallengeHeroRow = ChallengeWithStats & { preview_hero?: boolean };

const lastGoodById = new Map<string, ChallengeWithStats>();

export function challengeSnapshotHasIdentity(
  row: {
    title?: string | null;
    task?: string | null;
    tasks?: Array<{ title?: string | null } | string> | null;
    extra_tasks?: Array<{ title?: string | null } | string> | null;
  } | null | undefined,
): boolean {
  return Boolean(challengeDisplayTitle(row));
}

export function isHollowChallengeSeed(
  row: ChallengeWithStats | ChallengeLoadSnapshot | null | undefined,
): boolean {
  if (!row?.id) {
    return true;
  }
  if (challengeSnapshotHasIdentity(row)) {
    return false;
  }
  if (String(row.cover_image_url ?? '').trim()) {
    return false;
  }
  return Number(row.prize_pool ?? 0) <= 0;
}

export function rememberLastGoodChallenge(row: ChallengeWithStats | null | undefined): void {
  const id = firstRouteParam(row?.id);
  if (!id || !row || row.id !== id || !challengeSnapshotHasIdentity(row)) {
    return;
  }
  lastGoodById.set(id, row);
}

export function peekLastGoodChallenge(id: string | undefined): ChallengeWithStats | undefined {
  const challengeId = firstRouteParam(id);
  if (!challengeId) {
    return undefined;
  }
  const row = lastGoodById.get(challengeId);
  return row?.id === challengeId ? row : undefined;
}

export function challengeHasDurationHint(row: {
  days_required?: number | null;
  target_count?: number | null;
  length_value?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
} | null | undefined): boolean {
  if (!row) {
    return false;
  }
  if (Number(row.length_value) > 0) {
    return true;
  }
  if (Number(row.days_required) > 0) {
    return true;
  }
  if (Number(row.target_count) > 0) {
    return true;
  }
  return Boolean(row.starts_at && row.ends_at);
}

export function challengeFromFeedPreview(preview: FeedChallengePreview): ChallengeHeroRow {
  const hasDuration = challengeHasDurationHint(preview);
  const normalized = normalizeChallenge({
    ...preview,
    days_required: hasDuration ? preview.days_required : 0,
    target_count: hasDuration ? preview.target_count : 0,
    length_value: hasDuration ? preview.length_value : null,
  } as Record<string, unknown>);
  return {
    ...normalized,
    days_required: hasDuration ? normalized.days_required : 0,
    target_count: hasDuration ? normalized.target_count : 0,
    participant_count: 0,
    preview_hero: true,
  };
}

export function seedChallengeFeedPreview(
  snapshot: ChallengeLoadSnapshot | ChallengeWithStats | FeedChallengePreview | null | undefined,
  client: Pick<QueryClient, 'getQueryData' | 'setQueryData'> = appQueryClient,
): void {
  const id = firstRouteParam(snapshot?.id);
  if (!id || !snapshot || !challengeSnapshotHasIdentity(snapshot)) {
    return;
  }
  const existing = client.getQueryData<FeedChallengePreview>(['challenge-feed-preview', id]);
  if (existing?.id === id && challengeSnapshotHasIdentity(existing)) {
    return;
  }
  const row = snapshot as FeedChallengePreview & ChallengeLoadSnapshot;
  client.setQueryData(['challenge-feed-preview', id], {
    id,
    title: String(row.title ?? ''),
    status: String(row.status ?? 'open'),
    is_official: Boolean(row.is_official),
    buy_in_amount: Number(row.buy_in_amount ?? 0),
    prize_pool: Number(row.prize_pool ?? 0),
    currency: row.currency ?? null,
    cover_image_url: row.cover_image_url ?? null,
    created_by: row.created_by ?? null,
    visibility: row.visibility ?? null,
    challenge_lane: typeof row.challenge_lane === 'string' ? row.challenge_lane : null,
    starts_at: row.starts_at ?? null,
    ends_at: row.ends_at ?? null,
    task: row.task ?? null,
    tasks: row.tasks ?? null,
    days_required: row.days_required ?? null,
    target_count: row.target_count ?? null,
  } satisfies FeedChallengePreview);
}

export function resolveChallengeHero(input: {
  id?: string;
  queryData?: ChallengeWithStats | null;
  preview?: FeedChallengePreview | null;
}): ChallengeHeroRow | undefined {
  const id = firstRouteParam(input.id);
  if (!id) {
    return undefined;
  }
  const queryRow = input.queryData?.id === id ? input.queryData : undefined;
  if (queryRow && !isHollowChallengeSeed(queryRow)) {
    return queryRow;
  }
  const lastGood = peekLastGoodChallenge(id);
  if (lastGood) {
    return lastGood;
  }
  if (input.preview?.id === id && challengeSnapshotHasIdentity(input.preview)) {
    return challengeFromFeedPreview(input.preview);
  }
  return undefined;
}

export async function loadChallengeDetail(
  id: string,
  snapshot?: ChallengeLoadSnapshot | ChallengeWithStats | null,
): Promise<ChallengeWithStats> {
  const usable = snapshot && challengeSnapshotHasIdentity(snapshot) ? snapshot : undefined;
  const challenge = await fetchChallengeById(id, usable);
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
  const existing = client.getQueryData<ChallengeWithStats>(['challenge', id]);
  if (existing && !isHollowChallengeSeed(existing)) {
    return id;
  }
  if (!challengeSnapshotHasIdentity(snapshot)) {
    return id;
  }
  try {
    client.setQueryData(['challenge', id], {
      ...normalizeChallenge(snapshot as Record<string, unknown>),
      participant_count: Number(
        (snapshot as { participant_count?: number }).participant_count ?? 0,
      ),
    } satisfies ChallengeWithStats);
    seedChallengeFeedPreview({ ...snapshot, id }, client);
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
  if (input.snapshot && challengeSnapshotHasIdentity(input.snapshot)) {
    seedChallengeDetailQuery({ ...input.snapshot, id }, client);
  } else {
    seedChallengeFeedPreview(input.snapshot ? { ...input.snapshot, id } : null, client);
  }
  prefetchChallengeDetail(id, input.snapshot, client);
  router.push(challengeDetailHref(id, input.returnTo ?? 'lobby', input.postId, input.extra));
  return true;
}
