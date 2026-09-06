import type { CheckinProofStats } from '@/lib/checkin/proofStats';
import { activityTypeOf, labelFromActivityType, workoutFromStoredSession } from '@/lib/health/cardRedraw';
import type { CheckinHealthProof } from '@/lib/health/checkinHealthProof';
import { buildWorkoutProofCard, type WorkoutProofCardModel } from '@/lib/health/workoutProofCard';
import type { HealthActivityType, HealthWorkout } from '@/services/health/types';

/**
 * The workout card a posted check-in shows, drawn from what is stored rather than from the picture.
 *
 * The card used to be a flattened JPEG, which made the image the source of truth: a walk whose miles
 * were repaired in the database kept printing `0.00 mi`, because the numbers had already been baked
 * into pixels. Building the card at render time instead means the post shows what the row says, and
 * a fix to the data or the renderer reaches every card that was ever posted without redrawing files.
 *
 * Two stores can feed it, because they are not readable by the same people:
 *
 * - `posts.checkin_stats` rides on the post, so anyone who can see the post can see the numbers. It
 *   carries no clock and no GPS track.
 * - `proof_parts[slot].health` is the whole session summary, including the route, but
 *   `challenge_checkins` is readable only by participants of that challenge.
 *
 * So the snapshot is preferred and the post stats are the floor. A viewer outside the challenge gets
 * a card with real distance, time, heart rate and calories but no map and no wall-clock range — and
 * crucially not an invented one. Deriving the workout window from when the post was created would
 * print a time the workout did not happen at, which on a proof artifact is worse than printing none.
 */

/**
 * Whether this piece of a post's media is the generated workout card the server named.
 *
 * Compared without the query string: proof URLs are signed, and the same file re-signed carries a
 * different token, which would otherwise stop matching its own card.
 */
export function isWorkoutCardUrl(url?: string | null, cardUrl?: string | null): boolean {
  const file = String(url ?? '').split('?')[0];
  const card = String(cardUrl ?? '').split('?')[0];
  return file.length > 0 && file === card;
}

/**
 * A workout rebuilt from the numbers on the post. Carries no window: `checkin_stats` never stored
 * one, and the card omits its date and time range rather than guessing them from the post.
 */
export function workoutFromPostStats(stats?: CheckinProofStats | null): HealthWorkout | null {
  if (!stats) {
    return null;
  }
  const durationSec = Number(stats.duration_sec);
  const distanceM = Number(stats.distance_m);
  const hasDuration = Number.isFinite(durationSec) && durationSec > 0;
  const hasDistance = Number.isFinite(distanceM) && distanceM > 0;
  // The card leads with distance or elapsed time. With neither there is no headline, so there is no
  // card — an honor check-in must not become a recap of nothing.
  if (!hasDuration && !hasDistance) {
    return null;
  }
  const activity = String(stats.activity ?? '').trim() || 'other';
  const workout: HealthWorkout = {
    providerWorkoutId: '',
    source: 'apple_health',
    activityType: activityTypeOf(activity),
    // The vendor's wording is the headline when the post carried it. Humanizing the type is the
    // fallback, and a poor one: "other" is the type behind pickleball, tennis and every sport.
    activityLabel: String(stats.activity_label ?? '').trim() || labelFromActivityType(activity),
    startedAt: '',
    endedAt: '',
    durationSec: hasDuration ? Math.round(durationSec) : 0,
    // The post stats drop the recording device, so the card says "Recorded in Apple Health" rather
    // than claiming a watch it cannot see.
    confidence: 'unknown',
  };
  if (hasDistance) {
    workout.distanceM = Math.round(distanceM);
  }
  const calories = Number(stats.active_cal) || Number(stats.total_cal);
  if (Number.isFinite(calories) && calories > 0) {
    workout.caloriesKcal = Math.round(calories);
  }
  const avg = Number(stats.hr_avg);
  if (Number.isFinite(avg) && avg > 0) {
    workout.hrAvg = Math.round(avg);
  }
  const max = Number(stats.hr_max);
  if (Number.isFinite(max) && max > 0) {
    workout.hrMax = Math.round(max);
  }
  const min = Number(stats.hr_min);
  if (Number.isFinite(min) && min > 0) {
    workout.hrMin = Math.round(min);
  }
  return workout;
}

/**
 * The workout slide a feed post carries: which of its media is the card, and the card to draw there.
 *
 * Null when the post is not a workout check-in, or when the server did not name a card — a Health
 * attach whose card never rasterized has numbers but no slide to put them on, and inventing one would
 * mean adding media the post does not have.
 */
export function workoutSlideForPost(input: {
  stats?: CheckinProofStats | null;
  challengeTitle?: string | null;
  checkinId?: string | null;
  timeZone?: string;
}): PostWorkoutSlide | null {
  const url = String(input.stats?.card_url ?? '').trim();
  if (!url) {
    return null;
  }
  const timeZone = input.timeZone ?? deviceTimeZone();
  const card = workoutCardForPost({
    stats: input.stats,
    challengeTitle: input.challengeTitle,
    timeZone,
  });
  if (!card) {
    return null;
  }
  return {
    url,
    card,
    activityType: activityTypeOf(String(input.stats?.activity ?? 'other')),
    checkinId: input.checkinId ?? null,
    stats: input.stats ?? null,
    challengeTitle: input.challengeTitle ?? null,
    timeZone,
  };
}

export type PostWorkoutSlide = {
  /** The media this card replaces. */
  url: string;
  card: WorkoutProofCardModel;
  activityType: HealthActivityType;
  checkinId: string | null;
  stats: CheckinProofStats | null;
  challengeTitle: string | null;
  timeZone: string;
};

/**
 * Only reached for a card built from post stats, which carries no clock — so this decides nothing the
 * reader sees today. It is here so the formatter has a zone to work in rather than throwing.
 */
function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * The card for a posted check-in, or null when the post is not a workout.
 *
 * `health` is the participant-only session snapshot and wins when present, because it is the only
 * source with the workout's real clock and its GPS track. `stats` is what every viewer can read.
 */
export function workoutCardForPost(input: {
  stats?: CheckinProofStats | null;
  health?: CheckinHealthProof | null;
  /** Apple's own wording for the activity, when a session row kept it. */
  activityLabel?: string | null;
  challengeTitle?: string | null;
  timeZone: string;
}): WorkoutProofCardModel | null {
  const fromSnapshot = input.health
    ? workoutFromStoredSession(
        input.health,
        input.activityLabel ?? input.stats?.activity_label,
        null,
      )
    : null;
  const workout = fromSnapshot ?? workoutFromPostStats(input.stats);
  if (!workout) {
    return null;
  }
  return buildWorkoutProofCard({
    workout,
    timeZone: input.timeZone,
    challengeTitle: String(input.challengeTitle ?? '').trim(),
    // Only the snapshot can carry coordinates. The post stats deliberately never did, so a viewer
    // outside the challenge sees the stats composition instead of an empty map frame.
    route: fromSnapshot ? input.health?.route ?? null : null,
  });
}
