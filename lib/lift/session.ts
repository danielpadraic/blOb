import { newId, newLocalKey } from '@/lib/lift/ids';
import { isMuscleKey, muscleShortLabel, orderMuscles, type MuscleKey } from '@/lib/lift/muscles';
import { parseOverloadSummary } from '@/lib/lift/overload';
import type {
  LiftExerciseDraft,
  LiftSavePayloadExercise,
  LiftSessionDraft,
  LiftSessionExerciseRow,
  LiftSessionRow,
  LiftSessionSummary,
  LiftSetDraft,
  LiftSetKind,
  LiftSetRow,
} from '@/lib/lift/types';
import type { WeightUnit } from '@/lib/types';

/**
 * Pure rules for a lift session.
 *
 * Everything here is a plain function on a draft so the screen stays a renderer and the behaviour
 * is unit-testable: steppers, clamps, superset grouping, section order, titling, and the payload
 * the save RPC receives.
 */

/** Plate math, not arithmetic: pounds move in fives, kilos in 2.5s. */
export const WEIGHT_STEP: Record<WeightUnit, number> = { lb: 5, kg: 2.5 };
export const REPS_STEP = 1;

const MAX_WEIGHT = 2000;
const MAX_REPS = 1000;

// -------------------------------------------------------------------------- numbers

