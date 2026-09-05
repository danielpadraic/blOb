import { orderMuscles } from '@/lib/lift/muscles';
import { newId, newLocalKey } from '@/lib/lift/ids';
import type {
  LiftOverloadPlan,
  LiftOverloadStep,
  LiftOverloadSummary,
  LiftSessionDraft,
  LiftSetDraft,
} from '@/lib/lift/types';
import type { WeightUnit } from '@/lib/types';

/**
 * Progressive overload: copy last time's session and bump every working set by a fixed amount or a
 * percentage.
 *
 * The whole feature is these pure functions plus one sheet. Nothing here is remembered between
 * sessions — a bump is a decision the user makes each time, never a stored "always +5".
 */

/** Bars load in pairs, so a bumped weight lands on a plate you can actually make. */
export const WEIGHT_ROUNDING: Record<WeightUnit, number> = { lb: 2.5, kg: 1.25 };

export const EMPTY_OVERLOAD: LiftOverloadPlan = {
  weight: { mode: 'off', amount: 0 },
  reps: { mode: 'off', amount: 0 },
};

/** The Apply button stays off until they have actually asked for something. */
export function isOverloadActive(plan: LiftOverloadPlan): boolean {
  return stepIsActive(plan.weight) || stepIsActive(plan.reps);
}

function stepIsActive(step: LiftOverloadStep): boolean {
  return step.mode !== 'off' && Number.isFinite(step.amount) && step.amount > 0;
}

function roundTo(value: number, increment: number): number {
  if (!(increment > 0)) {
    return value;
  }
  return Math.round(value / increment) * increment;
}

