import { isCorporateChallenge, usesComparablePointsScoring } from '@/lib/challengeExperience';
import { requiredChallengeProofs } from '@/lib/challenges';
import type { Challenge } from '@/lib/types';

const ACTIVITY_RE =
  /\b(run|running|jog|walk|hike|bike|cycl|swim|yoga|strength|lift|cardio|workout|hr|heart[-\s]?rate)\b/i;
const MINUTE_RE = /(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)\b/i;

/** Start on Watch / Use-a-workout only when proof can accept a workout. Selfie-only stays camera. */
export function challengeAcceptsWorkoutProof(
  challenge?: {
    proofs?: Challenge['proofs'];
    proof_type?: Challenge['proof_type'];
    proof_requirements?: Challenge['proof_requirements'];
    challenge_type?: Challenge['challenge_type'];
    tasks?: Challenge['tasks'];
    min_minutes?: number | null;
    task?: string | null;
    rules?: string | null;
    description?: string | null;
    title?: string | null;
    scoring_method?: string | null;
    scoring_config?: unknown;
    comparable_points_config?: unknown;
    privacy_mode?: string | null;
    is_official?: boolean | null;
    series_id?: string | null;
    category?: string | null;
  } | null,
): boolean {
  if (!challenge) {
    return false;
  }
  const proofs = requiredChallengeProofs({
    proofs: challenge.proofs,
    proof_type: challenge.proof_type,
    proof_requirements: challenge.proof_requirements ?? [],
    challenge_type: challenge.challenge_type ?? null,
    tasks: challenge.tasks ?? [],
    scoring_method: challenge.scoring_method,
    scoring_config: challenge.scoring_config,
    comparable_points_config: challenge.comparable_points_config,
    privacy_mode: challenge.privacy_mode,
    is_official: Boolean(challenge.is_official),
    series_id: challenge.series_id ?? null,
    category: challenge.category ?? null,
  });
  const hasHr = proofs.some((proof) => proof.method === 'hr');
  if (usesComparablePointsScoring(challenge) || isCorporateChallenge(challenge)) {
    return hasHr;
  }
  const minMinutes = Number(challenge.min_minutes);
  const hasDuration = (Number.isFinite(minMinutes) && minMinutes > 1) || MINUTE_RE.test(blobText(challenge));
  const hasActivity = ACTIVITY_RE.test(blobText(challenge));
  return hasHr || hasDuration || hasActivity;
}

function blobText(challenge: {
  task?: string | null;
  rules?: string | null;
  description?: string | null;
  title?: string | null;
}): string {
  return [challenge.task, challenge.rules, challenge.description, challenge.title]
    .filter(Boolean)
    .join(' ');
}
