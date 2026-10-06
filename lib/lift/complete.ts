import { formatDuration } from '@/lib/lift/duration';
import { formatMassMoved } from '@/lib/lift/massUnit';
import { formatVolume } from '@/lib/lift/recap';
import { canPlay, cardioRowSeconds } from '@/lib/lift/rounds';
import { isEmptySet, sessionTitle, shortDate, timedRowLabel } from '@/lib/lift/session';
import type { LiftExerciseDraft, LiftRound, LiftSessionDraft, LiftSessionSummary, LiftSetDraft } from '@/lib/lift/types';
import type { MuscleKey } from '@/lib/lift/muscles';
import type { WeightUnit } from '@/lib/types';

/**
 * When a lift can leave Draft, what weight moved means, and the summary card for a finished session.
 *
 * Complete is a gate, not a save. Autosave and Save stay Draft. Complete is allowed when every
 * remaining working set is Done or removed. Blank slots, warm-ups, and Cardio/Rest chips that were
 * never inserted do not block it.
 */

export type LiftSessionStatus = 'open' | 'saved' | 'completed';

export function isCompletedStatus(
  status?: string | null,
  completedAt?: string | null,
): boolean {
  return status === 'completed' || status === 'saved' || Boolean(completedAt);
}

export function asLiftStatus(status?: string | null, completedAt?: string | null): LiftSessionStatus {
  if (isCompletedStatus(status, completedAt)) {
    return 'completed';
  }
  return 'open';
}

export type LeftoverWork = {
  sets: number;
  rounds: number;
};

/**
 * Working sets and inserted cardio rounds that still need Done.
 *
 * Warm-ups, rest rows, and blank set slots (nothing typed, and not checked) do not count.
 * Cardio and Rest chips that were never inserted are not exercises, so they are not here.
 */
export function leftoverIncompleteWork(draft: LiftSessionDraft | null | undefined): LeftoverWork {
  if (!draft) {
    return { sets: 0, rounds: 0 };
  }
  let sets = 0;
  let rounds = 0;
  for (const exercise of draft.exercises) {
    if (exercise.kind === 'rest') {
      continue;
    }
    if (exercise.kind === 'cardio') {
      rounds += leftoverCardioRounds(exercise);
      continue;
    }
    sets += exercise.sets.filter((set) => set.kind === 'work' && blocksComplete(set)).length;
  }
  return { sets, rounds };
}

/** A working set the user actually started and has not checked Done. */
function blocksComplete(set: LiftSetDraft): boolean {
  return set.kind === 'work' && !set.completedAt && !isEmptySet(set);
}

export type LeftoverTarget = {
  exerciseKey: string;
  exerciseName: string;
  muscleKey: MuscleKey;
  /** The unchecked working set. Null when the leftover is a cardio row. */
  setKey: string | null;
  setNumber: number | null;
  line: string;
};

/** The first working set or inserted cardio row that still blocks Complete, in session order. */
export function firstLeftoverTarget(draft: LiftSessionDraft | null | undefined): LeftoverTarget | null {
  if (!draft) {
    return null;
  }
  for (const exercise of draft.exercises) {
    if (exercise.kind === 'rest') {
      continue;
    }
    if (exercise.kind === 'cardio') {
      const cardio = cardioLeftover(exercise);
      if (cardio) {
        return cardio;
      }
      continue;
    }
    let number = 0;
    for (const set of exercise.sets) {
      if (set.kind !== 'work') {
        continue;
      }
      number += 1;
      if (!blocksComplete(set)) {
        continue;
      }
      return {
        exerciseKey: exercise.key,
        exerciseName: exercise.name,
        muscleKey: exercise.muscleKey,
        setKey: set.key,
        setNumber: number,
        line: `Check or remove ${exercise.name} set ${number}`,
      };
    }
  }
  return null;
}

function cardioLeftover(exercise: LiftExerciseDraft): LeftoverTarget | null {
  if (leftoverCardioRounds(exercise) === 0) {
    return null;
  }
  const name = timedRowLabel(exercise);
  const rounds = exercise.rounds ?? [];
  const roundIndex = exercise.cardioType === 'interval' ? rounds.findIndex((round) => !round.completedAt) : -1;
  const setNumber = roundIndex >= 0 ? roundIndex + 1 : null;
  return {
    exerciseKey: exercise.key,
    exerciseName: name,
    muscleKey: exercise.muscleKey,
    setKey: null,
    setNumber,
    line: setNumber ? `Check or remove ${name} round ${setNumber}` : `Check or remove ${name}`,
  };
}

export function leftoverCardioRounds(exercise: LiftExerciseDraft): number {
  if (exercise.kind !== 'cardio') {
    return 0;
  }
  // An empty Cardio chip has no time. It does not block Complete, and it is not the row we scroll to.
  if (!canPlay(exercise) && cardioRowSeconds(exercise) <= 0) {
    return 0;
  }
  const extra = (exercise.rounds ?? []).filter((round) => !round.completedAt).length;
  if (exercise.cardioType === 'interval') {
    return (exercise.rounds ?? []).length ? extra : 1;
  }
  return (exercise.completedAt ? 0 : 1) + extra;
}

export function canCompleteSession(draft: LiftSessionDraft | null | undefined): boolean {
  if (!draft || firstLeftoverTarget(draft)) {
    return false;
  }
  return draft.exercises.some((exercise) => {
    if (exercise.kind === 'rest') {
      return false;
    }
    if (exercise.kind === 'cardio') {
      return leftoverCardioRounds(exercise) === 0 && cardioHasWork(exercise);
    }
    return exercise.sets.some((set) => set.kind === 'work' && set.completedAt);
  });
}

