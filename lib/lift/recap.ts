import { muscleSummary } from '@/lib/lift/muscles';
import { overloadChipLabel } from '@/lib/lift/overload';
import { formatLiftNumber, sessionTitle, shortDate } from '@/lib/lift/session';
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
  /** "+2.5 lb · +1 rep", or empty when this session was not bumped. */
  overloadChip: string;
};

/** A card needs at least one finished working set; an abandoned session is not a brag. */
export function hasShareableWork(draft: LiftSessionDraft | null | undefined): boolean {
  if (!draft) {
    return false;
  }
  return draft.exercises.some((exercise) =>
    exercise.sets.some((set) => set.kind === 'work' && set.completedAt),
  );
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
    return {
      key: exercise.key || `exercise-${index}`,
      name: exercise.name,
      detail: exerciseDetail(exercise, draft.unit),
      superset: false,
    };
  });

  const setCount = draft.exercises.reduce(
    (total, exercise) => total + completedWorkSets(exercise).length,
    0,
  );

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
    overloadChip: overloadChipLabel(draft.overloadSummary),
  };
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
