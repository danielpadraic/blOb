import { copy } from '@/lib/copy';
import { supabase } from '@/lib/supabase';
import type { ChallengeProofPart, WorkoutSubmission } from '@/lib/types';
import { utcDateStamp } from '@/utils/dates';
import { getErrorMessage, isMissingRelationError, isUnknownColumnError } from '@/utils/errors';

export type LogHealthWorkoutInput = {
  challengeId: string;
  healthWorkoutId: string;
  notes?: string | null;
};

export type LogHealthWorkoutResult = WorkoutSubmission & {
  days_completed: number;
  media_urls: string[];
};

function throwMapped(error: { message?: string; code?: string; details?: string }): never {
  const blob = [error.code, error.message, error.details].filter(Boolean).join(' ');
  const upper = blob.toUpperCase();
  if (
    isUnknownColumnError(error) ||
    isMissingRelationError(error) ||
    upper.includes('PGRST202') ||
    upper.includes('PGRST204') ||
    ((upper.includes('COULD NOT FIND') || upper.includes('DOES NOT EXIST')) &&
      upper.includes('LOG_HEALTH_WORKOUT'))
  ) {
    throw new Error(copy('health.attachFailed'));
  }
  if (upper.includes('ALREADY_LOGGED_TODAY') || upper.includes('ALREADY LOGGED')) {
    throw new Error('Already logged today. Come back tomorrow.');
  }
  if (upper.includes('NOT_PARTICIPANT') || upper.includes('JOIN THE CHALLENGE')) {
    throw new Error('Join this challenge before logging.');
  }
  if (upper.includes('NOT_STARTED')) {
    throw new Error('This challenge hasn’t started yet.');
  }
  throw new Error(getErrorMessage(error));
}

async function readDaysCompleted(challengeId: string, userId: string): Promise<number> {
  const { data } = await supabase
    .from('challenge_participants')
    .select('days_completed')
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .maybeSingle();
  return Number((data as { days_completed?: number } | null)?.days_completed ?? 0);
}

export async function logHealthWorkout(input: LogHealthWorkoutInput): Promise<LogHealthWorkoutResult> {
  const { data: session } = await supabase.auth.getUser();
  const userId = session.user?.id;
  if (!userId) {
    throw new Error('You need to be signed in.');
  }

  const { data, error } = await supabase.rpc('log_health_workout', {
    p_challenge_id: input.challengeId,
    p_health_workout_id: input.healthWorkoutId,
    p_submission_date: utcDateStamp(),
    p_notes: input.notes ?? null,
  });

  if (error) {
    throwMapped(error);
  }

  const row = (data && typeof data === 'object' && !Array.isArray(data)
    ? data
    : {}) as Record<string, unknown>;
  const parsedDays = Number(row.days_completed);
  const daysCompleted = Number.isFinite(parsedDays)
    ? parsedDays
    : await readDaysCompleted(input.challengeId, userId);

  return {
    id: String(row.id ?? ''),
    challenge_id: String(row.challenge_id ?? input.challengeId),
    user_id: String(row.user_id ?? userId),
    submission_date: String(row.submission_date ?? utcDateStamp()),
    pre_selfie_url: (row.pre_selfie_url as string | null) ?? null,
    post_selfie_url: (row.post_selfie_url as string | null) ?? null,
    hr_monitor_url: (row.hr_monitor_url as string | null) ?? null,
    notes: (row.notes as string | null) ?? input.notes ?? null,
    status: (row.status as WorkoutSubmission['status']) ?? 'pending_review',
    task_ids: Array.isArray(row.task_ids) ? row.task_ids.map(String) : [],
    proof_parts: (row.proof_parts as Record<string, ChallengeProofPart> | null) ?? {},
    proof_kind: (row.proof_kind as WorkoutSubmission['proof_kind']) ?? 'health_workout',
    health_workout_id: (row.health_workout_id as string | null) ?? input.healthWorkoutId,
    created_at: String(row.created_at ?? new Date().toISOString()),
    days_completed: daysCompleted,
    media_urls: [],
  };
}
