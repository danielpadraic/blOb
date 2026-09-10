import { isMuscleKey, type MuscleKey } from '@/lib/lift/muscles';
import type {
  LiftCardioType,
  LiftExerciseDraft,
  LiftRound,
  LiftRowKind,
  LiftSessionDraft,
  LiftSetDraft,
  LiftSetKind,
} from '@/lib/lift/types';
import type { WeightUnit } from '@/lib/types';

/**
 * Frozen copy of a lift that rides on the post.
 *
 * Viewers open this even when they cannot read `lift_sessions` (deleted, private, or a check-in
 * that only stored a title). Adding it deep-copies into their catalog — it never writes back.
 */
export type LiftShareSnapshot = {
  v: 1;
  sessionId: string;
  ownerUserId: string | null;
  ownerName: string | null;
  title: string | null;
  performedAt: string;
  completedAt: string | null;
  status: string | null;
  unit: WeightUnit;
  muscleKeys: MuscleKey[];
  weightMoved: number;
  exercises: LiftShareSnapshotExercise[];
};

type LiftShareSnapshotExercise = {
  key: string;
  kind: LiftRowKind;
  exerciseId: string | null;
  name: string;
  muscleKey: MuscleKey;
  supersetGroup: number | null;
  sets: Array<{
    key: string;
    kind: LiftSetKind;
    weight: number | null;
    reps: number | null;
  }>;
  cardioMethod?: string | null;
  cardioCustomName?: string | null;
  cardioType?: LiftCardioType | null;
  durationSeconds?: number | null;
  intensity?: number | null;
  rounds?: LiftRound[] | null;
};

const CARDIO_TYPES = new Set<LiftCardioType>(['warmup', 'steady', 'sprint', 'interval', 'cooldown']);

export function buildLiftSnapshot(draft: LiftSessionDraft): LiftShareSnapshot {
  return {
    v: 1,
    sessionId: draft.id,
    ownerUserId: draft.ownerUserId ?? null,
    ownerName: draft.ownerName ?? null,
    title: draft.title,
    performedAt: draft.performedAt,
    completedAt: draft.completedAt,
    status: draft.status ?? null,
    unit: draft.unit === 'kg' ? 'kg' : 'lb',
    muscleKeys: draft.muscleKeys,
    weightMoved: Number(draft.weightMoved) || 0,
    exercises: draft.exercises.map((row) => snapshotExercise(row)),
  };
}

export function parseLiftSnapshot(value: unknown): LiftShareSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Partial<LiftShareSnapshot>;
  if (row.v !== 1 || typeof row.sessionId !== 'string' || !row.sessionId) {
    return null;
  }
  if (!Array.isArray(row.exercises)) {
    return null;
  }
  const exercises = row.exercises
    .map((exercise) => parseExercise(exercise))
    .filter((exercise): exercise is LiftShareSnapshotExercise => Boolean(exercise));
  if (!exercises.length && row.exercises.length > 0) {
    return null;
  }
  return {
    v: 1,
    sessionId: row.sessionId,
    ownerUserId: typeof row.ownerUserId === 'string' ? row.ownerUserId : null,
    ownerName: typeof row.ownerName === 'string' && row.ownerName.trim() ? row.ownerName.trim() : null,
    title: typeof row.title === 'string' ? row.title : null,
    performedAt: typeof row.performedAt === 'string' ? row.performedAt : new Date().toISOString(),
    completedAt: typeof row.completedAt === 'string' ? row.completedAt : null,
    status: typeof row.status === 'string' ? row.status : null,
    unit: row.unit === 'kg' ? 'kg' : 'lb',
    muscleKeys: (row.muscleKeys ?? []).filter(isMuscleKey),
    weightMoved: Number(row.weightMoved) || 0,
    exercises,
  };
}

