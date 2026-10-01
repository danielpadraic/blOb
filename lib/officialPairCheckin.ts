import type { QueryClient } from '@tanstack/react-query';

import {
  isPostWorkoutProof,
  isPreWorkoutProof,
  mediaUrlKey,
  proofSlotPart,
  uniqueProofUrls,
  type ChallengeProof,
  type ChallengeProofPart,
} from '@/lib/challengeProofs';
import type { CheckinProofStats } from '@/lib/checkin/proofStats';
import type { CheckinHealthProof } from '@/lib/health/checkinHealthProof';
import { isRecapCardUrl } from '@/lib/health/postWorkoutCard';
import { patchFeedPostFields } from '@/lib/liveFeedPatch';
import { dateStampInZone } from '@/lib/officialDays';
import { OFFICIAL_COIN_TZ, officialCoinDisplayTitle, officialCoinKind } from '@/lib/officialCoin';
import { supabase } from '@/lib/supabase';

/**
 * Official Weekly and Official Monthly share one workout.
 * A file already on either room fills that slot on the other. Live shows one ordered set.
 */

export type OfficialCheckinSlice = {
  id?: string | null;
  proof_parts?: Record<string, ChallengeProofPart> | null;
  pre_selfie_url?: string | null;
  post_selfie_url?: string | null;
  hr_monitor_url?: string | null;
  period_key?: string | null;
};

function legacyOf(row?: OfficialCheckinSlice | null) {
  return {
    pre_selfie_url: row?.pre_selfie_url ?? null,
    post_selfie_url: row?.post_selfie_url ?? null,
    hr_monitor_url: row?.hr_monitor_url ?? null,
  };
}

function stillUrl(url?: string | null): string | null {
  const value = String(url ?? '').trim();
  if (!value || value.startsWith('health:') || isRecapCardUrl(value)) {
    return null;
  }
  return value;
}

/** The photo that fills this required slot. Recap cards and health: tokens do not. */
export function qualifyingSlotUrl(
  proof: ChallengeProof,
  parts?: Record<string, ChallengeProofPart> | null,
  legacy?: OfficialCheckinSlice | null,
): string | null {
  const part = proofSlotPart(proof, parts, legacyOf(legacy));
  const listed = uniqueProofUrls([...(part?.urls ?? []), part?.url]);
  for (const url of listed) {
    const still = stillUrl(url);
    if (still) {
      return still;
    }
  }
  return null;
}

function slotRank(proof: ChallengeProof): number {
  if (isPreWorkoutProof(proof)) {
    return 0;
  }
  if (isPostWorkoutProof(proof)) {
    return 1;
  }
  if (proof.method === 'hr') {
    return 2;
  }
  if (proof.method === 'distance') {
    return 3;
  }
  return 4;
}

/**
 * Local files win. A sibling file fills a slot this room has not started.
 * Each required slot keeps one still — a second pre is not appended.
 */
export function mergeOfficialPairParts(
  proofs: readonly ChallengeProof[],
  local?: OfficialCheckinSlice | null,
  sibling?: OfficialCheckinSlice | null,
): Record<string, ChallengeProofPart> {
  const out: Record<string, ChallengeProofPart> = { ...(local?.proof_parts ?? {}) };
  for (const proof of proofs) {
    const localUrl = qualifyingSlotUrl(proof, local?.proof_parts, local);
    const siblingUrl = qualifyingSlotUrl(proof, sibling?.proof_parts, sibling);
    const url = localUrl || siblingUrl;
    if (!url) {
      continue;
    }
    const source = localUrl
      ? proofSlotPart(proof, local?.proof_parts, legacyOf(local))
      : proofSlotPart(proof, sibling?.proof_parts, legacyOf(sibling));
    const recaps = uniqueProofUrls((source?.urls ?? []).filter((item) => isRecapCardUrl(item)));
    out[proof.id] = {
      ...(source ?? { method: proof.method, url, urls: [url] }),
      method: source?.method || proof.method,
      url,
      urls: uniqueProofUrls([url, ...recaps]),
    };
  }
  return out;
}

