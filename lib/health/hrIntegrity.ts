import { hrSignatureFor } from '@/lib/health/hrSignature';
import { supabase } from '@/lib/supabase';
import type { HealthHeartRateSample, HealthWorkout } from '@/services/health/types';

/**
 * Records what this workout's heart rate looked like, for later comparison against the same account's
 * own history.
 *
 * Never throws and never blocks. A check-in is proof of a workout; this is a side note about it, and a
 * failed side note must not cost someone their day. Most calls write nothing at all — a short session,
 * a workout the watch recorded without heart rate, and any screenshot all produce no signature, which
 * is the honest answer rather than a guess.
 */
export async function recordHrSignature(input: {
  userId: string;
  workout: HealthWorkout;
  samples?: HealthHeartRateSample[] | null;
  series?: number[] | null;
}): Promise<boolean> {
  if (!input.userId || !input.workout?.providerWorkoutId) {
    return false;
  }
  const signature = hrSignatureFor({
    samples: input.samples,
    series: input.series,
    durationSec: Number(input.workout.durationSec),
  });
  if (!signature) {
    return false;
  }
  try {
    const { error } = await supabase.from('workout_hr_signatures').upsert(
      {
        user_id: input.userId,
        provider_workout_id: input.workout.providerWorkoutId,
        activity_type: input.workout.activityType,
        activity_label: input.workout.activityLabel ?? null,
        source_id: input.workout.sourceBundle ?? null,
        started_at: input.workout.startedAt,
        duration_sec: Math.round(Number(input.workout.durationSec)),
        points: signature.points,
        hr_mean: signature.mean,
        hr_peak: signature.peak,
        hr_floor: signature.floor,
        hr_sd: signature.sd,
        onset_bpm_min: signature.onsetBpmPerMin,
        recovery_bpm_min: signature.recoveryBpmPerMin,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider_workout_id' },
    );
    if (error) {
      console.log('[blob:hr-signature]', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.log('[blob:hr-signature]', error instanceof Error ? error.message : 'failed');
    return false;
  }
}
