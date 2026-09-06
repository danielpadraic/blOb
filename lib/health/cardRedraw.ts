import { parseCheckinHealthProof, type CheckinHealthProof } from '@/lib/health/checkinHealthProof';
import { parseProofParts, type ChallengeProofMethod } from '@/lib/challengeProofs';
import { humanizeActivityLabel } from '@/services/health/apple';
import type {
  HealthActivityType,
  HealthConfidence,
  HealthSource,
  HealthWorkout,
} from '@/services/health/types';

/**
 * Redrawing a workout proof card that was rendered with wrong numbers.
 *
 * The card is a JPEG, so its stats are pixels — repairing the row behind it does not change the
 * picture on the post. `workout_sessions.card_needs_redraw` marks the rows whose card no longer
 * agrees with them, and everything here answers one question: can this card be drawn again from what
 * is already stored, without asking the vendor for anything?
 *
 * It can. The check-in keeps the whole session summary in `proof_parts[slot].health`, which is what
 * the card was built from in the first place.
 */

/** A card that has to be drawn again, with everything the renderer needs to do it. */
export type CardRedraw = {
  sessionId: string;
  checkinId: string;
  challengeId: string;
  /** The proof slot holding the card. Replacing it keeps the check-in's other media untouched. */
  proofId: string;
  method: ChallengeProofMethod;
  /** Carried through the replace so the redrawn still stays workout proof, not a loose photo. */
  healthWorkoutId: string;
  health: CheckinHealthProof;
  workout: HealthWorkout;
};

export type StoredSessionRow = {
  id: string;
  checkin_id: string | null;
  challenge_id: string | null;
  activity_label?: string | null;
  vendor_workout_id?: string | null;
};

export type StoredCheckinRow = {
  id: string;
  challenge_id: string;
  proof_parts: unknown;
};

const ACTIVITY_TYPES: HealthActivityType[] = ['running', 'walking', 'cycling', 'strength', 'other'];

function activityTypeOf(value: string): HealthActivityType {
  return ACTIVITY_TYPES.includes(value as HealthActivityType)
    ? (value as HealthActivityType)
    : 'other';
}

/**
 * The inverse of `healthSourceLabel`. The snapshot stored the label the user reads rather than the
 * confidence enum, so the card's "Recorded on Apple Watch" line has to be recovered from it.
 */
export function confidenceFromSourceName(sourceName?: string | null): HealthConfidence {
  const name = String(sourceName ?? '').trim().toLowerCase();
  if (name.includes('watch')) {
    return 'watch';
  }
  if (name.includes('iphone') || name.includes('phone')) {
    return 'phone';
  }
  return 'unknown';
}

/**
 * The stored activity type is lowercase ("walking"), and it is the card's headline label when no
 * vendor wording survived, so it is title-cased rather than printed as typed.
 */
function labelFromActivityType(activityType: string): string {
  const label = humanizeActivityLabel(activityType);
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Workout';
}

/**
 * Rebuild the workout the card was drawn from. Only the fields the card actually renders are
 * recovered — this is not a general-purpose HealthWorkout, and it deliberately carries no body
 * metrics, because none were ever on the card.
 */
export function workoutFromStoredSession(
  health: CheckinHealthProof,
  session?: Pick<StoredSessionRow, 'activity_label' | 'vendor_workout_id'> | null,
): HealthWorkout | null {
  if (!health.startedAt || !health.endedAt || !(Number(health.durationSec) > 0)) {
    return null;
  }
  const source: HealthSource = health.source === 'health_connect' ? 'health_connect' : 'apple_health';
  const workout: HealthWorkout = {
    providerWorkoutId: session?.vendor_workout_id?.trim() || `session:${health.startedAt}`,
    source,
    activityType: activityTypeOf(health.activityType),
    // The label is what the card prints. A session row that kept Apple's own wording wins; otherwise
    // the stored type is humanized, which is what the original card fell back to as well.
    activityLabel: session?.activity_label?.trim() || labelFromActivityType(health.activityType),
    startedAt: health.startedAt,
    endedAt: health.endedAt,
    durationSec: Number(health.durationSec),
    confidence: confidenceFromSourceName(health.sourceName),
  };
  if (Number(health.distanceMeters) > 0) {
    workout.distanceM = Number(health.distanceMeters);
  }
  if (Number(health.activeEnergyKcal) > 0) {
    workout.caloriesKcal = Number(health.activeEnergyKcal);
  }
  if (Number(health.avgHrBpm) > 0) {
    workout.hrAvg = Number(health.avgHrBpm);
  }
  if (Number(health.maxHrBpm) > 0) {
    workout.hrMax = Number(health.maxHrBpm);
  }
  if (Number(health.minHrBpm) > 0) {
    workout.hrMin = Number(health.minHrBpm);
  }
  return workout;
}

/**
 * The one slot on this check-in whose card is redrawable.
 *
 * A slot qualifies only when it already holds an uploaded image: this replaces a card that is
 * showing the wrong number, and must never add media to a post that did not have it. Slots whose
 * card never rasterized keep their Health attach and stay as they are.
 */
export function redrawFor(session: StoredSessionRow, checkin: StoredCheckinRow): CardRedraw | null {
  if (!session.checkin_id || session.checkin_id !== checkin.id) {
    return null;
  }
  const parts = parseProofParts(checkin.proof_parts);
  for (const [proofId, part] of Object.entries(parts)) {
    if (!part.healthWorkoutId || !/^https?:\/\//i.test(String(part.url ?? ''))) {
      continue;
    }
    const health = parseCheckinHealthProof(part.health);
    if (!health || (health.source !== 'healthkit' && health.source !== 'health_connect')) {
      continue;
    }
    const workout = workoutFromStoredSession(health, session);
    if (!workout) {
      continue;
    }
    return {
      sessionId: session.id,
      checkinId: checkin.id,
      challengeId: session.challenge_id || checkin.challenge_id,
      proofId,
      method: part.method,
      healthWorkoutId: part.healthWorkoutId,
      health,
      workout,
    };
  }
  return null;
}

/**
 * Whether the redrawn card would lose the heart-rate graph it used to show.
 *
 * The sparkline comes from the sample series, which lives on the device rather than in the row. If
 * the workout reports an average but no samples came back, redrawing now would trade a wrong
 * distance for a missing graph. The flag stays set instead, and the next open tries again.
 */
export function redrawWouldLoseHeartRate(
  workout: HealthWorkout,
  sampleCount: number,
): boolean {
  return Number(workout.hrAvg) > 0 && sampleCount === 0;
}
