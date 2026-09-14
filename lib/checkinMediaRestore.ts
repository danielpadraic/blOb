/**
 * Home and Live must show the same stills + recap for one check-in.
 *
 * Recap JPEG is an extra last slide. User screenshots / selfies are never dropped.
 * If Live arrived with an empty or card-only list, union Home cache + proof_parts.
 */

import type { QueryClient } from '@tanstack/react-query';

import {
  parseProofParts,
  proofImageUrls,
  uniqueProofUrls,
  type ChallengeProofPart,
} from '@/lib/challengeProofs';
import type { CheckinProofStats } from '@/lib/checkin/proofStats';
import { isVendorHealthSlot } from '@/lib/health/ocrBackfill';
import {
  isRecapCardUrl,
  namedVendorCardUrl,
  pagerUrlsWithWorkoutCard,
} from '@/lib/health/postWorkoutCard';
import { liveCheckinKey, richestCheckinStats } from '@/lib/liveFeedPatch';
import { supabase } from '@/lib/supabase';

export type CachedCheckinMedia = {
  media_urls: string[];
  checkin_stats: CheckinProofStats | null;
};

export type CheckinProofMediaRow = {
  id?: string | null;
  proof_parts?: unknown;
  pre_selfie_url?: string | null;
  post_selfie_url?: string | null;
  hr_monitor_url?: string | null;
};

function asUrlList(value: unknown): string[] {
  return uniqueProofUrls(value);
}

function asStats(value: unknown): CheckinProofStats | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as CheckinProofStats;
}

function sameUrlList(left: unknown, right: string[]): boolean {
  const a = asUrlList(left);
  return a.length === right.length && a.every((url, index) => url === right[index]);
}

function sameStats(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  try {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  } catch {
    return false;
  }
}

/** Every still on a proof slot, plus legacy selfie / HR columns. Recap files stay in the list. */
export function mediaUrlsFromProofParts(
  parts: unknown,
  legacy?: {
    pre_selfie_url?: string | null;
    post_selfie_url?: string | null;
    hr_monitor_url?: string | null;
  },
): string[] {
  const parsed = parseProofParts(parts);
  const urls: string[] = [];
  for (const part of Object.values(parsed) as ChallengeProofPart[]) {
    urls.push(...proofImageUrls(part));
  }
  urls.push(legacy?.pre_selfie_url ?? '', legacy?.post_selfie_url ?? '', legacy?.hr_monitor_url ?? '');
  return uniqueProofUrls(urls);
}

export function vendorCardUrlFromProofParts(parts: unknown): string {
  const parsed = parseProofParts(parts);
  for (const part of Object.values(parsed) as ChallengeProofPart[]) {
    if (!isVendorHealthSlot(part)) {
      continue;
    }
    for (const url of proofImageUrls(part)) {
      if (isRecapCardUrl(url, part.url)) {
        return url;
      }
    }
    const primary = String(part.url ?? '').trim();
    if (primary && isRecapCardUrl(primary, null)) {
      return primary;
    }
  }
  return '';
}

/**
 * Same pager Home and Live use: user stills first, named recap last.
 * Unions every source. Never blanks stills that any source already had.
 */
export function restoreCheckinMediaUrls(input: {
  mediaUrls?: unknown;
  homeMediaUrls?: unknown;
  proofPartUrls?: unknown;
  stats?: CheckinProofStats | null;
  homeStats?: CheckinProofStats | null;
  cardUrl?: string | null;
}): { media_urls: string[]; checkin_stats: CheckinProofStats | null } {
  const stats = asStats(richestCheckinStats(input.stats, input.homeStats));
  const card =
    namedVendorCardUrl(stats) ||
    String(input.cardUrl ?? '').trim() ||
    '';
  const nextStats =
    card && stats && !namedVendorCardUrl(stats)
      ? { ...stats, card_url: card }
      : card && !stats
        ? ({ card_url: card } as CheckinProofStats)
        : stats;
  const merged = uniqueProofUrls([
    ...asUrlList(input.mediaUrls),
    ...asUrlList(input.homeMediaUrls),
    ...asUrlList(input.proofPartUrls),
    card,
  ]);
  return {
    media_urls: pagerUrlsWithWorkoutCard(merged, nextStats),
    checkin_stats: nextStats,
  };
}

export function postsFromQueryCache(current: unknown): Array<{
  id?: string | null;
  checkin_id?: string | null;
  media_urls?: unknown;
  checkin_stats?: unknown;
}> {
  if (Array.isArray(current)) {
    return current;
  }
  if (current && typeof current === 'object' && Array.isArray((current as { pages?: unknown }).pages)) {
    return (current as { pages: Array<{ posts?: unknown }> }).pages.flatMap((page) =>
      Array.isArray(page?.posts) ? page.posts : [],
    );
  }
  return [];
}

