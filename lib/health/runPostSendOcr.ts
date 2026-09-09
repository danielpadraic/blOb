/**
 * After Send, read every HR / distance screenshot and stamp chips onto the same post.
 *
 * Attach-time OCR can still be in flight when Send lands. Waiting for Live to remount, or asking
 * the user to reopen the post, is how tonight's stills showed with no metrics. This pass does not
 * block navigation and never deletes media.
 */

import type { QueryClient } from '@tanstack/react-query';

import { uniqueProofUrls, type ChallengeProof } from '@/lib/challengeProofs';
import { saveCheckinProof } from '@/lib/challenges/stagedCheckin';
import { challengeClockTz } from '@/lib/checkinPeriod';
import {
  hasUsableHealthMetrics,
  hasUsablePostStats,
  isFitnessBackfillChallenge,
  isOcrBackfillSlot,
  isVendorHealthSlot,
  pickOcrBackfillSlots,
  pickStillUrls,
  shouldPostSendOcrSlot,
  slotMethodOf,
  type OcrBackfillPart,
} from '@/lib/health/ocrBackfill';
import { readWorkoutScreenshot } from '@/lib/health/ocrClient';
import {
  buildOcrHealthProof,
  ocrFieldsFromParse,
  type OcrSessionFields,
} from '@/lib/health/ocrSession';
import { unionOcrFields } from '@/lib/health/ocrUnion';
import { patchFeedPostFields } from '@/lib/liveFeedPatch';
import { supabase } from '@/lib/supabase';
import type { CheckinHealthProof } from '@/lib/health/checkinHealthProof';
import { hasOcrNumbers } from '@/lib/health/workoutOcr';

export type PostSendOcrSlot = {
  proof: Pick<ChallengeProof, 'id' | 'method'> & { name?: string | null };
  urls: string[];
  caption?: string | null;
  mimeType?: string | null;
  health?: CheckinHealthProof | null;
  healthWorkoutId?: string | null;
};

const ranLatestFor = new Set<string>();

function fieldsFromHealth(health?: CheckinHealthProof | null): OcrSessionFields {
  if (!health) {
    return {};
  }
  const fields: OcrSessionFields = {};
  if (health.durationSec) {
    fields.durationSec = health.durationSec;
  }
  if (health.activeEnergyKcal) {
    fields.activeEnergyKcal = health.activeEnergyKcal;
  }
  if (health.totalEnergyKcal) {
    fields.totalEnergyKcal = health.totalEnergyKcal;
  }
  if (health.minHrBpm) {
    fields.minHrBpm = health.minHrBpm;
  }
  if (health.avgHrBpm) {
    fields.avgHrBpm = health.avgHrBpm;
  }
  if (health.maxHrBpm) {
    fields.maxHrBpm = health.maxHrBpm;
  }
  if (health.distanceMeters) {
    fields.distanceMeters = health.distanceMeters;
  }
  return fields;
}

async function persistOcrHealth(input: {
  challengeId: string;
  slot: PostSendOcrSlot;
  urls: string[];
  health: CheckinHealthProof;
}): Promise<boolean> {
  try {
    await saveCheckinProof({
      challengeId: input.challengeId,
      proof: {
        id: input.slot.proof.id,
        name: input.slot.proof.name ?? '',
        method: input.slot.proof.method,
      } as ChallengeProof,
      uri: input.urls[0],
      urls: input.urls,
      mimeType: input.slot.mimeType,
      health: input.health,
      caption: input.slot.caption ?? null,
    });
    return true;
  } catch (error) {
    console.log('[blob:ocr]', {
      ok: false,
      ms: 0,
      slot: input.slot.proof.id,
      urls: input.urls,
      parsed: null,
      reason: error instanceof Error ? error.message : 'persist_failed',
    });
    return false;
  }
}

async function patchPostFromServer(
  queryClient: Pick<QueryClient, 'setQueriesData'> | undefined,
  postId: string | null | undefined,
): Promise<void> {
  const id = String(postId ?? '').trim();
  if (!id || !queryClient) {
    return;
  }
  try {
    const { data } = await supabase
      .from('posts')
      .select('id, checkin_stats, media_urls, hidden_media_urls')
      .eq('id', id)
      .maybeSingle();
    if (!data?.id) {
      return;
    }
    patchFeedPostFields(queryClient, data.id, {
      id: data.id,
      checkin_stats: data.checkin_stats,
      media_urls: data.media_urls,
      hidden_media_urls: data.hidden_media_urls,
    });
  } catch {
    // Realtime UPDATE will merge the same fields if this read misses.
  }
}

async function readSlotStills(slotId: string, urls: string[]): Promise<{
  fields: OcrSessionFields;
  clockRange: ReturnType<typeof unionOcrFields>['clockRange'];
  activityLabel: string | null;
  anyOk: boolean;
}> {
  const reads: Parameters<typeof unionOcrFields>[0] = [];
  let anyOk = false;
  for (const url of urls) {
    const result = await readWorkoutScreenshot({
      localUri: url,
      imageUrl: url,
      slot: slotId,
    });
    if (result.ok && result.isWorkoutScreen && hasOcrNumbers(result.parsed)) {
      anyOk = true;
      reads.push({
        fields: ocrFieldsFromParse(result.parsed),
        clockRange: result.parsed?.clockRange ?? null,
        activityLabel: result.parsed?.activityLabel ?? null,
      });
    }
  }
  const union = unionOcrFields(reads);
  return { ...union, anyOk };
}

/**
 * Fire-and-forget after a successful Send. Soft-fail: a miss never blocks and never deletes media.
 */
