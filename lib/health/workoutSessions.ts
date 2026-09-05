import { supabase } from '@/lib/supabase';
import type { CheckinHealthProof } from '@/lib/health/checkinHealthProof';
import type { WorkoutSessionRecord } from '@/lib/types';

/**
 * Writes the workout ledger row for a check-in.
 *
 * One row per check-in, so re-sending the same period updates rather than duplicates. A HealthKit or
 * Health Connect row is never replaced by a screenshot read: vendor numbers outrank a guess, and a
 * later screenshot on the same check-in must not quietly rewrite them.
 */

export type WorkoutSessionInput = {
  userId: string;
  challengeId?: string | null;
  checkinId: string;
  postId?: string | null;
  health: CheckinHealthProof;
  /** The proof image this session was read from, when there is one. */
  proofUrl?: string | null;
  activityLabel?: string | null;
  ocrConfidence?: number | null;
};

function payloadFor(input: WorkoutSessionInput): Partial<WorkoutSessionRecord> {
  const health = input.health;
  return {
    user_id: input.userId,
    challenge_id: input.challengeId ?? null,
    checkin_id: input.checkinId,
    post_id: input.postId ?? null,
    source: health.source,
    activity_type: health.activityType ?? null,
    activity_label: input.activityLabel ?? null,
    started_at: health.startedAt ?? null,
    ended_at: health.endedAt ?? null,
    duration_sec: health.durationSec ?? null,
    active_kcal: health.activeEnergyKcal ?? null,
    total_kcal: health.totalEnergyKcal ?? null,
    distance_m: health.distanceMeters ?? null,
    hr_min: health.minHrBpm ?? null,
    hr_avg: health.avgHrBpm ?? null,
    hr_max: health.maxHrBpm ?? null,
    proof_url: input.proofUrl ?? null,
    // Only a vendor attach reaches here with coordinates; the DB check enforces the same rule.
    route: health.route ?? null,
    ocr_confidence: input.ocrConfidence ?? null,
    updated_at: new Date().toISOString(),
  };
}

/** True when this source must not be overwritten by a later, weaker read. */
export function isVendorSource(source?: string | null): boolean {
  return source === 'healthkit' || source === 'health_connect';
}

/**
 * Never throws. A missing ledger row must not fail a check-in that already landed.
 * Returns true when a row was written.
 */
export async function saveWorkoutSession(input: WorkoutSessionInput): Promise<boolean> {
  if (!input.userId || !input.checkinId || !input.health) {
    return false;
  }
  try {
    const existing = await supabase
      .from('workout_sessions')
      .select('id, source')
      .eq('checkin_id', input.checkinId)
      .maybeSingle();

    const existingSource = existing.data?.source as string | undefined;
    if (isVendorSource(existingSource) && !isVendorSource(input.health.source)) {
      // A screenshot read arrived after a vendor attach. The vendor row stands.
      return false;
    }

    const payload = payloadFor(input);
    if (existing.data?.id) {
      const { error } = await supabase.from('workout_sessions').update(payload).eq('id', existing.data.id);
      if (error) {
        console.log('[blob:workout-session]', error.message);
        return false;
      }
      return true;
    }
    const { error } = await supabase.from('workout_sessions').insert(payload);
    if (error) {
      console.log('[blob:workout-session]', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.log('[blob:workout-session]', error instanceof Error ? error.message : 'failed');
    return false;
  }
}
