import type { MuscleKey } from '@/lib/lift/muscles';
import type { WeightUnit } from '@/lib/types';

/** Warm-up rows sit above the numbered work sets and are not counted in "3 sets". */
export type LiftSetKind = 'warmup' | 'work';

/**
 * The editable session held in React state.
 *
 * The screen owns this and saves the whole thing through `save_lift_session`, so a stepper tap is
 * instant and never costs a round trip. `key` is client-only; the database assigns its own ids.
 */
export type LiftSetDraft = {
  key: string;
  kind: LiftSetKind;
  /** In the session's unit. Null means the field is empty, which is different from zero. */
  weight: number | null;
  reps: number | null;
  completedAt: string | null;
};

export type LiftExerciseDraft = {
  key: string;
  /** Official catalog slug, or null for a custom. Exactly one of these is set. */
  exerciseId: string | null;
  customExerciseId: string | null;
  name: string;
  muscleKey: MuscleKey;
  /** Exercises sharing a number are a superset. Null means it stands alone. */
  supersetGroup: number | null;
  sets: LiftSetDraft[];
};

export type LiftSessionDraft = {
  id: string;
  /** Null means the app titles it from the muscles and the date. */
  title: string | null;
  performedAt: string;
  completedAt: string | null;
  muscleKeys: MuscleKey[];
  unit: WeightUnit;
  exercises: LiftExerciseDraft[];
  /** The session this was copied from — repeat, overload, or an import from a friend's card. */
  sourceSessionId?: string | null;
  /** Set only when the copy went through the Overload sheet. */
  overloadFromSessionId?: string | null;
  overloadSummary?: LiftOverloadSummary | null;
  /** The post carrying this session's recap card, once it has been shared. */
  sharedPostId?: string | null;
};

/** How one field moves: a flat amount, a percentage, or not at all. */
export type LiftOverloadMode = 'off' | 'amount' | 'percent';

export type LiftOverloadStep = {
  mode: LiftOverloadMode;
  amount: number;
};

/** What the Overload sheet collects. Never persisted — a bump is chosen per session. */
export type LiftOverloadPlan = {
  weight: LiftOverloadStep;
  reps: LiftOverloadStep;
};

/** What is stored on the bumped session, and what the recap chip prints. */
export type LiftOverloadSummary = {
  weightDelta: { mode: 'amount' | 'percent'; amount: number; unit: WeightUnit } | null;
  repsDelta: { mode: 'amount' | 'percent'; amount: number } | null;
};

/** Row shapes as they come back from Supabase. */
export type LiftSessionRow = {
  id: string;
  user_id: string;
  title: string | null;
  performed_at: string;
  completed_at: string | null;
  muscle_keys: string[];
  unit: WeightUnit;
  created_at: string;
  updated_at: string;
  source_session_id?: string | null;
  shared_post_id?: string | null;
  overload_from_session_id?: string | null;
  overload_summary?: unknown;
};

export type LiftSessionExerciseRow = {
  id: string;
  session_id: string;
  exercise_id: string | null;
  custom_exercise_id: string | null;
  name: string;
  muscle_key: string;
  sort: number;
  superset_group: number | null;
};

export type LiftSetRow = {
  id: string;
  exercise_row_id: string;
  kind: LiftSetKind;
  sort: number;
  weight: number | string | null;
  reps: number | string | null;
  completed_at: string | null;
};

export type LiftCustomExerciseRow = {
  id: string;
  user_id: string;
  name: string;
  primary_muscle: string;
  secondary_muscles: string[];
  created_at: string;
};

/** One card on You → Lifts. */
export type LiftSessionSummary = {
  id: string;
  title: string;
  performedAt: string;
  completedAt: string | null;
  muscleKeys: MuscleKey[];
  unit: WeightUnit;
  exerciseCount: number;
  setCount: number;
  /** Up to two lines of "Incline BB Bench Press · 3 sets". */
  preview: string[];
  /** Set once the session has been shared, so History can offer the link instead of a new post. */
  sharedPostId?: string | null;
  overloadSummary?: LiftOverloadSummary | null;
};

/** The jsonb the save RPC expects. Field names are camelCase on purpose; the RPC reads them. */
export type LiftSavePayloadSet = {
  kind: LiftSetKind;
  sort: number;
  weight: number | null;
  reps: number | null;
  completedAt: string | null;
};

export type LiftSavePayloadExercise = {
  exerciseId: string | null;
  customExerciseId: string | null;
  name: string;
  muscleKey: MuscleKey;
  sort: number;
  supersetGroup: number | null;
  sets: LiftSavePayloadSet[];
};