export async function runPostSendOcr(input: {
  challengeId: string;
  postId?: string | null;
  periodKey?: string | null;
  timeZone: string;
  slots: PostSendOcrSlot[];
  queryClient?: Pick<QueryClient, 'setQueriesData'>;
}): Promise<void> {
  const started = Date.now();
  let wrote = false;
  for (const slot of input.slots) {
    if (!shouldPostSendOcrSlot(slot)) {
      continue;
    }
    const urls = uniqueProofUrls(slot.urls).filter((url) => url && !url.startsWith('health:'));
    const existing = fieldsFromHealth(slot.health);
    const read = await readSlotStills(slot.proof.id, urls);
    const union = unionOcrFields([
      { fields: existing },
      { fields: read.fields, clockRange: read.clockRange, activityLabel: read.activityLabel },
    ]);
    console.log('[blob:ocr]', {
      ok: Object.keys(union.fields).length > 0,
      ms: Date.now() - started,
      slot: slot.proof.id,
      urls,
      parsed: union.fields,
    });
    if (Object.keys(union.fields).length === 0) {
      continue;
    }
    const snapshot = buildOcrHealthProof({
      fields: union.fields,
      source: slot.health?.source === 'manual' ? 'manual' : 'ocr',
      activityLabel: union.activityLabel ?? slot.health?.sourceName ?? null,
      clockRange: union.clockRange,
      periodKey: input.periodKey,
      timeZone: input.timeZone,
    });
    if (!snapshot) {
      continue;
    }
    const saved = await persistOcrHealth({
      challengeId: input.challengeId,
      slot,
      urls,
      health: snapshot,
    });
    wrote = wrote || saved;
  }
  if (wrote) {
    await patchPostFromServer(input.queryClient, input.postId);
  }
}

type LatestCheckinRow = {
  id: string;
  challenge_id: string;
  period_key?: string | null;
  proof_parts?: Record<string, OcrBackfillPart> | null;
  created_at: string;
};

/**
 * One-shot: this user's latest fitness check-in that still has screenshots and no vendor numbers.
 * Skips selfie-only rows. Does not invent a workout window.
 */
export async function backfillLatestFitnessOcr(input: {
  userId: string;
  challengeId?: string | null;
  queryClient?: Pick<QueryClient, 'setQueriesData'>;
}): Promise<void> {
  const userId = String(input.userId ?? '').trim();
  if (!userId || ranLatestFor.has(userId)) {
    return;
  }
  ranLatestFor.add(userId);

  try {
    let query = supabase
      .from('challenge_checkins')
      .select('id, challenge_id, period_key, proof_parts, created_at')
      .eq('user_id', userId)
      .not('submitted_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(12);
    if (input.challengeId) {
      query = query.eq('challenge_id', input.challengeId);
    }
    const { data, error } = await query;
    if (error || !data?.length) {
      return;
    }

    for (const row of data as LatestCheckinRow[]) {
      const parts = row.proof_parts ?? {};
      const { data: challenge } = await supabase
        .from('challenges')
        .select('id, category, proofs, proof_type, title, task, tasks, rules, description, timezone, is_official, series_id')
        .eq('id', row.challenge_id)
        .maybeSingle();
      const { data: post } = await supabase
        .from('posts')
        .select('id, checkin_stats, media_urls')
        .eq('checkin_id', row.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!post?.id) {
        continue;
      }
      if (hasUsablePostStats(post.checkin_stats as { duration_sec?: number | null } | null)) {
        return;
      }
      const slots = pickOcrBackfillSlots({
        challenge,
        proofs: (challenge as { proofs?: Array<{ id?: string; method?: string | null }> } | null)?.proofs ?? null,
        parts,
        postStats: post.checkin_stats as { duration_sec?: number | null } | null,
      });
      if (slots.length === 0) {
        const selfieOnly = Object.keys(parts).every((slotId) => {
          const part = parts[slotId];
          const method = slotMethodOf(part ?? {}, null);
          return method !== 'hr' && method !== 'distance';
        });
        if (selfieOnly) {
          continue;
        }
        continue;
      }

      const sendSlots: PostSendOcrSlot[] = [];
      for (const slot of slots) {
        const part = parts[slot.slotId] ?? {};
        if (
          !isOcrBackfillSlot({
            ...part,
            method: slot.method,
            mimeType: part.mimeType ?? part.mime,
          })
        ) {
          continue;
        }
        if (isVendorHealthSlot(part) || hasUsableHealthMetrics(part.health as { durationSec?: number } | null)) {
          continue;
        }
        const urls = slot.urls.length ? slot.urls : pickStillUrls(part);
        if (urls.length === 0) {
          continue;
        }
        sendSlots.push({
          proof: { id: slot.slotId, method: slot.method, name: '' },
          urls,
          caption: (part as { caption?: string | null }).caption ?? null,
          health: (part.health as CheckinHealthProof | null) ?? null,
          healthWorkoutId: part.healthWorkoutId ?? null,
        });
      }
      if (sendSlots.length === 0) {
        continue;
      }
      if (!isFitnessBackfillChallenge(challenge)) {
        continue;
      }
      await runPostSendOcr({
        challengeId: row.challenge_id,
        postId: post.id,
        periodKey: row.period_key,
        timeZone: challengeClockTz(challenge),
        slots: sendSlots,
        queryClient: input.queryClient,
      });
      return;
    }
  } catch (error) {
    console.log('[blob:ocr]', {
      ok: false,
      ms: 0,
      slot: null,
      urls: [],
      parsed: null,
      reason: error instanceof Error ? error.message : 'backfill_failed',
    });
  }
}

export function resetLatestOcrBackfillForTests(): void {
  ranLatestFor.clear();
}
