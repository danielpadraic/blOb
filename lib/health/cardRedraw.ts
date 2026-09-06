import { parseCheckinHealthProof, type CheckinHealthProof } from '@/lib/health/checkinHealthProof';
import {
  parseProofParts,
  type ChallengeProofMethod,
  type ChallengeProofPart,
} from '@/lib/challengeProofs';
import { WORKOUT_CARD_VERSION } from '@/lib/health/workoutProofCard';
import { humanizeActivityLabel } from '@/services/health/apple';
import type {
  HealthActivityType,
  HealthConfidence,
  HealthSource,
  HealthWorkout,
} from '@/services/health/types';

/**
 * Drawing a workout proof card again for a check-in that has already been posted.
 *
 * The card is a JPEG, so its stats are pixels: repairing the row behind it changes nothing about the
 * picture on the post, and neither does fixing the renderer. Everything here answers one question —
 * can this card be drawn again from what is already stored, without asking the vendor for anything?
 *
 * It can. The check-in keeps the whole session summary in `proof_parts[slot].health`, which is what
 * the card was built from in the first place. That matters for two reasons: a check-in that never got
 * a `workout_sessions` ledger row is still repairable, and so is one whose workout has since aged out
 * of Apple Health.
 */

/** A card that has to be drawn, with everything the renderer and the save need to do it. */
export type CardRepair = {
  checkinId: string;
  challengeId: string;
  /** The proof slot the card belongs to. Saving it leaves the check-in's other media untouched. */
  proofId: string;
  method: ChallengeProofMethod;
  /** Carried through the save so the new image stays workout proof, not a loose photo. */
  healthWorkoutId: string | null;
  /**
   * Whether the slot already shows a card. When false the post gains an image it never had, which is
   * the case for a Health attach whose card never rasterized.
   */
  hadCard: boolean;
  /** The slot's own caption, which the save rebuilds the part from and would otherwise drop. */
  caption: string | null;
  health: CheckinHealthProof;
  workout: HealthWorkout;
};

export type StoredCheckinRow = {
  id: string;
  challenge_id: string;
  proof_parts: unknown;
};

/** Apple's own wording for the activity, when a ledger row kept it. */
export type StoredActivityLabels = Record<string, string | null | undefined>;

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
 * Whether this slot's snapshot came off a watch or phone rather than a screenshot or a typed number.
 *
 * A card is only honest for a vendor session. `source` is the reliable signal, but it was added after
 * the first Health attaches shipped, so a snapshot with no source still counts when it carries a
 * vendor workout id and the device name it was recorded on. OCR and hand-entered rows are refused
 * outright — reading numbers off a screenshot does not earn a blOb-branded recap.
 */
export function isVendorHealthProof(
  health: CheckinHealthProof,
  part: Pick<ChallengeProofPart, 'healthWorkoutId'>,
): boolean {
  if (health.source === 'healthkit' || health.source === 'health_connect') {
    return true;
  }
  if (health.source === 'ocr' || health.source === 'manual') {
    return false;
  }
  return Boolean(part.healthWorkoutId && String(health.sourceName ?? '').trim());
}

/**
 * Rebuild the workout the card is drawn from. Only the fields the card actually renders are
 * recovered — this is not a general-purpose HealthWorkout, and it deliberately carries no body
 * metrics, because none were ever on the card.
 */
export function workoutFromStoredSession(
  health: CheckinHealthProof,
  activityLabel?: string | null,
  vendorWorkoutId?: string | null,
): HealthWorkout | null {
  if (!health.startedAt || !health.endedAt || !(Number(health.durationSec) > 0)) {
    return null;
  }
  const source: HealthSource = health.source === 'health_connect' ? 'health_connect' : 'apple_health';
  const workout: HealthWorkout = {
    providerWorkoutId: vendorWorkoutId?.trim() || `session:${health.startedAt}`,
    source,
    activityType: activityTypeOf(health.activityType),
    // The label is what the card prints. A session row that kept Apple's own wording wins; otherwise
    // the stored type is humanized, which is what the original card fell back to as well.
    activityLabel: activityLabel?.trim() || labelFromActivityType(health.activityType),
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
 * Whether a slot's card was drawn by the current renderer.
 *
 * An unstamped slot is treated as stale rather than as fine, because the stamp arrived after the
 * cards it is meant to find.
 */
export function cardIsCurrent(part: Pick<ChallengeProofPart, 'cardVersion'>): boolean {
  return Number(part.cardVersion) >= WORKOUT_CARD_VERSION;
}

/**
 * The one slot on this check-in whose card needs drawing, or null when none does.
 *
 * A slot qualifies whether or not it already holds an image: a stale card is replaced, and a Health
 * attach whose card never rasterized finally gets one. Cards already drawn by the current renderer
 * are left alone, which is what stops this from running forever.
 */
export function cardRepairFor(
  checkin: StoredCheckinRow,
  labels?: StoredActivityLabels,
): CardRepair | null {
  const parts = parseProofParts(checkin.proof_parts);
  for (const [proofId, part] of Object.entries(parts)) {
    const health = parseCheckinHealthProof(part.health);
    if (!health || !isVendorHealthProof(health, part) || cardIsCurrent(part)) {
      continue;
    }
    const workout = workoutFromStoredSession(
      health,
      labels?.[part.healthWorkoutId ?? ''] ?? null,
      part.healthWorkoutId,
    );
    if (!workout) {
      continue;
    }
    return {
      checkinId: checkin.id,
      challengeId: checkin.challenge_id,
      proofId,
      method: part.method,
      healthWorkoutId: part.healthWorkoutId ?? null,
      hadCard: /^https?:\/\//i.test(String(part.url ?? '')),
      caption: part.caption ?? null,
      health,
      workout,
    };
  }
  return null;
}
