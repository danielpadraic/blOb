export type WorkoutPlanActivity =
  | 'running'
  | 'walking'
  | 'cycling'
  | 'swimming'
  | 'yoga'
  | 'traditionalStrengthTraining'
  | 'mixedCardio';

export type ChallengeWorkoutPlan = {
  activityType: WorkoutPlanActivity;
  locationType: 'indoor' | 'outdoor';
  goal: { type: 'time'; seconds: number } | { type: 'open' };
  displayName: string;
};

const MINUTE_RE = /(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)\b/i;
const CALORIE_RE = /(\d+(?:\.\d+)?)\s*(?:kcal|calorie|calories)\b/i;
const DISTANCE_RE = /(\d+(?:\.\d+)?)\s*(?:km|k|mile|miles|mi)\b/i;

export function challengeToWorkoutPlan(challenge: {
  title?: string | null;
  task?: string | null;
  description?: string | null;
  rules?: string | null;
  min_minutes?: number | null;
  frequency?: string | null;
}): ChallengeWorkoutPlan {
  const text = [challenge.task, challenge.rules, challenge.description, challenge.title]
    .filter(Boolean)
    .join(' ');
  const displayName = shortTitle(challenge.title);
  const activityType = activityFromText(text);
  return {
    activityType,
    locationType: outdoorActivity(activityType) ? 'outdoor' : 'indoor',
    goal: goalFromChallenge(challenge, text),
    displayName,
  };
}

function shortTitle(title?: string | null): string {
  const trimmed = String(title ?? '').trim() || 'blOb workout';
  return trimmed.length > 32 ? `${trimmed.slice(0, 31).trim()}…` : trimmed;
}

function goalFromChallenge(
  challenge: { min_minutes?: number | null; frequency?: string | null },
  text: string,
): ChallengeWorkoutPlan['goal'] {
  const minMinutes = Number(challenge.min_minutes);
  if (Number.isFinite(minMinutes) && minMinutes > 1) {
    return { type: 'time', seconds: Math.round(minMinutes * 60) };
  }
  const fromText = text.match(MINUTE_RE);
  if (fromText) {
    const minutes = Number(fromText[1]);
    if (Number.isFinite(minutes) && minutes > 0) {
      return { type: 'time', seconds: Math.round(minutes * 60) };
    }
  }
  if (CALORIE_RE.test(text) || DISTANCE_RE.test(text)) {
    // Explicit distance/calorie exists, but we only send those when mapped.
    // Time is still preferred; otherwise open. Do not invent a number.
  }
  return { type: 'open' };
}

function activityFromText(text: string): WorkoutPlanActivity {
  const name = text.toLowerCase();
  if (name.includes('run') || name.includes('jog')) {
    return 'running';
  }
  if (name.includes('walk') || name.includes('hik')) {
    return 'walking';
  }
  if (name.includes('bike') || name.includes('cycl')) {
    return 'cycling';
  }
  if (name.includes('swim')) {
    return 'swimming';
  }
  if (name.includes('yoga')) {
    return 'yoga';
  }
  if (
    name.includes('strength') ||
    name.includes('weight') ||
    name.includes('lift') ||
    name.includes('core') ||
    name.includes('hiit')
  ) {
    return 'traditionalStrengthTraining';
  }
  return 'mixedCardio';
}

function outdoorActivity(activity: WorkoutPlanActivity): boolean {
  return activity === 'running' || activity === 'walking' || activity === 'cycling';
}