/** pre → post → HR/screenshot → recap card → extras. Duplicate URLs drop out. */
export function orderedCheckinSlides(input: {
  proofs: readonly ChallengeProof[];
  parts?: Record<string, ChallengeProofPart> | null;
  legacy?: OfficialCheckinSlice | null;
  extras?: readonly (string | null | undefined)[];
  recap?: string | null;
}): string[] {
  const slides: string[] = [];
  const push = (url?: string | null) => {
    const value = String(url ?? '').trim();
    if (!value || value.startsWith('health:')) {
      return;
    }
    if (slides.some((item) => mediaUrlKey(item) === mediaUrlKey(value))) {
      return;
    }
    slides.push(value);
  };
  const ordered = [...input.proofs].sort((a, b) => slotRank(a) - slotRank(b));
  const recaps: string[] = [];
  const noteRecap = (url?: string | null) => {
    const value = String(url ?? '').trim();
    if (value && isRecapCardUrl(value, input.recap)) {
      recaps.push(value);
    }
  };
  noteRecap(input.recap);
  for (const proof of ordered) {
    const part = proofSlotPart(proof, input.parts, legacyOf(input.legacy));
    for (const url of uniqueProofUrls([...(part?.urls ?? []), part?.url])) {
      noteRecap(url);
    }
    push(qualifyingSlotUrl(proof, input.parts, input.legacy));
  }
  for (const url of recaps) {
    push(url);
  }
  for (const url of input.extras ?? []) {
    const value = String(url ?? '').trim();
    if (!value || isRecapCardUrl(value, input.recap)) {
      noteRecap(value);
      if (isRecapCardUrl(value, input.recap)) {
        push(value);
        continue;
      }
    }
    push(value);
  }
  return slides;
}

/** Chips for Live and Home. Numbers only — no generated sentence. */
export function ocrCheckinStats(health?: CheckinHealthProof | null): CheckinProofStats | null {
  if (!health || health.source === 'healthkit' || health.source === 'health_connect') {
    return null;
  }
  const duration = Number(health.durationSec);
  const avg = Number(health.avgHrBpm);
  const distance = Number(health.distanceMeters);
  const active = Number(health.activeEnergyKcal);
  const total = Number(health.totalEnergyKcal);
  const stats: CheckinProofStats = { source: 'ocr' };
  if (Number.isFinite(duration) && duration > 0) {
    stats.duration_sec = Math.round(duration);
  }
  if (Number.isFinite(avg) && avg > 0) {
    stats.hr_avg = Math.round(avg);
  }
  if (Number.isFinite(Number(health.minHrBpm)) && Number(health.minHrBpm) > 0) {
    stats.hr_min = Math.round(Number(health.minHrBpm));
  }
  if (Number.isFinite(Number(health.maxHrBpm)) && Number(health.maxHrBpm) > 0) {
    stats.hr_max = Math.round(Number(health.maxHrBpm));
  }
  if (Number.isFinite(active) && active > 0) {
    stats.active_cal = Math.round(active);
  }
  if (Number.isFinite(total) && total > 0) {
    stats.total_cal = Math.round(total);
  }
  if (Number.isFinite(distance) && distance > 0) {
    stats.distance_m = Math.round(distance);
  }
  if (health.sourceName) {
    stats.activity_label = health.sourceName;
  }
  if (stats.duration_sec == null && stats.hr_avg == null && stats.distance_m == null) {
    return null;
  }
  return stats;
}

export function siblingOfficialChallengeId(
  currentId: string | null | undefined,
  rooms?: { weeklyId?: string | null; monthlyId?: string | null } | null,
): string | null {
  const id = String(currentId ?? '').trim();
  const weekly = String(rooms?.weeklyId ?? '').trim();
  const monthly = String(rooms?.monthlyId ?? '').trim();
  if (!id || !weekly || !monthly || weekly === monthly) {
    return null;
  }
  if (id === weekly) {
    return monthly;
  }
  if (id === monthly) {
    return weekly;
  }
  return null;
}

export function isOfficialCoinPairChallenge(challenge?: { official_kind?: string | null } | null): boolean {
  return officialCoinKind(challenge) != null;
}

const CHECKIN_SLICE =
  'id, challenge_id, period_key, proof_parts, pre_selfie_url, post_selfie_url, hr_monitor_url, status, submitted_at';

