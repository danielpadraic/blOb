import type { QueryClient } from '@tanstack/react-query';

import {
  firstRouteParam,
  type ChallengeLoadSnapshot,
} from '@/lib/challengeLoad';
import { fetchChallengeById, normalizeChallenge } from '@/lib/challenges';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { queryClient as appQueryClient } from '@/lib/queryClient';
import { challengeDetailHref } from '@/lib/routes';
import { pushChallengeHref } from '@/lib/challengeNav';
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
  return !challengeSnapshotHasIdentity(row);
}

/** Last good for THIS id only — never copy another challenge’s title or prize. */
export function fillChallengeFromLastGood<T extends { id?: string | null }>(
  live: T | null | undefined,
  seed: T | null | undefined,
): T | undefined {
  const liveId = firstRouteParam(live?.id);
  const seedId = firstRouteParam(seed?.id);
  if (!liveId || !live) {
    return seedId && seed && seedId === liveId ? seed : undefined;
  }
  if (!seed || seedId !== liveId) {
    return live;
  }
  const liveRow = live as T & {
    title?: string | null;
    task?: string | null;
    prize_pool?: number | null;
    cumulative_target?: number | null;
    distance_meters_required?: number | null;
    target_count?: number | null;
    length_value?: number | null;
    days_required?: number | null;
    format?: string | null;
    challenge_type?: string | null;
    cover_image_url?: string | null;
  };
  const seedRow = seed as typeof liveRow;
  const named = challengeDisplayTitle(liveRow) || challengeDisplayTitle(seedRow);
  return {
    ...seedRow,
    ...liveRow,
    id: liveId,
    title: named || liveRow.title || seedRow.title,
    task: String(liveRow.task ?? '').trim() || seedRow.task,
    prize_pool: Number(liveRow.prize_pool) > 0 ? liveRow.prize_pool : seedRow.prize_pool,
    cumulative_target:
      Number(liveRow.cumulative_target) > 0 ? liveRow.cumulative_target : seedRow.cumulative_target,
    distance_meters_required:
      Number(liveRow.distance_meters_required) > 0
        ? liveRow.distance_meters_required
        : seedRow.distance_meters_required,
    target_count: Number(liveRow.target_count) > 0 ? liveRow.target_count : seedRow.target_count,
    length_value: Number(liveRow.length_value) > 0 ? liveRow.length_value : seedRow.length_value,
    days_required: Number(liveRow.days_required) > 0 ? liveRow.days_required : seedRow.days_required,
    format: liveRow.format || seedRow.format,
    challenge_type: liveRow.challenge_type || seedRow.challenge_type,
    cover_image_url: String(liveRow.cover_image_url ?? '').trim() || seedRow.cover_image_url,
  };
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
  duration_days?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  cumulative_target?: number | null;
  distance_meters_required?: number | null;
  challenge_type?: string | null;
  format?: string | null;
} | null | undefined): boolean {
  if (!row) {
    return false;
  }
  if (Number(row.duration_days) > 0) {
    return true;
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
  if (Number(row.cumulative_target) > 0) {
    return true;
  }
  if (Number(row.distance_meters_required) > 0) {
    return true;
  }
  const type = String(row.challenge_type ?? '').toLowerCase();
  const format = String(row.format ?? '').toLowerCase();
  if (type === 'cumulative' || format === 'cumulative' || type === 'points') {
    return true;
  }
  return Boolean(row.starts_at && row.ends_at);
}

export function challengeFromFeedPreview(preview: FeedChallengePreview): ChallengeHeroRow {
  const normalized = normalizeChallenge({
    ...preview,
    cumulative_target: preview.cumulative_target,
    distance_meters_required: preview.distance_meters_required,
    format: preview.format,
    challenge_type: preview.challenge_type,
  } as Record<string, unknown>);
  return {
    ...normalized,
    participant_count: 0,
    preview_hero: true,
  };
}

export const CHALLENGE_PREVIEW_KEY = 'challenge-preview' as const;

export function challengePreviewQueryKey(id: string) {
  return [CHALLENGE_PREVIEW_KEY, id] as const;
}

export function seedChallengeFeedPreview(
  snapshot: ChallengeLoadSnapshot | ChallengeWithStats | FeedChallengePreview | null | undefined,
  client: Pick<QueryClient, 'getQueryData' | 'setQueryData'> = appQueryClient,
): void {
  const id = firstRouteParam(snapshot?.id);
  if (!id || !snapshot || !challengeSnapshotHasIdentity(snapshot)) {
    return;
  }
  const existing = client.getQueryData<FeedChallengePreview>(challengePreviewQueryKey(id));
  if (existing?.id === id && challengeSnapshotHasIdentity(existing)) {
    return;
  }
  const row = snapshot as FeedChallengePreview & ChallengeLoadSnapshot;
  client.setQueryData(challengePreviewQueryKey(id), {
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
    timezone: row.timezone ?? null,
    task: row.task ?? null,
    tasks: row.tasks ?? null,
    days_required: row.days_required ?? null,
    target_count: row.target_count ?? null,
    length_value: row.length_value ?? null,
    challenge_type: typeof row.challenge_type === 'string' ? row.challenge_type : null,
    format: typeof row.format === 'string' ? row.format : null,
    cumulative_target: row.cumulative_target ?? null,
    distance_meters_required: row.distance_meters_required ?? null,
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
  const lastGood = peekLastGoodChallenge(id);
  if (queryRow && !isHollowChallengeSeed(queryRow)) {
    return fillChallengeFromLastGood(queryRow, lastGood) ?? queryRow;
  }
  if (lastGood?.id === id) {
    return fillChallengeFromLastGood(queryRow, lastGood) ?? lastGood;
  }
  if (input.preview?.id === id && challengeSnapshotHasIdentity(input.preview)) {
    return challengeFromFeedPreview(input.preview);
  }
  return queryRow?.id === id ? queryRow : undefined;
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
    const named = challengeDisplayTitle(snapshot);
    const normalized = normalizeChallenge(snapshot as Record<string, unknown>);
    client.setQueryData(['challenge', id], {
      ...normalized,
      title: named || normalized.title,
      task: String(snapshot.task ?? '').trim() || named || normalized.task,
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
    source?: string;
    pathname?: string | null;
  },
  client: QueryClient = appQueryClient,
): boolean {
  const id = firstRouteParam(input.id) || firstRouteParam(input.snapshot?.id);
  if (!id) {
    return false;
  }
  const snapshotId = firstRouteParam(input.snapshot?.id);
  const snapshot =
    input.snapshot && (!snapshotId || snapshotId === id) ? { ...input.snapshot, id } : { id };
  if (challengeSnapshotHasIdentity(snapshot)) {
    seedChallengeDetailQuery(snapshot, client);
  } else {
    seedChallengeFeedPreview(snapshot, client);
  }
  prefetchChallengeDetail(id, challengeSnapshotHasIdentity(snapshot) ? snapshot : undefined, client);
  const href = String(challengeDetailHref(id, input.returnTo ?? 'lobby', input.postId, input.extra));
  pushChallengeHref(router, href, input.source ?? 'open-challenge', id, input.pathname);
  return true;
}
