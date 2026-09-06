import type { Challenge } from '@/lib/types';

/**
 * Whether a workout is worth offering to this challenge at all.
 *
 * Deliberately stricter than `challengeAcceptsWorkoutProof`, which counts any `min_minutes` above 1
 * as a duration signal. Every row in production carries the default `min_minutes: 30` — including
 * the Prayer Challenge — so that signal says nothing about the challenge being fitness-shaped, and
 * relying on it is what offered a pickleball session to Prayer.
 *
 * The two signals that do mean something are both already on the row:
 *  - a proof method that measures effort on a device (heart rate, distance, steps, a workout)
 *  - fitness wording in the task, title, rules or description
 *
 * Anything else — prayer, acknowledgment, photo-only chores, honor-only non-fitness — is not offered.
 */
export function isFitnessShapedChallenge(
  challenge?: {
    proofs?: Challenge['proofs'];
    proof_type?: string | null;
    proof_requirements?: unknown;
    task?: string | null;
    tasks?: unknown[] | null;
    rules?: string | null;
    description?: string | null;
    title?: string | null;
  } | null,
): boolean {
  if (!challenge) {
    return false;
  }
  return hasEffortProof(challenge) || FITNESS_WORDS.test(challengeText(challenge));
}

/** Proof methods that can only be satisfied by physical effort a device measured. */
const EFFORT_METHODS = new Set(['hr', 'distance', 'steps', 'workout', 'duration']);

/**
 * Fitness wording. Kept to words that describe moving a body, so devotional and chore challenges do
 * not match. "hr" and "bpm" are word-bounded so they cannot fire inside an unrelated word.
 */
const FITNESS_WORDS =
  /\b(run|runs|running|ran|jog|jogging|walk|walks|walking|hike|hiking|bike|biking|cycl\w*|ride|rides|riding|swim|swims|swimming|row|rowing|yoga|pilates|stretch\w*|strength|weights?|lift|lifts|lifting|gym|cardio|hiit|crossfit|workout|workouts|work\s?out|exercise|exercises|exercising|train|trains|training|sport|sports|pickleball|tennis|basketball|football|soccer|golf|ski|skiing|surf|surfing|climb|climbing|treadmill|elliptical|peloton|steps|mile|miles|kilometer\w*|km|marathon|5k|10k|distance|pace|heart[-\s]?rate|hr|bpm|calorie|calories)\b/i;

function hasEffortProof(challenge: {
  proofs?: Challenge['proofs'];
  proof_type?: string | null;
}): boolean {
  const methods = Array.isArray(challenge.proofs)
    ? challenge.proofs.map((proof) => String(proof?.method ?? '').trim().toLowerCase())
    : [];
  if (methods.some((method) => EFFORT_METHODS.has(method))) {
    return true;
  }
  return EFFORT_METHODS.has(String(challenge.proof_type ?? '').trim().toLowerCase());
}

function challengeText(challenge: {
  task?: string | null;
  tasks?: unknown[] | null;
  rules?: string | null;
  description?: string | null;
  title?: string | null;
}): string {
  const taskLabels = Array.isArray(challenge.tasks)
    ? challenge.tasks.map((task) => {
        const row = task as { label?: unknown; title?: unknown; name?: unknown } | null;
        return [row?.label, row?.title, row?.name].filter((value) => typeof value === 'string').join(' ');
      })
    : [];
  return [challenge.task, challenge.rules, challenge.description, challenge.title, ...taskLabels]
    .filter(Boolean)
    .join(' ');
}