/** This period's Official check-in on the other room, when one is stored. */
export async function fetchOfficialPairCheckin(input: {
  challengeId: string;
  userId: string;
  periodKeys: readonly string[];
}): Promise<OfficialCheckinSlice | null> {
  const challengeId = input.challengeId.trim();
  const userId = input.userId.trim();
  const keys = [...new Set(input.periodKeys.map((key) => String(key ?? '').trim()).filter(Boolean))];
  if (!challengeId || !userId || keys.length === 0) {
    return null;
  }
  const { data, error } = await supabase
    .from('challenge_checkins')
    .select(CHECKIN_SLICE)
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .in('period_key', keys)
    .order('created_at', { ascending: false })
    .limit(4);
  if (error || !data?.length) {
    return null;
  }
  const rows = data as OfficialCheckinSlice[];
  return (
    rows.find((row) =>
      Boolean(
        qualifyingSlotUrl(
          { id: 'pre', name: 'Pre-workout selfie', method: 'photo' },
          row.proof_parts,
          row,
        ) ||
          row.pre_selfie_url ||
          row.post_selfie_url ||
          row.hr_monitor_url,
      ),
    ) ?? rows[0]
  );
}

/**
 * Both Official Lives show the same slides, on the post that already exists for that check-in.
 * Returns the post ids so OCR can stamp chips on each.
 */