/** Rounds to one decimal and drops a trailing ".0" so the field reads "135", not "135.0". */
export function formatLiftNumber(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '';
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function clampNumber(value: number, max: number): number {
  const rounded = Math.round(value * 10) / 10;
  if (rounded < 0) {
    return 0;
  }
  return rounded > max ? max : rounded;
}

/** Blur handler for the weight field: junk becomes empty, anything else becomes a sane number. */
export function clampWeightInput(text: string): number | null {
  const parsed = parseLoose(text);
  return parsed == null ? null : clampNumber(parsed, MAX_WEIGHT);
}

/** Blur handler for reps. Same rules, different ceiling. */
export function clampRepsInput(text: string): number | null {
  const parsed = parseLoose(text);
  return parsed == null ? null : clampNumber(parsed, MAX_REPS);
}

/** Accepts "135", "135.5", "135,5", " 135lb ". Rejects everything else. */
function parseLoose(text: string): number | null {
  const cleaned = String(text ?? '')
    .replace(/,/g, '.')
    .replace(/[^0-9.]/g, '');
  if (!cleaned || cleaned === '.') {
    return null;
  }
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** − / + on the weight field. An empty field steps up from zero and never below it. */
export function stepWeight(value: number | null, direction: 1 | -1, unit: WeightUnit): number {
  const step = WEIGHT_STEP[unit] ?? WEIGHT_STEP.lb;
  const base = value ?? 0;
  return clampNumber(base + step * direction, MAX_WEIGHT);
}

export function stepReps(value: number | null, direction: 1 | -1): number {
  return clampNumber((value ?? 0) + REPS_STEP * direction, MAX_REPS);
}

// -------------------------------------------------------------------------- drafts

export function newSetDraft(kind: LiftSetKind, seed?: Partial<LiftSetDraft>): LiftSetDraft {
  return {
    key: newLocalKey('set'),
    kind,
    weight: seed?.weight ?? null,
    reps: seed?.reps ?? null,
    completedAt: null,
  };
}

export function newSessionDraft(input: {
  muscleKeys: readonly MuscleKey[];
  unit: WeightUnit;
  performedAt?: string;
}): LiftSessionDraft {
  return {
    id: newId(),
    title: null,
    performedAt: input.performedAt ?? new Date().toISOString(),
    completedAt: null,
    muscleKeys: orderMuscles(input.muscleKeys),
    unit: input.unit,
    exercises: [],
  };
}

export function newExerciseDraft(input: {
  exerciseId?: string | null;
  customExerciseId?: string | null;
  name: string;
  muscleKey: MuscleKey;
  supersetGroup?: number | null;
  sets?: LiftSetDraft[];
}): LiftExerciseDraft {
  return {
    key: newLocalKey('ex'),
    exerciseId: input.exerciseId ?? null,
    customExerciseId: input.customExerciseId ?? null,
    name: input.name,
    muscleKey: input.muscleKey,
    supersetGroup: input.supersetGroup ?? null,
    // A new exercise opens with one work set so there is something to log into.
    sets: input.sets ?? [newSetDraft('work')],
  };
}

// -------------------------------------------------------------------------- sections

export type LiftSection = {
  muscle: MuscleKey;
  exercises: LiftExerciseDraft[];
};

/**
 * Sections in the order the muscles were picked. Every selected muscle gets a section even with no
 * exercises yet, so "Add exercise" always has a home and the picker's promise is kept on screen.
 */
export function sessionSections(draft: LiftSessionDraft): LiftSection[] {
  const order = draft.muscleKeys.length
    ? draft.muscleKeys
    : orderMuscles(draft.exercises.map((row) => row.muscleKey));
  const extras = draft.exercises
    .map((row) => row.muscleKey)
    .filter((key) => !order.includes(key));
  return [...order, ...orderMuscles(extras)].map((muscle) => ({
    muscle,
    exercises: draft.exercises.filter((row) => row.muscleKey === muscle),
  }));
}

/**
 * "A1" / "A2" for a superset pair, or null when the exercise stands alone.
 * Groups are lettered in the order they appear in the session.
 */
export function supersetLabels(draft: LiftSessionDraft): Record<string, string> {
  const letters = new Map<number, string>();
  const counts = new Map<number, number>();
  for (const exercise of draft.exercises) {
    if (exercise.supersetGroup == null) {
      continue;
    }
    counts.set(exercise.supersetGroup, (counts.get(exercise.supersetGroup) ?? 0) + 1);
  }
  const labels: Record<string, string> = {};
  const position = new Map<number, number>();
  for (const exercise of draft.exercises) {
    const group = exercise.supersetGroup;
    // A group of one is not a superset — it is a leftover after the partner was removed.
    if (group == null || (counts.get(group) ?? 0) < 2) {
      continue;
    }
    if (!letters.has(group)) {
      letters.set(group, String.fromCharCode(65 + letters.size));
    }
    const next = (position.get(group) ?? 0) + 1;
    position.set(group, next);
    labels[exercise.key] = `${letters.get(group)}${next}`;
  }
  return labels;
}

/** The exercise a new one would pair with: the last one already in that muscle section. */
export function supersetPartner(
  draft: LiftSessionDraft,
  muscle: MuscleKey,
): LiftExerciseDraft | null {
  const inSection = draft.exercises.filter((row) => row.muscleKey === muscle);
  return inSection.length ? inSection[inSection.length - 1] : null;
}

function nextSupersetGroup(draft: LiftSessionDraft): number {
  const used = draft.exercises
    .map((row) => row.supersetGroup)
    .filter((value): value is number => value != null);
  return used.length ? Math.max(...used) + 1 : 1;
}

// -------------------------------------------------------------------------- mutations

export function addExercise(
  draft: LiftSessionDraft,
  input: {
    exerciseId?: string | null;
    customExerciseId?: string | null;
    name: string;
    muscleKey: MuscleKey;
    /** Group with the exercise above it in this muscle section. */
    superset?: boolean;
  },
): LiftSessionDraft {
  const partner = input.superset ? supersetPartner(draft, input.muscleKey) : null;
  let exercises = draft.exercises;
  let group: number | null = null;

  if (partner) {
    group = partner.supersetGroup ?? nextSupersetGroup(draft);
    if (partner.supersetGroup == null) {
      const groupId = group;
      exercises = exercises.map((row) =>
        row.key === partner.key ? { ...row, supersetGroup: groupId } : row,
      );
    }
  }

  const added = newExerciseDraft({
    exerciseId: input.exerciseId,
    customExerciseId: input.customExerciseId,
    name: input.name,
    muscleKey: input.muscleKey,
    supersetGroup: group,
  });

  // Insert directly under the last exercise of that muscle so sections stay contiguous.
  const lastIndex = lastIndexForMuscle(exercises, input.muscleKey);
  const next = exercises.slice();
  next.splice(lastIndex + 1, 0, added);

  return withMuscle(
    { ...draft, exercises: next },
    input.muscleKey,
  );
}

function lastIndexForMuscle(exercises: LiftExerciseDraft[], muscle: MuscleKey): number {
  let index = -1;
  for (let i = 0; i < exercises.length; i += 1) {
    if (exercises[i].muscleKey === muscle) {
      index = i;
    }
  }
  return index === -1 ? exercises.length - 1 : index;
}

/** Adding to a muscle that was not picked at the start quietly adds it to the session. */
function withMuscle(draft: LiftSessionDraft, muscle: MuscleKey): LiftSessionDraft {
  if (draft.muscleKeys.includes(muscle)) {
    return draft;
  }
  return { ...draft, muscleKeys: orderMuscles([...draft.muscleKeys, muscle]) };
}

export function removeExercise(draft: LiftSessionDraft, key: string): LiftSessionDraft {
  return { ...draft, exercises: draft.exercises.filter((row) => row.key !== key) };
}

export function renameSession(draft: LiftSessionDraft, title: string): LiftSessionDraft {
  const trimmed = String(title ?? '').trim();
  return { ...draft, title: trimmed ? trimmed.slice(0, 120) : null };
}

function mapExercise(
  draft: LiftSessionDraft,
  key: string,
  update: (row: LiftExerciseDraft) => LiftExerciseDraft,
): LiftSessionDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((row) => (row.key === key ? update(row) : row)),
  };
}