function mergeCached(out: Map<string, CachedCheckinMedia>, post: {
  id?: string | null;
  checkin_id?: string | null;
  media_urls?: unknown;
  checkin_stats?: unknown;
}) {
  const media = asUrlList(post.media_urls);
  const stats = asStats(post.checkin_stats);
  const keys = [liveCheckinKey(post.checkin_id), String(post.id ?? '').trim()].filter(Boolean);
  for (const key of keys) {
    const prev = out.get(key);
    const next = restoreCheckinMediaUrls({
      mediaUrls: prev?.media_urls,
      homeMediaUrls: media,
      stats: prev?.checkin_stats,
      homeStats: stats,
    });
    out.set(key, next);
  }
}

/** Home + any already-hydrated Live rows, keyed by checkin_id and posts.id. */
export function collectCachedCheckinMedia(
  queryClient: Pick<QueryClient, 'getQueriesData'>,
): Map<string, CachedCheckinMedia> {
  const out = new Map<string, CachedCheckinMedia>();
  try {
    for (const root of ['feed', 'live'] as const) {
      for (const [, data] of queryClient.getQueriesData({ queryKey: [root] })) {
        for (const post of postsFromQueryCache(data)) {
          mergeCached(out, post);
        }
      }
    }
  } catch {
    return out;
  }
  return out;
}

export async function fetchCheckinProofMedia(
  checkinIds: string[],
): Promise<Map<string, { urls: string[]; cardUrl: string }>> {
  const ids = [...new Set(checkinIds.map((id) => liveCheckinKey(id)).filter(Boolean))];
  const out = new Map<string, { urls: string[]; cardUrl: string }>();
  if (ids.length === 0) {
    return out;
  }
  try {
    const { data, error } = await supabase
      .from('challenge_checkins')
      .select('id, proof_parts, pre_selfie_url, post_selfie_url, hr_monitor_url')
      .in('id', ids);
    if (error || !Array.isArray(data)) {
      return out;
    }
    for (const row of data as CheckinProofMediaRow[]) {
      const id = liveCheckinKey(row.id);
      if (!id) {
        continue;
      }
      out.set(id, {
        urls: mediaUrlsFromProofParts(row.proof_parts, row),
        cardUrl: vendorCardUrlFromProofParts(row.proof_parts),
      });
    }
  } catch {
    return out;
  }
  return out;
}

/**
 * Union Home cache + proof_parts onto Live rows. Unchanged posts keep the same object
 * so FlatList does not remount when only a twin cache already had the stills.
 */
export async function hydrateLiveCheckinMedia<T extends {
  id: string;
  checkin_id?: string | null;
  media_urls?: unknown;
  checkin_stats?: unknown;
}>(
  posts: T[],
  queryClient?: Pick<QueryClient, 'getQueriesData'> | null,
): Promise<T[]> {
  if (!Array.isArray(posts) || posts.length === 0) {
    return posts;
  }
  let cached = new Map<string, CachedCheckinMedia>();
  try {
    if (queryClient) {
      cached = collectCachedCheckinMedia(queryClient);
    }
  } catch {
    cached = new Map();
  }

  const uniqueNeed = [
    ...new Set(posts.map((post) => liveCheckinKey(post.checkin_id)).filter(Boolean)),
  ];
  const parts = await fetchCheckinProofMedia(uniqueNeed);

  let changed = false;
  const next = posts.map((post) => {
    const checkinId = liveCheckinKey(post.checkin_id);
    const fromCache = cached.get(checkinId) ?? cached.get(post.id);
    const fromParts = checkinId ? parts.get(checkinId) : undefined;
    const restored = restoreCheckinMediaUrls({
      mediaUrls: post.media_urls,
      homeMediaUrls: fromCache?.media_urls,
      proofPartUrls: fromParts?.urls,
      stats: asStats(post.checkin_stats),
      homeStats: fromCache?.checkin_stats,
      cardUrl: fromParts?.cardUrl,
    });
    if (
      sameUrlList(post.media_urls, restored.media_urls) &&
      sameStats(post.checkin_stats, restored.checkin_stats)
    ) {
      return post;
    }
    changed = true;
    return {
      ...post,
      media_urls: restored.media_urls,
      checkin_stats: restored.checkin_stats,
    };
  });
  return changed ? next : posts;
}
