import { formatDuration } from '@/lib/lift/duration';
import { formatVolume } from '@/lib/lift/recap';
import { cardioRowSeconds } from '@/lib/lift/rounds';
import { sessionTitle, shortDate, timedRowLabel } from '@/lib/lift/session';
import type { LiftExerciseDraft, LiftRound, LiftSessionDraft, LiftSessionSummary } from '@/lib/lift/types';
import type { WeightUnit } from '@/lib/types';

/**
 * When a lift can leave Draft, what weight moved means, and the summary card for a finished session.
 *
 * Complete is a gate, not a save. Autosave and Save stay Draft. Complete is allowed only when every
 * leftover set and cardio round is Done or gone.
 */

export const COMPLETE_LEFTOVER_HINT = 'Check Done or remove leftover sets and rounds.';

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

/** Remaining sets and cardio rounds that still need Done. Rest rows between sets do not count. */
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
    sets += exercise.sets.filter((set) => !set.completedAt).length;
  }
  return { sets, rounds };
}

export function leftoverCardioRounds(exercise: LiftExerciseDraft): number {
  if (exercise.kind !== 'cardio') {
    return 0;
  }
  const extra = (exercise.rounds ?? []).filter((round) => !round.completedAt).length;
  if (exercise.cardioType === 'interval') {
    return (exercise.rounds ?? []).length ? extra : 1;
  }
  return (exercise.completedAt ? 0 : 1) + extra;
}

export function canCompleteSession(draft: LiftSessionDraft | null | undefined): boolean {
  if (!draft) {
    return false;
  }
  const leftover = leftoverIncompleteWork(draft);
  if (leftover.sets > 0 || leftover.rounds > 0) {
    return false;
  }
  return draft.exercises.some((exercise) => {
    if (exercise.kind === 'rest') {
      return false;
    }
    if (exercise.kind === 'cardio') {
      return leftoverCardioRounds(exercise) === 0 && cardioHasWork(exercise);
    }
    return exercise.sets.some((set) => set.completedAt);
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
    weightLine: draftSession ? '' : weightMoved > 0 ? `${formatVolume(weightMoved)} ${draft.unit} moved` : '',
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
    weightLine: draftSession ? '' : weightMoved > 0 ? `${formatVolume(weightMoved)} ${session.unit} moved` : '',
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
  return `${formatVolume(total)} ${unit} moved`;
}