export function addSet(
  draft: LiftSessionDraft,
  exerciseKey: string,
  kind: LiftSetKind = 'work',
): LiftSessionDraft {
  return mapExercise(draft, exerciseKey, (row) => {
    // A new set starts at the last matching row's numbers — the usual case is "same again".
    const previous = [...row.sets].reverse().find((set) => set.kind === kind) ?? null;
    const seeded = newSetDraft(kind, {
      weight: previous?.weight ?? null,
      reps: previous?.reps ?? null,
    });
    if (kind === 'warmup') {
      // Warm-ups stay above the work sets.
      const lastWarmup = row.sets.reduce(
        (index, set, position) => (set.kind === 'warmup' ? position : index),
        -1,
      );
      const sets = row.sets.slice();
      sets.splice(lastWarmup + 1, 0, seeded);
      return { ...row, sets };
    }
    return { ...row, sets: [...row.sets, seeded] };
  });
}

export function removeSet(
  draft: LiftSessionDraft,
  exerciseKey: string,
  setKey: string,
): LiftSessionDraft {
  return mapExercise(draft, exerciseKey, (row) => ({
    ...row,
    sets: row.sets.filter((set) => set.key !== setKey),
  }));
}

export function updateSet(
  draft: LiftSessionDraft,
  exerciseKey: string,
  setKey: string,
  patch: Partial<Pick<LiftSetDraft, 'weight' | 'reps' | 'completedAt'>>,
): LiftSessionDraft {
  return mapExercise(draft, exerciseKey, (row) => ({
    ...row,
    sets: row.sets.map((set) => (set.key === setKey ? { ...set, ...patch } : set)),
  }));
}

/** The single tap on a set row. */
export function toggleSetComplete(
  draft: LiftSessionDraft,
  exerciseKey: string,
  setKey: string,
  now: string = new Date().toISOString(),
): LiftSessionDraft {
  return mapExercise(draft, exerciseKey, (row) => ({
    ...row,
    sets: row.sets.map((set) =>
      set.key === setKey ? { ...set, completedAt: set.completedAt ? null : now } : set,
    ),
  }));
}

/** True when the row has nothing worth keeping, which is what the delete affordance offers. */
export function isEmptySet(set: LiftSetDraft): boolean {
  return set.weight == null && set.reps == null && !set.completedAt;
}

/** Work sets are numbered 1..n per exercise; warm-ups show "W" instead. */
export function setLabel(sets: readonly LiftSetDraft[], index: number): string {
  const set = sets[index];
  if (!set) {
    return '';
  }
  if (set.kind === 'warmup') {
    return 'W';
  }
  let number = 0;
  for (let i = 0; i <= index; i += 1) {
    if (sets[i].kind === 'work') {
      number += 1;
    }
  }
  return String(number);
}

// -------------------------------------------------------------------------- titles

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "Sep 5" in the device's own timezone, which is the date the user believes they trained. */
export function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "Chest · Triceps · Sep 5". A renamed session returns its own title untouched. */
export function sessionTitle(input: {
  title?: string | null;
  muscleKeys: readonly string[];
  performedAt: string;
}): string {
  const custom = String(input.title ?? '').trim();
  if (custom) {
    return custom;
  }
  const muscles = orderMuscles(input.muscleKeys).map(muscleShortLabel);
  const date = shortDate(input.performedAt);
  const parts = [...muscles, date].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Lift';
}

export function countWorkSets(draft: LiftSessionDraft): number {
  return draft.exercises.reduce(
    (total, row) => total + row.sets.filter((set) => set.kind === 'work').length,
    0,
  );
}

/** Two lines of "Incline BB Bench Press · 3 sets" for the history card. */
export function sessionPreview(
  exercises: ReadonlyArray<{ name: string; sets: ReadonlyArray<{ kind: LiftSetKind }> }>,
  lines = 2,
): string[] {
  const rows = exercises.slice(0, lines).map((row) => {
    const count = row.sets.filter((set) => set.kind === 'work').length;
    return count ? `${row.name} · ${count} ${count === 1 ? 'set' : 'sets'}` : row.name;
  });
  const remaining = exercises.length - rows.length;
  if (remaining > 0) {
    rows[rows.length - 1] = `${rows[rows.length - 1]} · +${remaining} more`;
  }
  return rows;
}

// -------------------------------------------------------------------------- save / load

