import {
  clampDuration,
  formatDuration,
  joinDuration,
  splitDuration,
} from '@/lib/lift/duration';
import { newId, newLocalKey } from '@/lib/lift/ids';
import {
  isLegsMuscle,
  isMuscleKey,
  muscleShortLabel,
  orderMuscles,
  type MuscleKey,
} from '@/lib/lift/muscles';
import { officialExercise } from '@/lib/lift/catalog';
import { parseOverloadSummary } from '@/lib/lift/overload';
import {
  cardioRowSeconds,
  parseRounds,
  roundsSummary,
  roundsTotalSeconds,
  tabataTemplate,
} from '@/lib/lift/rounds';
import type {
  LiftCardioType,
  LiftExerciseDraft,
  LiftSavePayloadExercise,
  LiftSessionDraft,
  LiftSessionExerciseRow,
  LiftRowKind,
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
  muscleKeys?: readonly MuscleKey[];
  unit: WeightUnit;
  performedAt?: string;
}): LiftSessionDraft {
  const performedAt = input.performedAt ?? new Date().toISOString();
  return {
    id: newId(),
    title: shortDate(performedAt) || null,
    titleIsAuto: true,
    performedAt,
    completedAt: null,
    status: 'open',
    favorite: false,
    weightMoved: 0,
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
  demoUrl?: string | null;
}): LiftExerciseDraft {
  return {
    key: newLocalKey('ex'),
    kind: 'strength',
    exerciseId: input.exerciseId ?? null,
    customExerciseId: input.customExerciseId ?? null,
    name: input.name,
    muscleKey: input.muscleKey,
    supersetGroup: input.supersetGroup ?? null,
    // A new exercise opens with one work set so there is something to log into.
    sets: input.sets ?? [newSetDraft('work')],
    demoUrl: input.demoUrl ?? null,
  };
}

// -------------------------------------------------------------------------- cardio and rest

/** A rest defaults to a minute, which is the gap most people actually take between working sets. */
export const DEFAULT_REST_SECONDS = 60;
export const DEFAULT_CARDIO_SECONDS = 600;
export const DEFAULT_CARDIO_INTENSITY = 5;

export function newTimedDraft(input: {
  kind: 'cardio' | 'rest';
  muscleKey: MuscleKey;
  name?: string;
  cardioMethod?: string | null;
  cardioCustomName?: string | null;
  cardioType?: LiftCardioType | null;
  durationSeconds?: number | null;
  intensity?: number | null;
}): LiftExerciseDraft {
  const rest = input.kind === 'rest';
  return {
    key: newLocalKey(rest ? 'rest' : 'cardio'),
    kind: input.kind,
    exerciseId: null,
    customExerciseId: null,
    name: input.name ?? (rest ? 'Rest' : 'Cardio'),
    muscleKey: input.muscleKey,
    supersetGroup: null,
    sets: [],
    cardioMethod: rest ? null : (input.cardioMethod ?? null),
    cardioCustomName: rest ? null : (input.cardioCustomName ?? null),
    cardioType: rest ? null : (input.cardioType ?? 'steady'),
    durationSeconds:
      input.durationSeconds ?? (rest ? DEFAULT_REST_SECONDS : DEFAULT_CARDIO_SECONDS),
    intensity: rest ? null : (input.intensity ?? DEFAULT_CARDIO_INTENSITY),
    // Picking Interval up front means intervals, so the row arrives already shaped like a Tabata
    // rather than as an empty list behind a plus button.
    rounds:
      !rest && (input.cardioType ?? 'steady') === 'interval' ? tabataTemplate() : [],
    completedAt: null,
  };
}

/**
 * Drops a cardio or rest row at the end of a muscle section.
 *
 * Appending is what makes the HIIT pattern work without a builder: log bench, add a rest, add a
 * sprint, add another rest, and the section reads back in the order it happened.
 */
export function addTimedRow(
  draft: LiftSessionDraft,
  input: {
    kind: 'cardio' | 'rest';
    muscleKey: MuscleKey;
    name?: string;
    cardioMethod?: string | null;
    cardioCustomName?: string | null;
    cardioType?: LiftCardioType | null;
    durationSeconds?: number | null;
    intensity?: number | null;
  },
): LiftSessionDraft {
  const added = newTimedDraft(input);
  const next = draft.exercises.slice();
  const lastIndex = lastIndexForMuscle(next, input.muscleKey);
  next.splice(lastIndex + 1, 0, added);
  return refreshSessionMeta(withMuscle({ ...draft, exercises: next }, input.muscleKey));
}