function cardioHasWork(exercise: LiftExerciseDraft): boolean {
  if (exercise.cardioType === 'interval') {
    return (exercise.rounds ?? []).length > 0;
  }
  return true;
}

/**
 * Weight times reps on completed working sets only. Warm-ups and cardio add nothing.
 *
 * This is the number stored on Complete. Unlike the recap helper, it never falls back to unchecked
 * sets — an unchecked working set is leftover work, not volume.
 */
export function sessionWeightMoved(draft: LiftSessionDraft | null | undefined): number {
  if (!draft) {
    return 0;
  }
  let total = 0;
  for (const exercise of draft.exercises) {
    if (exercise.kind !== 'strength') {
      continue;
    }
    for (const set of exercise.sets) {
      if (set.kind !== 'work' || !set.completedAt || set.weight == null || set.reps == null) {
        continue;
      }
      total += set.weight * set.reps;
    }
  }
  return Math.round(total);
}

export function toggleRoundComplete(
  rounds: readonly LiftRound[],
  index: number,
  now: string = new Date().toISOString(),
): LiftRound[] {
  if (index < 0 || index >= rounds.length) {
    return [...rounds];
  }
  return rounds.map((round, at) =>
    at === index ? { ...round, completedAt: round.completedAt ? null : now } : round,
  );
}

export type LiftCompletedCardModel = {
  sessionId: string;
  title: string;
  date: string;
  unit: WeightUnit;
  exerciseNames: string[];
  moreCount: number;
  weightMoved: number;
  weightLine: string;
  durationSeconds: number;
  durationLine: string;
  draft: boolean;
};

const CARD_NAME_CAP = 8;

export function completedExerciseNames(draft: LiftSessionDraft): string[] {
  const names: string[] = [];
  for (const exercise of draft.exercises) {
    if (exercise.kind === 'rest') {
      continue;
    }
    if (exercise.kind === 'cardio') {
      if (leftoverCardioRounds(exercise) === 0 && cardioHasWork(exercise)) {
        names.push(timedRowLabel(exercise));
      }
      continue;
    }
    if (exercise.sets.some((set) => set.kind === 'work' && set.completedAt)) {
      names.push(exercise.name);
    }
  }
  return names;
}

export function buildCompletedCard(draft: LiftSessionDraft): LiftCompletedCardModel {
  const names = completedExerciseNames(draft);
  const shown = names.slice(0, CARD_NAME_CAP);
  const weightMoved = sessionWeightMoved(draft);
  const durationSeconds = sessionCardioAndPlaySeconds(draft);
  const draftSession = !isCompletedStatus(draft.status, draft.completedAt);
  return {
    sessionId: draft.id,
    title: sessionTitle(draft),
    date: shortDate(draft.performedAt),
    unit: draft.unit,
    exerciseNames: shown,
    moreCount: Math.max(0, names.length - shown.length),
    weightMoved,
    weightLine: draftSession ? '' : weightMoved > 0 ? formatMassMoved(weightMoved, draft.unit, formatVolume(weightMoved)) : '',
    durationSeconds,
    durationLine: durationSeconds > 0 ? formatDuration(durationSeconds) : '',
    draft: draftSession,
  };
}

export function buildCompletedCardFromSummary(session: LiftSessionSummary): LiftCompletedCardModel {
  const names = session.preview.map((line) => line.split(' · ')[0]).filter(Boolean);
  const shown = names.slice(0, CARD_NAME_CAP);
  const draftSession = !isCompletedStatus(session.status, session.completedAt);
  const weightMoved = session.weightMoved ?? 0;
  const durationSeconds = session.durationSeconds ?? 0;
  return {
    sessionId: session.id,
    title: session.title,
    date: shortDate(session.performedAt),
    unit: session.unit,
    exerciseNames: shown,
    moreCount: Math.max(0, names.length - shown.length),
    weightMoved,
    weightLine: draftSession ? '' : weightMoved > 0 ? formatMassMoved(weightMoved, session.unit, formatVolume(weightMoved)) : '',
    durationSeconds,
    durationLine: durationSeconds > 0 ? formatDuration(durationSeconds) : '',
    draft: draftSession,
  };
}

function sessionCardioAndPlaySeconds(draft: LiftSessionDraft): number {
  return draft.exercises.reduce((total, exercise) => {
    if (exercise.kind === 'cardio') {
      return total + cardioRowSeconds(exercise);
    }
    return total;
  }, 0);
}

export function filterHistoryTab<
  T extends { favorite?: boolean; status?: string | null; completedAt?: string | null },
>(rows: readonly T[], tab: 'favorites' | 'drafts' | 'completed'): T[] {
  return rows.filter((row) => {
    const completed = isCompletedStatus(row.status, row.completedAt);
    if (tab === 'favorites') {
      return Boolean(row.favorite);
    }
    if (tab === 'drafts') {
      return !completed;
    }
    return completed;
  });
}

export function defaultHistoryTab<
  T extends { status?: string | null; completedAt?: string | null },
>(rows: readonly T[]): 'drafts' | 'completed' {
  return rows.some((row) => !isCompletedStatus(row.status, row.completedAt)) ? 'drafts' : 'completed';
}

export function formatWeightMoved(total: number, unit: WeightUnit): string {
  return formatMassMoved(total, unit, formatVolume(total));
}
