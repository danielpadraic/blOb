/**
 * Which challenges to offer after a workout lands on Home.
 *
 * The rule is narrow on purpose. Posting a workout to the feed is social and always allowed; being
 * asked "also count this toward X?" should only happen when the answer would actually work. So a
 * challenge is only offered when the same gate that /submit will apply already passes, against that
 * challenge's own minutes and heart rate rules. Nothing here checks anyone in — it decides what to
 * ask.
 */

import { isCorporateChallenge } from '@/lib/challengeExperience';
import { challengeAcceptsWorkoutProof } from '@/lib/health/acceptsWorkout';
import { resolveChallengeProofs } from '@/lib/challengeProofs';
import { checkedInForCurrentPeriod } from '@/lib/lobbyChallenge';
import { hasChallengeEnded } from '@/lib/settlement';
import {
  evaluateWorkoutProof,
  type ElevatedHrInput,
  type GateWorkout,
} from '@/lib/health/workoutProofGate';

/** Statuses where a check-in is a live possibility. Draft and post-end states are not. */
const LOGGABLE_STATUSES = new Set([
  'open',
  'starting',
  'in_progress',
  'filling',
  'arming',
  'live',
]);

/** The shape read here. Wider than Challenge so a lobby row or a feed preview can be passed in. */
export type PromptChallenge = {
  id: string;
  title?: string | null;
  status?: string | null;
  category?: string | null;
  min_minutes?: number | null;
  frequency?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  timezone?: string | null;
  days_required?: number | null;
  is_unlimited?: boolean | null;
  is_official?: boolean | null;
  series_id?: string | null;
  privacy_mode?: string | null;
  proofs?: unknown;
  proof_type?: unknown;
  proof_requirements?: unknown;
  challenge_type?: string | null;
  tasks?: unknown;
  scoring_method?: string | null;
  scoring_config?: unknown;
  comparable_points_config?: unknown;
  task?: string | null;
  rules?: string | null;
  description?: string | null;
  day_windows?: unknown;
};

export type PromptCandidate = {
  challenge: PromptChallenge;
  /** This user's check-in row for the current period, when one exists. */
  checkin?: { status?: string | null; submitted_at?: string | null; period_key?: unknown } | null;
};

export type PromptTarget = {
  challengeId: string;
  title: string;
  /** The sessions that count for this challenge. Can be a subset on an elevated-HR challenge. */
  countedIds: string[];
  countedSec: number;
  /** Worth showing on the row, e.g. the missing birth year. Never a refusal. */
  nudge: string | null;
};

/** True when this challenge requires heart rate, which is what makes it an elevated-HR challenge. */
export function challengeRequiresElevatedHr(challenge: PromptChallenge): boolean {
  return resolveChallengeProofs(challenge as never).some((proof) => proof.method === 'hr');
}

/**
 * Filters candidates down to the challenges worth asking about.
 *
 * Corporate lobbies are excluded here rather than deeper down: their check-ins stay inside the
 * challenge, so surfacing one from a Home post would leak a private lobby into a public flow.
 */
export function workoutPromptTargets(input: {
  workouts: GateWorkout[];
  candidates: PromptCandidate[];
  hr?: ElevatedHrInput;
  now?: Date;
}): PromptTarget[] {
  const now = input.now ?? new Date();
  if (input.workouts.length === 0) {
    return [];
  }

  const targets: PromptTarget[] = [];
  for (const candidate of input.candidates) {
    const challenge = candidate.challenge;
    if (!challenge?.id) {
      continue;
    }
    if (!LOGGABLE_STATUSES.has(String(challenge.status ?? '').toLowerCase())) {
      continue;
    }
    if (hasChallengeEnded(challenge, now)) {
      continue;
    }
    if (isCorporateChallenge(challenge as never)) {
      continue;
    }
    if (!challengeAcceptsWorkoutProof(challenge as never)) {
      continue;
    }
    // Already done for this period: the incremental proof lock owns that post, and a second prompt
    // would invite them to redo work they have finished.
    if (checkedInForCurrentPeriod(candidate.checkin ?? null, challenge as never)) {
      continue;
    }

    const result = evaluateWorkoutProof({
      workouts: input.workouts,
      rules: {
        minMinutes: challenge.min_minutes ?? null,
        requiresElevatedHr: challengeRequiresElevatedHr(challenge),
      },
      hr: input.hr,
      now,
    });
    if (!result.ok) {
      continue;
    }

    targets.push({
      challengeId: challenge.id,
      title: String(challenge.title ?? '').trim() || 'this challenge',
      countedIds: result.countedIds,
      countedSec: result.countedSec,
      nudge: result.nudge,
    });
  }
  return targets;
}

/** "Also count this toward Sunrise Miles?" — one challenge. Several get a plain heading. */
export function workoutPromptTitle(targets: PromptTarget[]): string {
  if (targets.length === 1) {
    return `Also count this toward ${targets[0].title}?`;
  }
  return 'Also count this toward these challenges?';
}