export function updateTimedRow(
  draft: LiftSessionDraft,
  key: string,
  patch: Partial<
    Pick<
      LiftExerciseDraft,
      | 'cardioMethod'
      | 'cardioCustomName'
      | 'cardioType'
      | 'durationSeconds'
      | 'intensity'
      | 'name'
      | 'rounds'
      | 'completedAt'
    >
  >,
): LiftSessionDraft {
  return mapExercise(draft, key, (row) => {
    const next = { ...row, ...patch };
    // Switching a plain cardio row to Interval fills in the classic Tabata. Rounds someone has
    // already built are never overwritten, and switching away keeps them so the change is
    // reversible with one tap.
    if (
      patch.cardioType === 'interval' &&
      row.cardioType !== 'interval' &&
      !(next.rounds ?? []).length
    ) {
      next.rounds = tabataTemplate();
    }
    return next;
  });
}

export { clampDuration, formatDuration, joinDuration, splitDuration };

const CARDIO_TYPE_LABELS: Record<LiftCardioType, string> = {
  warmup: 'Warm-up',
  steady: 'Steady',
  sprint: 'Sprint',
  interval: 'Interval',
  cooldown: 'Cool down',
};

export const CARDIO_TYPES = [
  'warmup',
  'steady',
  'sprint',
  'interval',
  'cooldown',
] as const satisfies readonly LiftCardioType[];

export function cardioTypeLabel(type: LiftCardioType | null | undefined): string {
  return type ? CARDIO_TYPE_LABELS[type] : '';
}

/**
 * Cardio methods matching what someone typed into the exercise search.
 *
 * The strength catalog has no Treadmill in it, so without this, searching for one offers to create
 * a private exercise with pounds and reps on it — a worse answer than none. Bare "cardio" lists
 * everything, because at that point they are browsing rather than searching.
 */
