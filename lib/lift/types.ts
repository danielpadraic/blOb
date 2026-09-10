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

/**
 * What a row in the session is.
 *
 * `strength` carries sets of weight and reps. `cardio` and `rest` are timed and hold no sets at
 * all, which is what lets them sit between two bench sets instead of needing a screen of their own.
 */
export type LiftRowKind = 'strength' | 'cardio' | 'rest';

/** How hard a cardio row was meant to be, which is not the same as how long it lasted. */
export type LiftCardioType = 'warmup' | 'steady' | 'sprint' | 'interval' | 'cooldown';

export type LiftExerciseDraft = {
  key: string;
  kind: LiftRowKind;
  /** Official catalog slug, or null for a custom. Exactly one of these is set. Strength only. */
  exerciseId: string | null;
  customExerciseId: string | null;
  name: string;
  muscleKey: MuscleKey;
  /** Exercises sharing a number are a superset. Null means it stands alone. */
  supersetGroup: number | null;
  sets: LiftSetDraft[];
  /** Cardio catalog id, or 'other' when they typed their own. */
  cardioMethod?: string | null;
  /** Their private label for an "other" method. Never joins the shared catalog. */
  cardioCustomName?: string | null;
  cardioType?: LiftCardioType | null;
  /** Cardio and rest only. Rest uses nothing else. */
  durationSeconds?: number | null;
  /** 1–10, cardio only. */
  intensity?: number | null;
  /**
   * Interval rounds on this one cardio row.
   *
   * Eight rounds of Air Bike is one exercise done eight times, not eight exercises, so the rounds
   * hang off the row rather than multiplying it.
   */
  rounds?: LiftRound[] | null;
  /**
   * Done on a cardio main block (steady / sprint / warmup / cooldown). Interval Done lives on
   * each round instead.
   */
  completedAt?: string | null;
  /**
   * This user's demo clip for this exercise, copied onto the row so a copy keeps the video.
   *
   * TODO(demo-round): the column, the per-user `lift_exercise_demos` table, and copy-on-Add all
   * carry this already, but nothing records or attaches a clip yet. That needs a Round capture
   * (3:00 cap) hung off the exercise overflow, writing one row per (user, exercise). Saving and
   * sharing a lift must keep working without it — a missing clip is an absent row, not an error.
   */
  demoUrl?: string | null;
};

export type LiftSessionDraft = {
  id: string;
  /** Whose session this is. A viewer looking at a shared card is not the owner. */
  ownerUserId?: string | null;
  ownerName?: string | null;
  /** Null means the app titles it from the muscles and the date. */
  title: string | null;
  /**
   * True while the header still follows the roster. Missing on old rows — inferred from the
   * stored title looking like “Chest · Triceps · Sep 6”. Never a required column.
   */
  titleIsAuto?: boolean;
  performedAt: string;
  completedAt: string | null;
  /** open = Draft. completed / saved = finished. */
  status?: string | null;
  favorite?: boolean;
  weightMoved?: number;
  healthkitWorkoutUuid?: string | null;
  muscleKeys: MuscleKey[];
  unit: WeightUnit;
  exercises: LiftExerciseDraft[];
  /** The session this was copied from — repeat, overload, or an import from a friend's card. */
  sourceSessionId?: string | null;
  /** Who owned the session it was copied from, so the copy can say "Created by Daniel". */
  sourceUserId?: string | null;
  sourceUserName?: string | null;
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
  status?: string | null;
  favorite?: boolean | null;
  weight_moved?: number | string | null;
  healthkit_workout_uuid?: string | null;
  muscle_keys: string[];
  unit: WeightUnit;
  created_at: string;
  updated_at: string;
  source_session_id?: string | null;
  source_user_id?: string | null;
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
  kind?: string | null;
  cardio_method?: string | null;
  cardio_custom_name?: string | null;
  cardio_type?: string | null;
  duration_seconds?: number | null;
  intensity?: number | null;
  demo_url?: string | null;
  rounds?: unknown;
  completed_at?: string | null;
};

/**
 * One block of an interval.
 *
 * `on` is work and carries intensity. `off` is active recovery on the same machine. `rest` is
 * standing still. The single-block kinds appear here only when someone appends extra blocks to a
 * warm-up or cool down, which then play in order after the main one.
 */
export type LiftRoundKind = 'on' | 'off' | 'rest' | 'warmup' | 'steady' | 'sprint' | 'cooldown';

export type LiftRound = {
  kind: LiftRoundKind;
  minutes: number;
  seconds: number;
  /** Interval ON only — recovery has no target effort. */
  intensity?: number | null;
  /** Done on this round. Complete requires every remaining round to be checked. */
  completedAt?: string | null;
};

/** One row of the shared cardio catalog. */
export type LiftCardioMethod = {
  id: string;
  name: string;
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
  status?: string | null;
  favorite?: boolean;
  weightMoved?: number;
  durationSeconds?: number;
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
  kind: LiftRowKind;
  exerciseId: string | null;
  customExerciseId: string | null;
  name: string;
  muscleKey: MuscleKey;
  sort: number;
  supersetGroup: number | null;
  sets: LiftSavePayloadSet[];
  cardioMethod: string | null;
  cardioCustomName: string | null;
  cardioType: LiftCardioType | null;
  durationSeconds: number | null;
  intensity: number | null;
  demoUrl: string | null;
  rounds: LiftRound[];
  completedAt: string | null;
};
