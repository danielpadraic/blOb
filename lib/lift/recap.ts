import { muscleSummary } from '@/lib/lift/muscles';
import { overloadChipLabel } from '@/lib/lift/overload';
import {
  cardioTypeLabel,
  formatDuration,
  formatLiftNumber,
  sessionTitle,
  shortDate,
  timedRowLabel,
} from '@/lib/lift/session';
import type { LiftExerciseDraft, LiftSessionDraft, LiftSetDraft } from '@/lib/lift/types';
import type { WeightUnit } from '@/lib/types';

/**
 * The recap card: what a finished session looks like once it leaves the logging screen.
 *
 * This is the model behind the in-app card on Home and Live, and behind the check-in attach. It is
 * deliberately lossy — a card is a brag, not a spreadsheet. Warm-ups, body weight, and anything the
 * user did not finish stay out of it.
 */

/** Cards stay short. Anything past this collapses into "+N more". */
export const RECAP_MAX_LINES = 6;

export type LiftRecapLine = {
  key: string;
  /** "Flat DB Bench" or "A1 Incline BB · A2 DB Flyes" for a superset block. */
  name: string;
  /** "4 × 52.5 × 8–10", or null when the sets carried no numbers. */
  detail: string | null;
  superset: boolean;
};

export type LiftRecap = {
  sessionId: string;
  title: string;
  /** "Chest · Triceps" — the muscles, without the date the title already carries. */
  muscles: string;
  date: string;
  unit: WeightUnit;
  lines: LiftRecapLine[];
  /** How many exercises did not fit on the card. */
  moreCount: number;
  exerciseCount: number;
  setCount: number;
  /** Weight times reps across every counted working set, or 0 when nothing carried numbers. */
  totalVolume: number;
  /** "12,480 lb moved", or empty when there is no volume to speak of. */
  volumeLine: string;
  /** Total cardio time in the session, or 0 when there was none. */
  cardioSeconds: number;
  /** "+2.5 lb · +1 rep", or empty when this session was not bumped. */
  overloadChip: string;
};

/**
 * Everything the session actually moved: weight times reps, summed over the counted working sets.
 *
 * This is the one number that grows when a session goes well but no single lift got heavier — five
 * sets instead of four is real work that a "heaviest weight" line hides completely. Sets with no
 * weight or no reps contribute nothing rather than guessing, and warm-ups stay out for the same
 * reason they stay off the card.
 */
export function sessionVolume(draft: LiftSessionDraft): number {
  let total = 0;
  for (const exercise of draft.exercises) {
    if (exercise.kind !== 'strength') {
      continue;
    }
    for (const set of completedWorkSets(exercise)) {
      if (set.weight != null && set.reps != null) {
        total += set.weight * set.reps;
      }
    }
  }
  // Half-pound plates exist; half a pound of total volume is noise.
  return Math.round(total);
}

/** Total seconds of cardio, so the card can speak for a session that was not about weight. */
export function sessionCardioSeconds(draft: LiftSessionDraft): number {
  return draft.exercises.reduce(
    (total, exercise) =>
      exercise.kind === 'cardio' ? total + Math.max(0, exercise.durationSeconds ?? 0) : total,
    0,
  );
}

/**
 * A card needs at least one finished working set; an abandoned session is not a brag.
 *
 * Cardio counts too. A ten minute row is a session someone did, and refusing to let them share it
 * because it has no reps would make the whole cardio feature a dead end. A rest on its own does
 * not count — resting is not the workout.
 */
export function hasShareableWork(draft: LiftSessionDraft | null | undefined): boolean {
  if (!draft) {
    return false;
  }
  return draft.exercises.some((exercise) => {
    if (exercise.kind === 'cardio') {
      return (exercise.durationSeconds ?? 0) > 0;
    }
    if (exercise.kind === 'rest') {
      return false;
    }
    return exercise.sets.some((set) => set.kind === 'work' && set.completedAt);
  });
}

function completedWorkSets(exercise: LiftExerciseDraft): LiftSetDraft[] {
  const done = exercise.sets.filter((set) => set.kind === 'work' && set.completedAt);
  // A session shared straight after logging may have numbers but no checkmarks on some exercises.
  // Showing every working set beats showing a blank line.
  return done.length ? done : exercise.sets.filter((set) => set.kind === 'work');
}

/**
 * "4 × 52.5 × 10", or "4 × 52.5 × 8–10" when the reps moved across the sets.
 *
 * Heaviest weight rather than average: that is the number the lifter remembers. Reps come from the
 * last completed set, because that is where the set actually landed.
 */