export function searchCardioMethods<T extends { id: string; name: string }>(
  methods: readonly T[],
  query: string,
  limit = 6,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  if (needle === 'cardio') {
    return methods.slice(0, limit);
  }
  const starts: T[] = [];
  const contains: T[] = [];
  for (const method of methods) {
    const name = method.name.toLowerCase();
    if (name.startsWith(needle)) {
      starts.push(method);
    } else if (name.includes(needle)) {
      contains.push(method);
    }
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Whether what they typed is asking for a rest row. */
export function matchesRest(query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle.length >= 2 && 'rest'.startsWith(needle);
}

/** What a cardio or rest row is called on a card and in the section list. */
export function timedRowLabel(row: LiftExerciseDraft): string {
  if (row.kind === 'rest') {
    return 'Rest';
  }
  if (row.cardioMethod === 'other') {
    return row.cardioCustomName?.trim() || 'Cardio';
  }
  return row.name || 'Cardio';
}

/** "Air Bike · Sprint · 0:30 · 8/10", "Air Bike · Interval · 16 rounds · 4:00", or "Rest · 0:45". */
export function timedRowSummary(row: LiftExerciseDraft): string {
  if (row.kind === 'rest') {
    return `Rest · ${formatDuration(row.durationSeconds)}`;
  }
  const rounds = row.rounds ?? [];
  if (row.cardioType === 'interval' && rounds.length) {
    return [timedRowLabel(row), cardioTypeLabel(row.cardioType), roundsSummary(rounds)]
      .filter(Boolean)
      .join(' · ');
  }
  return [
    timedRowLabel(row),
    cardioTypeLabel(row.cardioType),
    formatDuration(cardioRowSeconds(row)),
    row.intensity ? `${row.intensity}/10` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function isTimedRow(row: LiftExerciseDraft): boolean {
  return row.kind === 'cardio' || row.kind === 'rest';
}

export function isStrengthRow(row: LiftExerciseDraft): boolean {
  return row.kind !== 'cardio' && row.kind !== 'rest';
}

// -------------------------------------------------------------------------- sections

export type LiftSection = {
  muscle: MuscleKey;
  exercises: LiftExerciseDraft[];
};

/**
 * Sections from the roster only. Empty groups are not shown — Add exercise is the empty-session
 * CTA, and a filter chip is not a section.
 */
export function sessionSections(draft: LiftSessionDraft): LiftSection[] {
  const order = orderMuscles(draft.exercises.map((row) => row.muscleKey));
  return order.map((muscle) => ({
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

/** The exercise a new one would pair with: the last strength row, any muscle. */
export function supersetPartner(
  draft: LiftSessionDraft,
  _muscle?: MuscleKey,
): LiftExerciseDraft | null {
  const strength = draft.exercises.filter((row) => isStrengthRow(row));
  return strength.length ? strength[strength.length - 1] : null;
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
  const partner = input.superset ? supersetPartner(draft) : null;
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

  return refreshSessionMeta(withMuscle({ ...draft, exercises: next }, input.muscleKey));
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
  return refreshSessionMeta({ ...draft, exercises: draft.exercises.filter((row) => row.key !== key) });
}

/**
 * A copy of a row, dropped directly beneath the original.
 *
 * The numbers come along because that is the whole point: duplicating incline bench and swapping it
 * to flat bench should leave you adjusting a few plates, not retyping five sets. The copy is not
 * marked done, though — it is work you still owe.
 *
 * A duplicated superset partner leaves the group behind. Copying one half of a pair into a third
 * member of it would silently change what A1/A2 means.
 */
export function duplicateExercise(draft: LiftSessionDraft, key: string): LiftSessionDraft {
  const index = draft.exercises.findIndex((row) => row.key === key);
  if (index < 0) {
    return draft;
  }
  const source = draft.exercises[index];
  const copy: LiftExerciseDraft = {
    ...source,
    key: newLocalKey('ex'),
    supersetGroup: null,
    sets: source.sets.map((set) => ({ ...set, key: newLocalKey('set'), completedAt: null })),
    rounds: (source.rounds ?? []).map((round) => ({ ...round, completedAt: null })),
    completedAt: null,
  };
  const exercises = draft.exercises.slice();
  exercises.splice(index + 1, 0, copy);
  return { ...draft, exercises };
}

/**
 * Points a row at a different exercise while every set stays exactly where it is.
 *
 * Incline to flat bench is a change of name, not of effort, so the weights and reps are the part
 * worth keeping. Only the identity moves.
 */
export function swapExercise(
  draft: LiftSessionDraft,
  key: string,
  input: {
    exerciseId?: string | null;
    customExerciseId?: string | null;
    name: string;
    muscleKey?: MuscleKey;
  },
): LiftSessionDraft {
  return refreshSessionMeta(
    mapExercise(draft, key, (row) => ({
      ...row,
      exerciseId: input.exerciseId ?? null,
      customExerciseId: input.customExerciseId ?? null,
      name: input.name,
      muscleKey: input.muscleKey ?? row.muscleKey,
      // The clip belonged to the old movement, so it does not describe this one any more.
      demoUrl: null,
    })),
  );
}

/**
 * Moves a row one place within its own muscle section.
 *
 * Order is what makes an interval readable — bench, rest, sprint, rest, bench — so this swaps with
 * the neighbour in the same section rather than the neighbour in the flat list, which could belong
 * to another muscle entirely.
 */
export function moveExercise(
  draft: LiftSessionDraft,
  key: string,
  direction: -1 | 1,
): LiftSessionDraft {
  const index = draft.exercises.findIndex((row) => row.key === key);
  if (index < 0) {
    return draft;
  }
  const muscle = draft.exercises[index].muscleKey;
  const siblings = draft.exercises
    .map((row, at) => ({ row, at }))
    .filter((entry) => entry.row.muscleKey === muscle);
  const position = siblings.findIndex((entry) => entry.at === index);
  const target = siblings[position + direction];
  if (!target) {
    return draft;
  }
  const exercises = draft.exercises.slice();
  exercises[index] = target.row;
  exercises[target.at] = draft.exercises[index];
  return { ...draft, exercises };
}

/** Whether a row has anywhere to go in its section, so the arrows can be disabled honestly. */
export function canMoveExercise(
  draft: LiftSessionDraft,
  key: string,
  direction: -1 | 1,
): boolean {
  const row = draft.exercises.find((entry) => entry.key === key);
  if (!row) {
    return false;
  }
  const siblings = draft.exercises.filter((entry) => entry.muscleKey === row.muscleKey);
  const position = siblings.findIndex((entry) => entry.key === key);
  return position + direction >= 0 && position + direction < siblings.length;
}

export function renameSession(draft: LiftSessionDraft, title: string): LiftSessionDraft {
  const trimmed = String(title ?? '').trim().slice(0, 120);
  if (!trimmed) {
    return refreshSessionMeta({ ...draft, title: null, titleIsAuto: true });
  }
  return { ...draft, title: trimmed, titleIsAuto: false };
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

const AUTO_TITLE_LABELS = new Set<string>([
  'Legs',
  ...MUSCLE_SHORT_LABELS(),
]);

function MUSCLE_SHORT_LABELS(): string[] {
  return [
    'Chest',
    'Back',
    'Shoulders',
    'Traps',
    'Biceps',
    'Triceps',
    'Forearms',
    'Quads',
    'Hamstrings',
    'Glutes',
    'Calves',
    'Core',
    'Olympic',
    'Cardio',
    'Rest',
  ];
}

/** True when the stored title is still the app-written “Chest · Triceps · Sep 6” shape. */
export function looksLikeAutoLiftTitle(
  title?: string | null,
  performedAt?: string,
): boolean {
  const custom = String(title ?? '').trim();
  if (!custom) {
    return true;
  }
  const date = performedAt ? shortDate(performedAt) : '';
  if (date && custom === date) {
    return true;
  }
  const parts = custom.split(/\s*·\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 4) {
    return false;
  }
  const last = parts[parts.length - 1] ?? '';
  const groups = date && last === date ? parts.slice(0, -1) : parts;
  if (date && last !== date) {
    return false;
  }
  if (groups.length > 3) {
    return false;
  }
  return groups.every((part) => AUTO_TITLE_LABELS.has(part));
}

export function isTitleAuto(input: {
  title?: string | null;
  titleIsAuto?: boolean;
  performedAt?: string;
}): boolean {
  if (input.titleIsAuto === false) {
    return false;
  }
  if (input.titleIsAuto === true) {
    return true;
  }
  return looksLikeAutoLiftTitle(input.title, input.performedAt);
}

/**
 * Tags from the roster. Unknown catalog ids keep the row and skip a junk tag.
 * Cardio / rest are tags only when they are on the roster.
 */
export function muscleTagsFromRoster(
  exercises: ReadonlyArray<{
    exerciseId?: string | null;
    muscleKey?: string | null;
    kind?: string | null;
    name?: string | null;
  }>,
): MuscleKey[] {
  const keys: string[] = [];
  for (const row of exercises) {
    if (isMuscleKey(row.muscleKey)) {
      keys.push(row.muscleKey);
      continue;
    }
    const official = row.exerciseId ? officialExercise(row.exerciseId) : null;
    if (official) {
      keys.push(official.muscle);
    }
  }
  return orderMuscles(keys);
}

function titleGroupNames(tags: readonly MuscleKey[]): string[] {
  const strength = tags.filter((key) => key !== 'cardio' && key !== 'rest');
  if (strength.length === 0) {
    return [];
  }
  if (strength.every(isLegsMuscle)) {
    return ['Legs'];
  }
  return strength.slice(0, 3).map(muscleShortLabel);
}

export function autoSessionTitle(input: {
  muscleKeys?: readonly string[] | null;
  performedAt: string;
  exercises?: ReadonlyArray<{
    exerciseId?: string | null;
    muscleKey?: string | null;
    kind?: string | null;
  }>;
}): string {
  const date = shortDate(input.performedAt);
  // A live draft always has an exercises array. Empty roster → date only, even if leftover
  // group chips are still on the session. History cards that omit exercises still use tags.
  const tags =
    input.exercises !== undefined
      ? muscleTagsFromRoster(input.exercises)
      : orderMuscles(input.muscleKeys);
  const groups = titleGroupNames(tags);
  const parts = [...groups, date].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Lift';
}

/** Refresh tags from the roster. Auto titles follow; a penciled name does not. */
export function refreshSessionMeta(draft: LiftSessionDraft): LiftSessionDraft {
  const muscleKeys = muscleTagsFromRoster(draft.exercises);
  const auto = isTitleAuto(draft);
  return {
    ...draft,
    muscleKeys,
    titleIsAuto: auto,
    title: auto ? autoSessionTitle({ ...draft, muscleKeys, exercises: draft.exercises }) : draft.title,
  };
}

/**
 * Header / History title.
 *
 * A penciled name is returned as-is. An auto title uses the string already on the draft — that is
 * what History stored, and refreshSessionMeta rewrites it when the roster changes. Empty title
 * falls back to the date / group formula so a copy with title null still has something to show.
 */
export function sessionTitle(input: {
  title?: string | null;
  titleIsAuto?: boolean;
  muscleKeys: readonly string[];
  performedAt: string;
  exercises?: LiftSessionDraft['exercises'];
}): string {
  const stored = String(input.title ?? '').trim();
  if (stored) {
    return stored;
  }
  return autoSessionTitle(input);
}

export function countWorkSets(draft: LiftSessionDraft): number {
  return draft.exercises.reduce(
    (total, row) => total + row.sets.filter((set) => set.kind === 'work').length,
    0,
  );
}

/** Two lines of "Incline BB Bench Press · 3 sets" for the history card. */
/**
 * The history-card view of a draft already in memory.
 *
 * Sharing to Home hands the session to the ordinary post composer, which speaks in summaries
 * rather than drafts. Rebuilding one here avoids a round trip for a session we are already holding.
 */
export function draftSummary(draft: LiftSessionDraft): LiftSessionSummary {
  return {
    id: draft.id,
    title: sessionTitle(draft),
    performedAt: draft.performedAt,
    completedAt: draft.completedAt ?? null,
    status: draft.status ?? (draft.completedAt ? 'completed' : 'open'),
    favorite: Boolean(draft.favorite),
    weightMoved: draft.weightMoved ?? 0,
    muscleKeys: [...draft.muscleKeys],
    unit: draft.unit,
    exerciseCount: draft.exercises.length,
    setCount: countWorkSets(draft),
    preview: sessionPreview(draft.exercises),
    durationSeconds: draft.exercises.reduce(
      (total, row) => (row.kind === 'cardio' ? total + cardioRowSeconds(row) : total),
      0,
    ),
    overloadSummary: draft.overloadSummary ?? null,
  };
}

export function sessionPreview(
  exercises: ReadonlyArray<{
    name: string;
    sets: ReadonlyArray<{ kind: LiftSetKind }>;
    kind?: string | null;
    duration_seconds?: number | null;
    durationSeconds?: number | null;
    cardio_type?: string | null;
    cardioType?: string | null;
    rounds?: unknown;
  }>,
  lines = 2,
): string[] {
  const rows = exercises.slice(0, lines).map((row) => {
    // A timed row has no sets, so "3 sets" would read as zero. It states its clock instead.
    if (row.kind === 'cardio' || row.kind === 'rest') {
      // Mirrors what Play counts down: an interval's time is its rounds and its own duration
      // field is unused, while every other type is one block plus any rounds appended after it.
      const rounds = parseRounds(row.rounds);
      const interval = (row.cardioType ?? row.cardio_type) === 'interval';
      const block = interval ? 0 : clampDuration(row.durationSeconds ?? row.duration_seconds);
      const seconds = block + roundsTotalSeconds(rounds);
      const count = rounds.length
        ? ` · ${rounds.length} ${rounds.length === 1 ? 'round' : 'rounds'}`
        : '';
      return `${row.name}${count} · ${formatDuration(seconds)}`;
    }
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
  return draft.exercises.map((row, index) => {
    const timed = isTimedRow(row);
    return {
      kind: row.kind ?? 'strength',
      exerciseId: timed ? null : row.exerciseId,
      customExerciseId: timed || row.exerciseId ? null : row.customExerciseId,
      name: timed ? timedRowLabel(row) : row.name,
      muscleKey: row.muscleKey,
      sort: index,
      supersetGroup: timed ? null : row.supersetGroup,
      // A timed row is described entirely by its own columns, so it carries no sets.
      sets: timed
        ? []
        : row.sets.map((set, setIndex) => ({
            kind: set.kind,
            sort: setIndex,
            weight: set.weight,
            reps: set.reps,
            completedAt: set.completedAt,
          })),
      cardioMethod: row.kind === 'cardio' ? (row.cardioMethod ?? null) : null,
      cardioCustomName: row.kind === 'cardio' ? (row.cardioCustomName ?? null) : null,
      cardioType: row.kind === 'cardio' ? (row.cardioType ?? null) : null,
      durationSeconds: timed ? clampDuration(row.durationSeconds) : null,
      intensity: row.kind === 'cardio' ? (row.intensity ?? null) : null,
      demoUrl: timed ? null : (row.demoUrl ?? null),
      rounds: row.kind === 'cardio' ? (row.rounds ?? []) : [],
      completedAt: row.kind === 'cardio' ? (row.completedAt ?? null) : null,
    };
  });
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
      kind: (row.kind === 'cardio' || row.kind === 'rest' ? row.kind : 'strength') as LiftRowKind,
      exerciseId: row.exercise_id,
      customExerciseId: row.custom_exercise_id,
      name: row.name || officialExercise(String(row.exercise_id ?? ''))?.name || 'Exercise',
      muscleKey: (isMuscleKey(row.muscle_key)
        ? row.muscle_key
        : officialExercise(String(row.exercise_id ?? ''))?.muscle ?? 'core') as MuscleKey,
      supersetGroup: row.superset_group,
      cardioMethod: row.cardio_method ?? null,
      cardioCustomName: row.cardio_custom_name ?? null,
      cardioType: (row.cardio_type ?? null) as LiftCardioType | null,
      durationSeconds: row.duration_seconds ?? null,
      intensity: row.intensity ?? null,
      demoUrl: row.demo_url ?? null,
      rounds: parseRounds(row.rounds),
      completedAt: row.completed_at ?? null,
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

  const storedKeys = orderMuscles(session.muscle_keys);
  // Tags from the original row keys / catalog, not a display fallback like "core".
  const derivedKeys = muscleTagsFromRoster(
    [...exerciseRows]
      .sort((a, b) => a.sort - b.sort)
      .map((row) => ({
        exerciseId: row.exercise_id,
        muscleKey: isMuscleKey(row.muscle_key) ? row.muscle_key : null,
        name: row.name,
      })),
  );
  return {
    id: session.id,
    ownerUserId: session.user_id,
    title: session.title,
    titleIsAuto: looksLikeAutoLiftTitle(session.title, session.performed_at),
    performedAt: session.performed_at,
    completedAt: session.completed_at,
    status: session.status ?? (session.completed_at ? 'completed' : 'open'),
    favorite: Boolean(session.favorite),
    weightMoved: toNumber(session.weight_moved ?? null) ?? 0,
    healthkitWorkoutUuid: session.healthkit_workout_uuid ?? null,
    muscleKeys: storedKeys.length ? storedKeys : derivedKeys,
    unit: session.unit === 'kg' ? 'kg' : 'lb',
    exercises,
    sourceSessionId: session.source_session_id ?? null,
    sourceUserId: session.source_user_id ?? null,
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
    titleIsAuto: true,
    performedAt: new Date().toISOString(),
    completedAt: null,
    status: 'open',
    favorite: false,
    weightMoved: 0,
    healthkitWorkoutUuid: null,
    muscleKeys: source.muscleKeys,
    unit: options?.unit ?? source.unit,
    sourceSessionId: source.id,
    // Carried locally so the copy can say who it came from straight away. The save RPC works this
    // out again from the source session, so a client cannot claim credit from someone it never saw.
    sourceUserId: source.ownerUserId ?? null,
    sourceUserName: source.ownerName ?? null,
    overloadFromSessionId: null,
    overloadSummary: null,
    exercises: source.exercises.map((row) => ({
      key: newLocalKey('ex'),
      kind: row.kind ?? 'strength',
      exerciseId: row.exerciseId,
      // A custom belongs to whoever created it. An import re-resolves this against the viewer's own
      // customs before saving; until then the name snapshot carries the exercise.
      customExerciseId: keep ? row.customExerciseId : null,
      name: row.name,
      muscleKey: row.muscleKey,
      supersetGroup: row.supersetGroup,
      // Cardio and rest describe the shape of the workout, not someone else's achievement, so they
      // copy intact even when the weights are cleared. A 45 second rest is 45 seconds for anyone.
      cardioMethod: row.cardioMethod ?? null,
      cardioCustomName: row.cardioCustomName ?? null,
      cardioType: row.cardioType ?? null,
      durationSeconds: row.durationSeconds ?? null,
      intensity: row.intensity ?? null,
      demoUrl: row.demoUrl ?? null,
      // The interval structure is the workout itself, so it copies whole. Clearing it would hand
      // someone an Air Bike row with a Play button and nothing to count down.
      rounds: (row.rounds ?? []).map((round) => {
        const copy = { ...round };
        delete copy.completedAt;
        return copy;
      }),
      completedAt: null,
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
    status: draft.status ?? (draft.completedAt ? 'completed' : 'open'),
    favorite: Boolean(draft.favorite),
    weightMoved: draft.weightMoved ?? 0,
    muscleKeys: draft.muscleKeys,
    unit: draft.unit,
    exerciseCount: draft.exercises.length,
    setCount: countWorkSets(draft),
    preview: sessionPreview(draft.exercises),
    durationSeconds: draft.exercises.reduce(
      (total, row) => (row.kind === 'cardio' ? total + cardioRowSeconds(row) : total),
      0,
    ),
    sharedPostId: draft.sharedPostId ?? null,
    overloadSummary: draft.overloadSummary ?? null,
  };
}