export function draftToPayload(draft: LiftSessionDraft): LiftSavePayloadExercise[] {
  return draft.exercises.map((row, index) => ({
    exerciseId: row.exerciseId,
    customExerciseId: row.exerciseId ? null : row.customExerciseId,
    name: row.name,
    muscleKey: row.muscleKey,
    sort: index,
    supersetGroup: row.supersetGroup,
    sets: row.sets.map((set, setIndex) => ({
      kind: set.kind,
      sort: setIndex,
      weight: set.weight,
      reps: set.reps,
      completedAt: set.completedAt,
    })),
  }));
}

function toNumber(value: number | string | null): number | null {
  if (value == null || value === '') {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function rowsToDraft(
  session: LiftSessionRow,
  exerciseRows: readonly LiftSessionExerciseRow[],
  setRows: readonly LiftSetRow[],
): LiftSessionDraft {
  const setsByExercise = new Map<string, LiftSetRow[]>();
  for (const row of setRows) {
    const list = setsByExercise.get(row.exercise_row_id) ?? [];
    list.push(row);
    setsByExercise.set(row.exercise_row_id, list);
  }

  const exercises = [...exerciseRows]
    .sort((a, b) => a.sort - b.sort)
    .map((row) => ({
      key: row.id,
      exerciseId: row.exercise_id,
      customExerciseId: row.custom_exercise_id,
      name: row.name,
      muscleKey: (isMuscleKey(row.muscle_key) ? row.muscle_key : 'core') as MuscleKey,
      supersetGroup: row.superset_group,
      sets: (setsByExercise.get(row.id) ?? [])
        .sort((a, b) => a.sort - b.sort)
        .map((set) => ({
          key: set.id,
          kind: set.kind === 'warmup' ? ('warmup' as const) : ('work' as const),
          weight: toNumber(set.weight),
          reps: toNumber(set.reps),
          completedAt: set.completed_at,
        })),
    }));

  return {
    id: session.id,
    title: session.title,
    performedAt: session.performed_at,
    completedAt: session.completed_at,
    muscleKeys: orderMuscles(session.muscle_keys),
    unit: session.unit === 'kg' ? 'kg' : 'lb',
    exercises,
    sourceSessionId: session.source_session_id ?? null,
    overloadFromSessionId: session.overload_from_session_id ?? null,
    overloadSummary: parseOverloadSummary(session.overload_summary),
    sharedPostId: session.shared_post_id ?? null,
  };
}

/**
 * Copies a session's shape into a new one.
 *
 * `numbers: 'keep'` is your own history — last time's loads are the sensible starting point.
 * `numbers: 'empty'` is somebody else's card: a friend's 225 must never become your next log by
 * default, so the structure arrives and the weights do not.
 */
export function copySession(
  source: LiftSessionDraft,
  options?: { numbers?: 'keep' | 'empty'; unit?: WeightUnit },
): LiftSessionDraft {
  const keep = options?.numbers !== 'empty';
  return {
    id: newId(),
    title: null,
    performedAt: new Date().toISOString(),
    completedAt: null,
    muscleKeys: source.muscleKeys,
    unit: options?.unit ?? source.unit,
    sourceSessionId: source.id,
    overloadFromSessionId: null,
    overloadSummary: null,
    exercises: source.exercises.map((row) => ({
      key: newLocalKey('ex'),
      exerciseId: row.exerciseId,
      // A custom belongs to whoever created it. An import re-resolves this against the viewer's own
      // customs before saving; until then the name snapshot carries the exercise.
      customExerciseId: keep ? row.customExerciseId : null,
      name: row.name,
      muscleKey: row.muscleKey,
      supersetGroup: row.supersetGroup,
      sets: row.sets.map((set) => ({
        key: newLocalKey('set'),
        kind: set.kind,
        weight: keep ? set.weight : null,
        reps: keep ? set.reps : null,
        completedAt: null,
      })),
    })),
  };
}

/**
 * "Start this again": same exercises, same set structure, previous weights and reps as starting
 * values. Nothing is pre-checked — they still have to do the work.
 */
export function repeatSession(source: LiftSessionDraft): LiftSessionDraft {
  return copySession(source, { numbers: 'keep' });
}

export function summarize(draft: LiftSessionDraft): LiftSessionSummary {
  return {
    id: draft.id,
    title: sessionTitle(draft),
    performedAt: draft.performedAt,
    completedAt: draft.completedAt,
    muscleKeys: draft.muscleKeys,
    unit: draft.unit,
    exerciseCount: draft.exercises.length,
    setCount: countWorkSets(draft),
    preview: sessionPreview(draft.exercises),
    sharedPostId: draft.sharedPostId ?? null,
    overloadSummary: draft.overloadSummary ?? null,
  };
}
