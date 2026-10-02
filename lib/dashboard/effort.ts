import { durationLabel } from '@/lib/dashboard/model';
import { clampDuration } from '@/lib/lift/duration';
import { isMuscleKey, muscleLabel, orderMuscles, type MuscleKey } from '@/lib/lift/muscles';
import { parseRounds, roundsTotalSeconds } from '@/lib/lift/rounds';
import { cardioTypeLabel } from '@/lib/lift/session';
import type { LiftCardioType } from '@/lib/lift/types';
import type { WeightUnit } from '@/lib/types';

export type EffortExercise = {
  name: string;
  muscle: MuscleKey | null;
  pounds: number;
};

export type EffortCardio = {
  name: string;
  type: string;
  typeLabel: string;
  seconds: number;
  distanceMeters: number | null;
};

export type EffortSession = {
  id: string;
  day: string;
  unit: WeightUnit;
  muscles: MuscleKey[];
  exercises: EffortExercise[];
  cardio: EffortCardio[];
};

export type PoundBar = {
  key: string;
  label: string;
  value: number;
  hint: string;
};

const CARDIO_TYPES = new Set(['warmup', 'steady', 'sprint', 'interval', 'cooldown']);

function weekdayName(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(date);
  } catch {
    return '';
  }
}

function mass(amount: number, unit: WeightUnit): string {
  const printed = Math.round(amount).toLocaleString('en-US');
  return unit === 'kg' ? `${printed} kg` : `${printed} lb`;
}

/** Completed work sets only. Warm-ups and an open draft add nothing. */
export function workSetPounds(sets: readonly { kind?: string | null; weight?: number | null; reps?: number | null; completedAt?: string | null }[]): number {
  let total = 0;
  for (const set of sets) {
    if (set.kind !== 'work' || !set.completedAt || set.weight == null || set.reps == null) {
      continue;
    }
    const weight = Number(set.weight);
    const reps = Number(set.reps);
    if (weight > 0 && reps > 0) {
      total += weight * reps;
    }
  }
  return Math.round(total);
}

export function cardioSeconds(input: { type?: string | null; durationSeconds?: number | null; rounds?: unknown }): number {
  const rounds = parseRounds(input.rounds);
  if (input.type === 'interval') {
    return roundsTotalSeconds(rounds);
  }
  return clampDuration(input.durationSeconds) + roundsTotalSeconds(rounds);
}

function sessionMatches(session: EffortSession, muscle: string | null, exercise: string | null): EffortExercise[] {
  return session.exercises.filter((row) => {
    if (row.pounds <= 0) {
      return false;
    }
    if (muscle && row.muscle !== muscle) {
      return false;
    }
    if (exercise && row.name !== exercise) {
      return false;
    }
    return true;
  });
}

export function muscleChipKeys(sessions: readonly EffortSession[]): MuscleKey[] {
  const found = new Set<string>();
  for (const session of sessions) {
    for (const key of session.muscles) {
      if (!isMuscleKey(key) || key === 'cardio' || key === 'rest') {
        continue;
      }
      if (session.exercises.some((row) => row.muscle === key && row.pounds > 0)) {
        found.add(key);
      }
    }
    for (const row of session.exercises) {
      if (row.muscle && row.pounds > 0 && row.muscle !== 'cardio' && row.muscle !== 'rest') {
        found.add(row.muscle);
      }
    }
  }
  return orderMuscles([...found]);
}

export function exerciseChipNames(sessions: readonly EffortSession[], muscle: string): string[] {
  const names: string[] = [];
  for (const session of sessions) {
    for (const row of session.exercises) {
      if (row.muscle !== muscle || row.pounds <= 0 || !row.name) {
        continue;
      }
      if (!names.includes(row.name)) {
        names.push(row.name);
      }
    }
  }
  return names;
}

export function poundChart(
  sessions: readonly EffortSession[],
  keys: readonly string[],
  filter: { muscle: string | null; exercise: string | null },
  axisLabel: (day: string) => string,
): { totalLabel: string | null; bars: PoundBar[] } {
  const unit: WeightUnit = sessions.find((row) => row.unit)?.unit ?? 'lb';
  const byDay = new Map<string, number>();
  for (const session of sessions) {
    if (!keys.includes(session.day)) {
      continue;
    }
    const pounds = sessionMatches(session, filter.muscle, filter.exercise).reduce((sum, row) => sum + row.pounds, 0);
    if (pounds > 0) {
      byDay.set(session.day, (byDay.get(session.day) ?? 0) + pounds);
    }
  }
  const total = [...byDay.values()].reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return { totalLabel: null, bars: [] };
  }
  return {
    totalLabel: mass(total, unit),
    bars: keys.map((key) => {
      const value = byDay.get(key) ?? 0;
      const name = weekdayName(key);
      return {
        key,
        label: axisLabel(key),
        value,
        hint: value > 0 && name ? `${name} · ${mass(value, unit)}` : '',
      };
    }),
  };
}