/** Enough of a draft to paint the sheet and deep-copy into the viewer's catalog. */
export function draftFromLiftSnapshot(
  snapshot: LiftShareSnapshot,
  extras?: { ownerName?: string | null },
): LiftSessionDraft {
  const ownerName = extras?.ownerName?.trim() || snapshot.ownerName;
  return {
    id: snapshot.sessionId,
    ownerUserId: snapshot.ownerUserId,
    ownerName,
    title: snapshot.title,
    performedAt: snapshot.performedAt,
    completedAt: snapshot.completedAt,
    status: snapshot.status,
    favorite: false,
    weightMoved: snapshot.weightMoved,
    healthkitWorkoutUuid: null,
    muscleKeys: snapshot.muscleKeys,
    unit: snapshot.unit,
    exercises: snapshot.exercises.map((row) => draftExercise(row)),
    sourceSessionId: null,
    sourceUserId: null,
    sourceUserName: null,
    overloadFromSessionId: null,
    overloadSummary: null,
  };
}

function snapshotExercise(row: LiftExerciseDraft): LiftShareSnapshotExercise {
  return {
    key: row.key,
    kind: row.kind ?? 'strength',
    exerciseId: row.exerciseId,
    name: row.name,
    muscleKey: row.muscleKey,
    supersetGroup: row.supersetGroup,
    sets: row.sets.map((set) => ({
      key: set.key,
      kind: set.kind,
      weight: set.weight,
      reps: set.reps,
    })),
    cardioMethod: row.cardioMethod ?? null,
    cardioCustomName: row.cardioCustomName ?? null,
    cardioType: row.cardioType ?? null,
    durationSeconds: row.durationSeconds ?? null,
    intensity: row.intensity ?? null,
    rounds: row.rounds ?? null,
  };
}

function parseExercise(value: unknown): LiftShareSnapshotExercise | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Partial<LiftShareSnapshotExercise>;
  if (typeof row.name !== 'string' || !row.name.trim()) {
    return null;
  }
  const muscleKey = isMuscleKey(row.muscleKey) ? row.muscleKey : 'chest';
  const kind: LiftRowKind =
    row.kind === 'cardio' || row.kind === 'rest' || row.kind === 'strength' ? row.kind : 'strength';
  const sets = Array.isArray(row.sets) ? row.sets.map(parseSet).filter((set): set is LiftSetDraft => Boolean(set)) : [];
  const cardioType =
    typeof row.cardioType === 'string' && CARDIO_TYPES.has(row.cardioType) ? row.cardioType : null;
  return {
    key: typeof row.key === 'string' && row.key ? row.key : `ex-${row.name}`,
    kind,
    exerciseId: typeof row.exerciseId === 'string' ? row.exerciseId : null,
    name: row.name.trim(),
    muscleKey,
    supersetGroup: typeof row.supersetGroup === 'number' ? row.supersetGroup : null,
    sets,
    cardioMethod: typeof row.cardioMethod === 'string' ? row.cardioMethod : null,
    cardioCustomName: typeof row.cardioCustomName === 'string' ? row.cardioCustomName : null,
    cardioType,
    durationSeconds: typeof row.durationSeconds === 'number' ? row.durationSeconds : null,
    intensity: typeof row.intensity === 'number' ? row.intensity : null,
    rounds: Array.isArray(row.rounds) ? (row.rounds as LiftRound[]) : null,
  };
}

function parseSet(value: unknown): LiftSetDraft | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Partial<LiftSetDraft>;
  return {
    key: typeof row.key === 'string' && row.key ? row.key : 'set',
    kind: row.kind === 'warmup' ? 'warmup' : 'work',
    weight: typeof row.weight === 'number' && Number.isFinite(row.weight) ? row.weight : null,
    reps: typeof row.reps === 'number' && Number.isFinite(row.reps) ? row.reps : null,
    completedAt: null,
  };
}

function draftExercise(row: LiftShareSnapshotExercise): LiftExerciseDraft {
  return {
    key: row.key,
    kind: row.kind,
    exerciseId: row.exerciseId,
    customExerciseId: null,
    name: row.name,
    muscleKey: row.muscleKey,
    supersetGroup: row.supersetGroup,
    sets: row.sets.map((set) => ({
      key: set.key,
      kind: set.kind,
      weight: set.weight,
      reps: set.reps,
      completedAt: null,
    })),
    cardioMethod: row.cardioMethod ?? null,
    cardioCustomName: row.cardioCustomName ?? null,
    cardioType: row.cardioType ?? null,
    durationSeconds: row.durationSeconds ?? null,
    intensity: row.intensity ?? null,
    rounds: row.rounds ?? null,
    completedAt: null,
    demoUrl: null,
  };
}
