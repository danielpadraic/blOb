import { exerciseNameTaken, type ExerciseOption } from '@/lib/lift/catalog';
import { isMuscleKey, orderMuscles, type MuscleKey } from '@/lib/lift/muscles';
import {
  draftToPayload,
  rowsToDraft,
  sessionPreview,
  sessionTitle,
} from '@/lib/lift/session';
import type {
  LiftCustomExerciseRow,
  LiftSessionDraft,
  LiftSessionExerciseRow,
  LiftSessionRow,
  LiftSessionSummary,
  LiftSetRow,
} from '@/lib/lift/types';
import { supabase } from '@/lib/supabase';
import type { WeightUnit } from '@/lib/types';

/**
 * Supabase access for Lift. Everything here is owner-only by policy; these functions never pass a
 * user id from the client, so a bad caller cannot read someone else's log.
 */

const SESSION_COLUMNS = 'id, user_id, title, performed_at, completed_at, muscle_keys, unit, created_at, updated_at';
const EXERCISE_COLUMNS =
  'id, session_id, exercise_id, custom_exercise_id, name, muscle_key, sort, superset_group';
const SET_COLUMNS = 'id, exercise_row_id, kind, sort, weight, reps, completed_at';

function fail(message: string, error: { message?: string } | null): never {
  throw new Error(error?.message ? `${message}: ${error.message}` : message);
}

// -------------------------------------------------------------------------- custom exercises

export async function fetchCustomExercises(): Promise<ExerciseOption[]> {
  const { data, error } = await supabase
    .from('lift_custom_exercises')
    .select('id, user_id, name, primary_muscle, secondary_muscles, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    fail('Could not load your saved exercises', error);
  }
  return (data ?? []).map(customToOption);
}

function customToOption(row: LiftCustomExerciseRow): ExerciseOption {
  return {
    id: row.id,
    name: row.name,
    muscle: (isMuscleKey(row.primary_muscle) ? row.primary_muscle : 'core') as MuscleKey,
    secondaries: orderMuscles(row.secondary_muscles),
    aliases: [],
    official: false,
  };
}

/**
 * Creates a private exercise for this user. It never reaches the official catalog.
 * Typing the same name twice returns the row that already exists instead of erroring.
 */
