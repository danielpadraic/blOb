/**
 * Which live challenges a finished lift can be attached to.
 *
 * There is no `activity_type` column on challenges — a lifting challenge is one whose task reads
 * like lifting. So this matches the words a person would actually write, over the same fields the
 * rest of the app already reads (`task`, `title`), and stays narrow on purpose: showing a lift card
 * as proof on a running challenge is worse than not offering the attach at all.
 */

const LIFT_RE =
  /\b(lift|lifts|lifting|lifted|weight[- ]?train\w*|weights?[- ]?room|weightlift\w*|powerlift\w*|barbell|dumbbell|bench[- ]?press|deadlift\w*|squats?|overhead[- ]?press|strength|hypertrophy|resistance[- ]?train\w*|gym[- ]?session|push[- ]?pull[- ]?legs|ppl)\b/i;

/** "Gym" on its own is a place, not a task, so it only counts next to a training word. */
const GYM_RE = /\bgym\b/i;
const GYM_CONTEXT_RE = /\b(session|workout|day|train\w*|split|routine|lift\w*|weights?)\b/i;

/** Cardio words that make a "gym" mention mean the treadmill rather than the rack. */
const CARDIO_ONLY_RE =
  /\b(run|running|jog\w*|walk\w*|steps?|cycl\w*|bike|biking|swim\w*|row(?:ing)?|marathon|5k|10k|yoga|pilates|stretch\w*|meditat\w*)\b/i;

type ChallengeLike = {
  task?: string | null;
  title?: string | null;
  tasks?: unknown[] | null;
};

function haystack(challenge: ChallengeLike): string {
  const taskNames = (challenge.tasks ?? [])
    .map((task) => {
      if (typeof task === 'string') {
        return task;
      }
      const named = task as { name?: unknown; title?: unknown; label?: unknown } | null;
      return String(named?.name ?? named?.title ?? named?.label ?? '');
    })
    .filter(Boolean);
  return [challenge.task, challenge.title, ...taskNames].filter(Boolean).join(' ');
}

/**
 * True when this challenge's task is lifting.
 *
 * A challenge that names both lifting and cardio still counts — the user picked it, and their lift
 * really is proof for that period. Only a bare "gym" beside cardio words is rejected.
 */
export function isLiftingChallenge(challenge: ChallengeLike | null | undefined): boolean {
  if (!challenge) {
    return false;
  }
  const text = haystack(challenge);
  if (!text.trim()) {
    return false;
  }
  if (LIFT_RE.test(text)) {
    return true;
  }
  if (GYM_RE.test(text) && GYM_CONTEXT_RE.test(text)) {
    return !CARDIO_ONLY_RE.test(text);
  }
  return false;
}

/** The subset of the user's loggable challenges a lift can be attached to. */
export function liftingChallenges<T extends ChallengeLike>(challenges: readonly T[] | null | undefined): T[] {
  return (challenges ?? []).filter((challenge) => isLiftingChallenge(challenge));
}