export function exerciseDetail(exercise: LiftExerciseDraft, unit: WeightUnit): string | null {
  // A timed row has no sets to summarise — its clock is the whole story.
  if (exercise.kind === 'cardio') {
    return [
      cardioTypeLabel(exercise.cardioType),
      formatDuration(exercise.durationSeconds),
      exercise.intensity ? `${exercise.intensity}/10` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (exercise.kind === 'rest') {
    return formatDuration(exercise.durationSeconds);
  }

  const sets = completedWorkSets(exercise);
  if (!sets.length) {
    return null;
  }

  const weights = sets.map((set) => set.weight).filter((value): value is number => value != null);
  const reps = sets.map((set) => set.reps).filter((value): value is number => value != null);
  const count = sets.length;

  if (!weights.length && !reps.length) {
    return `${count} ${count === 1 ? 'set' : 'sets'}`;
  }

  const parts = [String(count)];
  if (weights.length) {
    parts.push(`${formatLiftNumber(Math.max(...weights))} ${unit}`);
  }
  if (reps.length) {
    const low = Math.min(...reps);
    const high = Math.max(...reps);
    parts.push(low === high ? formatLiftNumber(high) : `${formatLiftNumber(low)}–${formatLiftNumber(high)}`);
  }
  return parts.join(' × ');
}

/** Superset partners collapse into one line so the pair reads the way it was performed. */
function groupExercises(draft: LiftSessionDraft): LiftExerciseDraft[][] {
  const groups: LiftExerciseDraft[][] = [];
  const seen = new Set<number>();
  for (const exercise of draft.exercises) {
    const group = exercise.supersetGroup;
    if (group == null) {
      groups.push([exercise]);
      continue;
    }
    if (seen.has(group)) {
      continue;
    }
    seen.add(group);
    const partners = draft.exercises.filter((row) => row.supersetGroup === group);
    groups.push(partners.length > 1 ? partners : [exercise]);
  }
  return groups;
}

export function buildRecap(draft: LiftSessionDraft, maxLines = RECAP_MAX_LINES): LiftRecap {
  const groups = groupExercises(draft);
  const shown = groups.slice(0, maxLines);
  const hidden = groups.slice(maxLines).reduce((total, group) => total + group.length, 0);

  const lines: LiftRecapLine[] = shown.map((group, index) => {
    if (group.length > 1) {
      return {
        key: group.map((row) => row.key).join('+') || `superset-${index}`,
        name: group.map((row, position) => `A${position + 1} ${row.name}`).join(' · '),
        detail: group
          .map((row) => exerciseDetail(row, draft.unit))
          .filter(Boolean)
          .join('  ·  ') || null,
        superset: true,
      };
    }
    const exercise = group[0];
    const timed = exercise.kind === 'cardio' || exercise.kind === 'rest';
    return {
      key: exercise.key || `exercise-${index}`,
      name: timed ? timedRowLabel(exercise) : exercise.name,
      detail: exerciseDetail(exercise, draft.unit),
      superset: false,
    };
  });

  const setCount = draft.exercises.reduce(
    (total, exercise) => total + completedWorkSets(exercise).length,
    0,
  );

  const totalVolume = sessionVolume(draft);

  return {
    sessionId: draft.id,
    title: sessionTitle(draft),
    muscles: muscleSummary(draft.muscleKeys),
    date: shortDate(draft.performedAt),
    unit: draft.unit,
    lines,
    moreCount: hidden,
    exerciseCount: draft.exercises.length,
    setCount,
    totalVolume,
    volumeLine: totalVolume > 0 ? `${formatVolume(totalVolume)} ${draft.unit} moved` : '',
    cardioSeconds: sessionCardioSeconds(draft),
    overloadChip: overloadChipLabel(draft.overloadSummary),
  };
}

/** Thousands separators, because 12480 and 1248 are hard to tell apart at a glance. */
export function formatVolume(total: number): string {
  return Math.round(total).toLocaleString('en-US');
}

/**
 * The plain-text body stored on the post, so a client that has not been updated still shows
 * something readable instead of an empty card.
 */
export function recapFallbackText(recap: LiftRecap): string {
  const rows = recap.lines.map((line) =>
    line.detail ? `${line.name} · ${line.detail}` : line.name,
  );
  if (recap.moreCount > 0) {
    rows.push(`+${recap.moreCount} more`);
  }
  return [recap.title, ...rows].join('\n');
}