export async function alignOfficialPairPosts(input: {
  userId: string;
  challengeIds: readonly string[];
  mediaUrls: readonly string[];
  content?: string | null;
  queryClient?: Pick<QueryClient, 'setQueriesData'>;
}): Promise<string[]> {
  const userId = input.userId.trim();
  const challengeIds = [...new Set(input.challengeIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  const mediaUrls = uniqueProofUrls([...input.mediaUrls]);
  if (!userId || challengeIds.length === 0 || mediaUrls.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from('posts')
    .select('id, challenge_id, content, checkin_stats, media_urls, created_at')
    .eq('author_id', userId)
    .in('challenge_id', challengeIds)
    .eq('source', 'checkin')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(12);
  if (error || !data?.length) {
    return [];
  }
  const rows = data as Array<{
    id: string;
    challenge_id: string;
    content?: string | null;
    checkin_stats?: CheckinProofStats | null;
    created_at?: string;
  }>;
  const firstByChallenge = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!firstByChallenge.has(row.challenge_id)) {
      firstByChallenge.set(row.challenge_id, row);
    }
  }
  const titled = await supabase
    .from('challenges')
    .select('id, title, official_kind')
    .in('id', challengeIds);
  const titleOf = new Map<string, string>();
  for (const row of (titled.data ?? []) as Array<{ id: string; title?: string | null; official_kind?: string | null }>) {
    titleOf.set(row.id, officialCoinDisplayTitle(row) || String(row.title ?? '').trim());
  }
  const pairedIds = [...firstByChallenge.keys()];
  const pairedTitles = pairedIds.map((id) => titleOf.get(id) || '').filter(Boolean);
  const ordered = [...firstByChallenge.values()].sort(
    (a, b) => Date.parse(a.created_at ?? '') - Date.parse(b.created_at ?? ''),
  );
  const keeperId = ordered[0]?.id ?? '';
  const content = String(input.content ?? '').trim();
  const ids: string[] = [];
  for (const row of ordered) {
    const prior =
      row.checkin_stats && typeof row.checkin_stats === 'object' ? row.checkin_stats : {};
    const homeKeeper = row.id === keeperId;
    const checkin_stats: CheckinProofStats = {
      ...prior,
      paired_challenge_ids: pairedIds,
      paired_titles: pairedTitles,
    };
    const patch: {
      media_urls: string[];
      content?: string;
      hidden_from_home: boolean;
      checkin_stats: CheckinProofStats;
    } = {
      media_urls: [...mediaUrls],
      hidden_from_home: !homeKeeper,
      checkin_stats,
    };
    if (content) {
      patch.content = content;
    }
    const write = await supabase.from('posts').update(patch).eq('id', row.id);
    if (write.error) {
      continue;
    }
    ids.push(row.id);
    input.queryClient &&
      patchFeedPostFields(input.queryClient, row.id, {
        id: row.id,
        media_urls: [...mediaUrls],
        hidden_from_home: !homeKeeper,
        ...(content ? { content } : null),
        checkin_stats,
      });
  }
  return ids;
}

const DUAL_STAMP_MS = 90_000;

function proofPath(url: string): string {
  const clean = String(url ?? '').split('?')[0];
  const marker = '/challenge-proofs/';
  const at = clean.indexOf(marker);
  return at >= 0 ? clean.slice(at) : clean;
}

function sharesProofMedia(
  left: { media_urls?: string[] | null },
  right: { media_urls?: string[] | null },
): boolean {
  const paths = new Set((left.media_urls ?? []).map(proofPath).filter(Boolean));
  return (right.media_urls ?? []).some((url) => paths.has(proofPath(url)));
}

type DualStampPost = {
  id: string;
  author_id: string;
  created_at: string;
  source?: string | null;
  challenge_id?: string | null;
  checkin_id?: string | null;
  media_urls?: string[] | null;
  checkin_stats?: CheckinProofStats | null;
  hidden_from_home?: boolean | null;
};

/**
 * One Home card when the same morning stamped Weekly and Monthly.
 * Keeps the oldest row, unions the stills, and names both rooms.
 */
export function collapseDualStampHomePosts<T extends DualStampPost>(posts: T[]): T[] {
  const used = new Set<string>();
  const checkins = posts.filter((post) => post.source === 'checkin' && post.challenge_id);
  const out: T[] = [];
  for (const post of posts) {
    if (used.has(post.id)) {
      continue;
    }
    if (post.source !== 'checkin' || !post.challenge_id) {
      out.push(post);
      continue;
    }
    const stamp = Date.parse(post.created_at);
    const day = Number.isFinite(stamp) ? dateStampInZone(new Date(stamp), OFFICIAL_COIN_TZ) : '';
    const group = checkins.filter((other) => {
      if (other.author_id !== post.author_id) {
        return false;
      }
      if (post.checkin_id && other.checkin_id && post.checkin_id === other.checkin_id) {
        return true;
      }
      if (other.id === post.id) {
        return true;
      }
      const otherStamp = Date.parse(other.created_at);
      if (!day || !Number.isFinite(otherStamp) || other.challenge_id === post.challenge_id) {
        return false;
      }
      if (dateStampInZone(new Date(otherStamp), OFFICIAL_COIN_TZ) !== day) {
        return false;
      }
      return Math.abs(otherStamp - stamp) <= DUAL_STAMP_MS || sharesProofMedia(post, other);
    });
    for (const row of group) {
      used.add(row.id);
    }
    if (group.length < 2) {
      out.push(post);
      continue;
    }
    const ordered = [...group].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const keeper = ordered[0];
    const media = uniqueProofUrls(ordered.flatMap((row) => row.media_urls ?? []));
    const pairedIds = [...new Set(ordered.map((row) => String(row.challenge_id ?? '').trim()).filter(Boolean))];
    const pairedTitles = [...new Set(ordered.flatMap((row) => row.checkin_stats?.paired_titles ?? []).filter(Boolean))];
    out.push({
      ...keeper,
      media_urls: media,
      hidden_from_home: false,
      checkin_stats: {
        ...(keeper.checkin_stats ?? {}),
        paired_challenge_ids: pairedIds,
        paired_titles: pairedTitles,
      },
    } as T);
  }
  return out;
}

/** Write OCR chips onto every Official Live post for this send. Does not replace the photo. */
export async function stampOfficialPairStats(input: {
  postIds: readonly string[];
  stats: CheckinProofStats;
  queryClient?: Pick<QueryClient, 'setQueriesData'>;
}): Promise<void> {
  for (const id of input.postIds) {
    const postId = String(id ?? '').trim();
    if (!postId) {
      continue;
    }
    const existing = await supabase.from('posts').select('checkin_stats').eq('id', postId).maybeSingle();
    const prior =
      existing.data?.checkin_stats && typeof existing.data.checkin_stats === 'object'
        ? (existing.data.checkin_stats as CheckinProofStats)
        : {};
    const checkin_stats = { ...prior, ...input.stats, source: input.stats.source ?? 'ocr' };
    const write = await supabase.from('posts').update({ checkin_stats }).eq('id', postId);
    if (write.error) {
      continue;
    }
    input.queryClient &&
      patchFeedPostFields(input.queryClient, postId, {
        id: postId,
        checkin_stats,
      });
  }
}
