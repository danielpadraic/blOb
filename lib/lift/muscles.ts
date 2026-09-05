/**
 * The muscle groups a lift session is organised by.
 *
 * These keys are stored in `lift_sessions.muscle_keys` and on every exercise row, so they are a
 * contract with the database. Add to the end of the list; never rename or reuse a key.
 */

export const MUSCLE_KEYS = [
  'chest',
  'back',
  'shoulders',
  'traps',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'olympic',
] as const;

export type MuscleKey = (typeof MUSCLE_KEYS)[number];

const LABELS: Record<MuscleKey, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  traps: 'Traps',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
  olympic: 'Olympic / Full body',
};

/** Short form for the session title and history cards, where the full label is too wide. */
const SHORT_LABELS: Record<MuscleKey, string> = {
  ...LABELS,
  olympic: 'Olympic',
};

const KEY_SET = new Set<string>(MUSCLE_KEYS);

export function isMuscleKey(value: unknown): value is MuscleKey {
  return typeof value === 'string' && KEY_SET.has(value);
}

export function muscleLabel(key: MuscleKey): string {
  return LABELS[key];
}

export function muscleShortLabel(key: MuscleKey): string {
  return SHORT_LABELS[key];
}

/** Keeps a stored list in catalog order and drops anything unknown, so the UI never renders junk. */
export function orderMuscles(keys: readonly string[] | null | undefined): MuscleKey[] {
  const wanted = new Set((keys ?? []).filter(isMuscleKey));
  return MUSCLE_KEYS.filter((key) => wanted.has(key));
}

/** "Chest · Triceps". Empty list returns an empty string so callers can fall back. */
export function muscleSummary(keys: readonly string[] | null | undefined): string {
  return orderMuscles(keys).map(muscleShortLabel).join(' · ');
}