export async function createCustomExercise(input: {
  name: string;
  muscle: MuscleKey;
  secondaries?: readonly MuscleKey[];
}): Promise<ExerciseOption> {
  const name = String(input.name ?? '').trim().slice(0, 80);
  if (!name) {
    throw new Error('Give the exercise a name.');
  }
  const { data: session } = await supabase.auth.getUser();
  const userId = session.user?.id;
  if (!userId) {
    throw new Error('You need to be signed in.');
  }

  const { data, error } = await supabase
    .from('lift_custom_exercises')
    .insert({
      user_id: userId,
      name,
      primary_muscle: input.muscle,
      secondary_muscles: orderMuscles(input.secondaries ?? []),
    })
    .select('id, user_id, name, primary_muscle, secondary_muscles, created_at')
    .single();

  if (error) {
    // Unique index on (user_id, lower(name)) — they already have this one.
    if (error.code === '23505') {
      const existing = await fetchCustomExercises();
      const match = existing.find(
        (row) => row.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (match) {
        return match;
      }
    }
    fail('Could not save that exercise', error);
  }
  return customToOption(data as LiftCustomExerciseRow);
}

export { exerciseNameTaken };

// -------------------------------------------------------------------------- sessions

export async function fetchLiftSession(id: string): Promise<LiftSessionDraft | null> {
  const sessionId = String(id ?? '').trim();
  if (!sessionId) {
    return null;
  }
  const { data: session, error } = await supabase
    .from('lift_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .maybeSingle();
  if (error) {
    fail('Could not open that lift', error);
  }
  if (!session) {
    return null;
  }

  const { data: exercises, error: exerciseError } = await supabase
    .from('lift_session_exercises')
    .select(EXERCISE_COLUMNS)
    .eq('session_id', sessionId)
    .order('sort', { ascending: true });
  if (exerciseError) {
    fail('Could not open that lift', exerciseError);
  }

  const rows = (exercises ?? []) as LiftSessionExerciseRow[];
  let sets: LiftSetRow[] = [];
  if (rows.length) {
    const { data: setRows, error: setError } = await supabase
      .from('lift_sets')
      .select(SET_COLUMNS)
      .in('exercise_row_id', rows.map((row) => row.id))
      .order('sort', { ascending: true });
    if (setError) {
      fail('Could not open that lift', setError);
    }
    sets = (setRows ?? []) as LiftSetRow[];
  }

  return rowsToDraft(session as LiftSessionRow, rows, sets);
}

function titleFor(row: LiftSessionRow): string {
  return sessionTitle({
    title: row.title,
    muscleKeys: row.muscle_keys,
    performedAt: row.performed_at,
  });
}

type HistoryRow = LiftSessionRow & {
  lift_session_exercises: Array<
    Pick<LiftSessionExerciseRow, 'id' | 'name' | 'sort'> & {
      lift_sets: Array<{ kind: 'warmup' | 'work' }>;
    }
  >;
};

export async function fetchLiftHistory(limit = 50): Promise<LiftSessionSummary[]> {
  const { data, error } = await supabase
    .from('lift_sessions')
    .select(
      `${SESSION_COLUMNS}, lift_session_exercises(id, name, sort, lift_sets(kind))`,
    )
    .order('performed_at', { ascending: false })
    .limit(limit);
  if (error) {
    fail('Could not load your lifts', error);
  }

  return ((data ?? []) as unknown as HistoryRow[]).map((row) => {
    const exercises = [...(row.lift_session_exercises ?? [])].sort((a, b) => a.sort - b.sort);
    const sets = exercises.flatMap((exercise) => exercise.lift_sets ?? []);
    return {
      id: row.id,
      title: titleFor(row),
      performedAt: row.performed_at,
      completedAt: row.completed_at,
      muscleKeys: orderMuscles(row.muscle_keys),
      unit: row.unit === 'kg' ? 'kg' : 'lb',
      exerciseCount: exercises.length,
      setCount: sets.filter((set) => set.kind === 'work').length,
      preview: sessionPreview(
        exercises.map((exercise) => ({ name: exercise.name, sets: exercise.lift_sets ?? [] })),
      ),
    };
  });
}

/**
 * The most recent finished session that covers every muscle they just picked. Used by
 * "Use last {muscles} session" — a partial match would hand them the wrong template.
 */
export async function fetchLastSessionForMuscles(
  muscles: readonly MuscleKey[],
): Promise<LiftSessionSummary | null> {
  const wanted = orderMuscles(muscles);
  if (!wanted.length) {
    return null;
  }
  const { data, error } = await supabase
    .from('lift_sessions')
    .select(`${SESSION_COLUMNS}, lift_session_exercises(id, name, sort, lift_sets(kind))`)
    .contains('muscle_keys', wanted)
    .not('completed_at', 'is', null)
    .order('performed_at', { ascending: false })
    .limit(1);
  if (error) {
    fail('Could not check your last session', error);
  }
  const row = ((data ?? []) as unknown as HistoryRow[])[0];
  if (!row) {
    return null;
  }
  const exercises = [...(row.lift_session_exercises ?? [])].sort((a, b) => a.sort - b.sort);
  return {
    id: row.id,
    title: titleFor(row),
    performedAt: row.performed_at,
    completedAt: row.completed_at,
    muscleKeys: orderMuscles(row.muscle_keys),
    unit: row.unit === 'kg' ? 'kg' : 'lb',
    exerciseCount: exercises.length,
    setCount: exercises.flatMap((e) => e.lift_sets ?? []).filter((s) => s.kind === 'work').length,
    preview: sessionPreview(
      exercises.map((exercise) => ({ name: exercise.name, sets: exercise.lift_sets ?? [] })),
    ),
  };
}

export async function saveLiftSession(
  draft: LiftSessionDraft,
  options?: { completed?: boolean },
): Promise<string> {
  const { data, error } = await supabase.rpc('save_lift_session', {
    p_id: draft.id,
    p_title: draft.title,
    p_performed_at: draft.performedAt,
    p_muscle_keys: draft.muscleKeys,
    p_unit: draft.unit,
    p_completed: options?.completed ?? Boolean(draft.completedAt),
    p_exercises: draftToPayload(draft),
  });
  if (error) {
    fail('Could not save that lift', error);
  }
  return String(data ?? draft.id);
}

export async function deleteLiftSession(id: string): Promise<void> {
  const { error } = await supabase.from('lift_sessions').delete().eq('id', id);
  if (error) {
    fail('Could not delete that lift', error);
  }
}

/** lb unless the profile says kg. Kept in one place so the session and the steppers agree. */
export function unitFor(weightUnit: WeightUnit | null | undefined): WeightUnit {
  return weightUnit === 'kg' ? 'kg' : 'lb';
}