export type CardioLine = {
  id: string;
  day: string;
  text: string;
};

export function cardioLines(
  sessions: readonly EffortSession[],
  keys: readonly string[],
  type: string | null,
): { types: { key: string; label: string }[]; lines: CardioLine[] } {
  const blocks = sessions.flatMap((session) =>
    keys.includes(session.day)
      ? session.cardio
          .filter((row) => row.seconds > 0)
          .map((row, index) => ({ session, row, index }))
      : [],
  );
  const types: { key: string; label: string }[] = [];
  for (const block of blocks) {
    if (!block.row.type || types.some((item) => item.key === block.row.type)) {
      continue;
    }
    types.push({ key: block.row.type, label: block.row.typeLabel || block.row.type });
  }
  const lines = blocks
    .filter((block) => !type || block.row.type === type)
    .map((block) => {
      const time = durationLabel(block.row.seconds);
      const distance =
        block.row.distanceMeters && block.row.distanceMeters > 0
          ? `${(block.row.distanceMeters / 1609.344).toFixed(2)} mi`
          : '';
      const text = [weekdayName(block.session.day), block.row.name, block.row.typeLabel, time, distance]
        .filter(Boolean)
        .join(' · ');
      return { id: `${block.session.id}-${block.index}`, day: block.session.day, text };
    });
  return { types, lines };
}

export function asCardioType(value: unknown): LiftCardioType | null {
  const key = String(value ?? '');
  return CARDIO_TYPES.has(key) ? (key as LiftCardioType) : null;
}

export function cardioTypeName(value: unknown): string {
  return cardioTypeLabel(asCardioType(value));
}

export type LiftEffortRow = {
  id?: string;
  performed_at?: string | null;
  completed_at?: string | null;
  status?: string | null;
  unit?: string | null;
  muscle_keys?: string[] | null;
  lift_session_exercises?: Array<{
    name?: string | null;
    muscle_key?: string | null;
    kind?: string | null;
    cardio_method?: string | null;
    cardio_custom_name?: string | null;
    cardio_type?: string | null;
    duration_seconds?: number | null;
    rounds?: unknown;
    lift_sets?: Array<{
      kind?: string | null;
      weight?: number | null;
      reps?: number | null;
      completed_at?: string | null;
    }> | null;
  }> | null;
};

/** Drafts stay out. A rename does not add a muscle that was not stored. */
export function effortFromLiftRows(rows: readonly LiftEffortRow[], dayOf: (iso: string) => string): EffortSession[] {
  const sessions: EffortSession[] = [];
  for (const row of rows) {
    const status = String(row.status ?? '');
    const completed = String(row.completed_at ?? '');
    if (!completed || status === 'open' || status === 'draft') {
      continue;
    }
    const day = dayOf(completed);
    if (!day) {
      continue;
    }
    const exercises: EffortExercise[] = [];
    const cardio: EffortCardio[] = [];
    for (const exercise of row.lift_session_exercises ?? []) {
      const muscle = isMuscleKey(exercise.muscle_key) ? exercise.muscle_key : null;
      if (exercise.kind === 'cardio') {
        const seconds = cardioSeconds({
          type: exercise.cardio_type,
          durationSeconds: exercise.duration_seconds,
          rounds: exercise.rounds,
        });
        if (seconds <= 0) {
          continue;
        }
        const custom = String(exercise.cardio_custom_name ?? '').trim();
        const name = custom || String(exercise.name ?? '').trim() || 'Cardio';
        cardio.push({
          name,
          type: asCardioType(exercise.cardio_type) ?? '',
          typeLabel: cardioTypeName(exercise.cardio_type),
          seconds,
          distanceMeters: null,
        });
        continue;
      }
      if (exercise.kind === 'rest') {
        continue;
      }
      const pounds = workSetPounds(
        (exercise.lift_sets ?? []).map((set) => ({
          kind: set.kind,
          weight: set.weight,
          reps: set.reps,
          completedAt: set.completed_at,
        })),
      );
      const name = String(exercise.name ?? '').trim();
      if (pounds > 0 && name) {
        exercises.push({ name, muscle, pounds });
      }
    }
    const muscles = orderMuscles([...(row.muscle_keys ?? []), ...exercises.map((item) => item.muscle ?? '')]);
    if (exercises.length === 0 && cardio.length === 0) {
      continue;
    }
    sessions.push({
      id: String(row.id ?? day),
      day,
      unit: row.unit === 'kg' ? 'kg' : 'lb',
      muscles,
      exercises,
      cardio,
    });
  }
  return sessions;
}

export { muscleLabel };