/** Trims float noise from a percentage so 52.5 * 1.05 does not read as 55.125000000000004. */
function tidy(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The bumped weight for one set, or null when there is nothing to bump.
 *
 * An empty weight stays empty: a set they never loaded is not "0 + 5". A percentage of zero is
 * still zero, so bodyweight rows are left alone too.
 */
export function nextWeight(
  current: number | null,
  step: LiftOverloadStep,
  unit: WeightUnit,
): number | null {
  if (current == null || !stepIsActive(step)) {
    return current;
  }
  if (current <= 0) {
    return current;
  }
  const raw = step.mode === 'percent' ? current * (1 + step.amount / 100) : current + step.amount;
  const rounded = roundTo(raw, WEIGHT_ROUNDING[unit] ?? WEIGHT_ROUNDING.lb);
  // Rounding down to the same number would make Apply look broken, so keep at least one increment.
  const increment = WEIGHT_ROUNDING[unit] ?? WEIGHT_ROUNDING.lb;
  return tidy(rounded <= current ? current + increment : rounded);
}

/**
 * The bumped reps for one set. Reps are whole: you cannot do 10.5 pull-ups.
 * A set with no reps, or zero reps, is left as it is.
 */
export function nextReps(current: number | null, step: LiftOverloadStep): number | null {
  if (current == null || !stepIsActive(step) || current <= 0) {
    return current;
  }
  const raw = step.mode === 'percent' ? current * (1 + step.amount / 100) : current + step.amount;
  const rounded = Math.round(raw);
  return Math.max(1, rounded <= current ? current + 1 : rounded);
}

/** "52.5 → 55". Null when nothing would change, so the sheet can hide the line. */
export function previewLine(
  current: number | null,
  next: number | null,
  suffix?: string,
): string | null {
  if (current == null || next == null || current === next) {
    return null;
  }
  const tail = suffix ? ` ${suffix}` : '';
  return `${trimNumber(current)} → ${trimNumber(next)}${tail}`;
}

function trimNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/**
 * The heaviest working set in the session, which is what the sheet previews against.
 * Previewing the first set would show a warm-up-ish number and undersell the bump.
 */
export function previewSet(draft: LiftSessionDraft): LiftSetDraft | null {
  let best: LiftSetDraft | null = null;
  for (const exercise of draft.exercises) {
    for (const set of exercise.sets) {
      if (set.kind !== 'work' || set.weight == null) {
        continue;
      }
      if (!best || (best.weight ?? 0) < set.weight) {
        best = set;
      }
    }
  }
  if (best) {
    return best;
  }
  // Bodyweight session: fall back to the first working set so the reps preview still has a subject.
  for (const exercise of draft.exercises) {
    const set = exercise.sets.find((row) => row.kind === 'work');
    if (set) {
      return set;
    }
  }
  return null;
}

/**
 * Applies the plan to a fresh copy of the source session.
 *
 * Every working set on every exercise moves. Warm-ups copy across untouched — they are the ramp to
 * the work, not the work. Superset grouping and running order survive because the exercise list is
 * copied in place.
 */
export function applyOverload(
  source: LiftSessionDraft,
  plan: LiftOverloadPlan,
): LiftSessionDraft {
  const active = isOverloadActive(plan);
  return {
    id: newId(),
    title: null,
    performedAt: new Date().toISOString(),
    completedAt: null,
    muscleKeys: orderMuscles(source.muscleKeys),
    unit: source.unit,
    sourceSessionId: source.id,
    overloadFromSessionId: active ? source.id : null,
    overloadSummary: active ? summarizeOverload(plan, source.unit) : null,
    exercises: source.exercises.map((exercise) =>
      bumpExercise(exercise, plan, source.unit),
    ),
  };
}

/**
 * Bumps a session that already exists, keeping its id.
 *
 * This is the Overload entry point on a session copied from history: they are already looking at
 * last time's numbers, so the sheet raises those numbers rather than spawning a second session.
 */
export function bumpSessionInPlace(
  draft: LiftSessionDraft,
  plan: LiftOverloadPlan,
): LiftSessionDraft {
  if (!isOverloadActive(plan)) {
    return draft;
  }
  return {
    ...draft,
    // The session it was copied from is the session it is now built on. The save RPC drops this if
    // the source turns out not to be theirs, so an imported card can never claim their overload.
    overloadFromSessionId: draft.overloadFromSessionId ?? draft.sourceSessionId ?? null,
    overloadSummary: summarizeOverload(plan, draft.unit),
    exercises: draft.exercises.map((exercise) => bumpExercise(exercise, plan, draft.unit)),
  };
}

function bumpExercise(
  exercise: LiftSessionDraft['exercises'][number],
  plan: LiftOverloadPlan,
  unit: WeightUnit,
): LiftSessionDraft['exercises'][number] {
  return {
    key: newLocalKey('ex'),
    exerciseId: exercise.exerciseId,
    customExerciseId: exercise.customExerciseId,
    name: exercise.name,
    muscleKey: exercise.muscleKey,
    supersetGroup: exercise.supersetGroup,
    sets: exercise.sets.map((set) => ({
      key: newLocalKey('set'),
      kind: set.kind,
      // Warm-ups are the ramp to the work, not the work. They copy across untouched.
      weight: set.kind === 'work' ? nextWeight(set.weight, plan.weight, unit) : set.weight,
      reps: set.kind === 'work' ? nextReps(set.reps, plan.reps) : set.reps,
      completedAt: null,
    })),
  };
}

/** What gets stored on the new session and printed on the recap chip. */
export function summarizeOverload(
  plan: LiftOverloadPlan,
  unit: WeightUnit,
): LiftOverloadSummary | null {
  const weight = stepIsActive(plan.weight)
    ? { mode: plan.weight.mode as 'amount' | 'percent', amount: plan.weight.amount, unit }
    : null;
  const reps = stepIsActive(plan.reps)
    ? { mode: plan.reps.mode as 'amount' | 'percent', amount: plan.reps.amount }
    : null;
  if (!weight && !reps) {
    return null;
  }
  return { weightDelta: weight, repsDelta: reps };
}

/** "+2.5 lb · +1 rep" for the chip on the recap card. Empty string when there was no bump. */
export function overloadChipLabel(summary: LiftOverloadSummary | null | undefined): string {
  if (!summary) {
    return '';
  }
  const parts: string[] = [];
  const weight = summary.weightDelta;
  if (weight) {
    parts.push(
      weight.mode === 'percent'
        ? `+${trimNumber(weight.amount)}% weight`
        : `+${trimNumber(weight.amount)} ${weight.unit}`,
    );
  }
  const reps = summary.repsDelta;
  if (reps) {
    parts.push(
      reps.mode === 'percent'
        ? `+${trimNumber(reps.amount)}% reps`
        : `+${trimNumber(reps.amount)} ${reps.amount === 1 ? 'rep' : 'reps'}`,
    );
  }
  return parts.join(' · ');
}

/**
 * Overload is only honest before they start lifting. Once a working set is checked off, bumping the
 * session would rewrite numbers they already performed, so the entry point disappears instead of
 * offering a half-measure.
 */
export function canOverloadSession(draft: LiftSessionDraft | null | undefined): boolean {
  if (!draft || draft.completedAt) {
    return false;
  }
  if (!draft.exercises.length) {
    // Nothing to bump on a blank session.
    return false;
  }
  const hasNumbers = draft.exercises.some((exercise) =>
    exercise.sets.some((set) => set.kind === 'work' && (set.weight != null || set.reps != null)),
  );
  if (!hasNumbers) {
    return false;
  }
  return !draft.exercises.some((exercise) =>
    exercise.sets.some((set) => set.kind === 'work' && set.completedAt),
  );
}

/** Parses the jsonb column back into a summary, tolerating anything unexpected. */
export function parseOverloadSummary(value: unknown): LiftOverloadSummary | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as { weightDelta?: unknown; repsDelta?: unknown };
  const weight = parseDelta(raw.weightDelta);
  const reps = parseDelta(raw.repsDelta);
  if (!weight && !reps) {
    return null;
  }
  return {
    weightDelta: weight ? { ...weight, unit: parseUnit(raw.weightDelta) } : null,
    repsDelta: reps,
  };
}

function parseDelta(value: unknown): { mode: 'amount' | 'percent'; amount: number } | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as { mode?: unknown; amount?: unknown };
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return { mode: raw.mode === 'percent' ? 'percent' : 'amount', amount };
}

function parseUnit(value: unknown): WeightUnit {
  const unit = (value as { unit?: unknown } | null)?.unit;
  return unit === 'kg' ? 'kg' : 'lb';
}
