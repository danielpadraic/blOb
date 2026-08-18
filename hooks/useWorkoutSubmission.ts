import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { reportBadgeActivity } from '@/lib/badgeActivity';
import { logWorkout } from '@/lib/challenges/logWorkout';
import { supabase } from '@/lib/supabase';
import type { ChallengeParticipant, ProofType, WorkoutSubmission } from '@/lib/types';
import { utcDateStamp } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';
import { signedProofUrl } from '@/utils/upload';

export type ProofUris = Record<ProofType, string | null>;

export type WorkoutSubmissionView = WorkoutSubmission & {
  pre_selfie_display?: string | null;
  post_selfie_display?: string | null;
  hr_monitor_display?: string | null;
  days_completed?: number;
};

const SUBMISSION_COLUMNS =
  'id, challenge_id, user_id, submission_date, pre_selfie_url, post_selfie_url, hr_monitor_url, notes, status, created_at';

function submissionQueryKey(challengeId: string | undefined, userId: string | undefined, date: string) {
  return ['workout-submission', challengeId, userId, date] as const;
}

function isMissingColumn(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('does not exist') ||
    text.includes('could not find') ||
    text.includes('schema cache') ||
    text.includes('42703') ||
    text.includes('42p01')
  );
}

function asSubmission(row: Record<string, unknown>): WorkoutSubmission {
  return {
    id: String(row.id),
    challenge_id: String(row.challenge_id),
    user_id: String(row.user_id),
    submission_date: String(row.submission_date),
    pre_selfie_url: (row.pre_selfie_url as string | null) ?? null,
    post_selfie_url: (row.post_selfie_url as string | null) ?? null,
    hr_monitor_url: (row.hr_monitor_url as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    status: (row.status as WorkoutSubmission['status']) ?? 'pending_review',
    task_ids: Array.isArray(row.task_ids) ? row.task_ids.map(String) : [],
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

async function withDisplayUrls(row: WorkoutSubmission): Promise<WorkoutSubmissionView> {
  const [pre, post, hr] = await Promise.all([
    signedProofUrl(row.pre_selfie_url),
    signedProofUrl(row.post_selfie_url),
    signedProofUrl(row.hr_monitor_url),
  ]);
  return {
    ...row,
    pre_selfie_display: pre,
    post_selfie_display: post,
    hr_monitor_display: hr,
  };
}

async function fetchTodaySubmission(
  challengeId: string,
  userId: string,
  date: string,
): Promise<WorkoutSubmission | null> {
  const result = await supabase
    .from('workout_submissions')
    .select(SUBMISSION_COLUMNS)
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .eq('submission_date', date)
    .maybeSingle();
  if (result.error) {
    if (isMissingColumn(result.error.message)) {
      return null;
    }
    throw new Error(getErrorMessage(result.error));
  }
  return result.data ? asSubmission(result.data as Record<string, unknown>) : null;
}

export function useTodaySubmission(challengeId: string | undefined) {
  const { user } = useAuth();
  const date = utcDateStamp();

  return useQuery({
    queryKey: submissionQueryKey(challengeId, user?.id, date),
    enabled: Boolean(challengeId && user?.id),
    queryFn: async (): Promise<WorkoutSubmissionView | null> => {
      const row = await fetchTodaySubmission(challengeId!, user!.id, date);
      if (!row) {
        return null;
      }
      return withDisplayUrls(row);
    },
  });
}

export function useLoggedWorkoutCount(challengeId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['logged-workout-days', challengeId, user?.id],
    enabled: Boolean(challengeId && user?.id),
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('challenge_participants')
        .select('days_completed')
        .eq('challenge_id', challengeId!)
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      return Number((data as { days_completed?: number } | null)?.days_completed ?? 0);
    },
  });
}

export function useCompletedTaskIds(challengeId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['completed-task-ids', challengeId, user?.id],
    enabled: Boolean(challengeId && user?.id),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('workout_submissions')
        .select('task_ids')
        .eq('challenge_id', challengeId!)
        .eq('user_id', user!.id);
      if (error) {
        if (isMissingColumn(error.message)) {
          return [];
        }
        throw new Error(getErrorMessage(error));
      }
      const ids = (data ?? []).flatMap((row) => {
        const value = (row as { task_ids?: unknown }).task_ids;
        return Array.isArray(value) ? value.map(String) : [];
      });
      return [...new Set(ids.filter(Boolean))];
    },
  });
}

type SubmitWorkoutInput = {
  challengeId: string;
  images: Array<{ type: ProofType; uri: string; mimeType?: string | null }>;
  notes?: string | null;
};

type ProgressRow = Pick<ChallengeParticipant, 'challenge_id' | 'days_completed' | 'status'>;

export function useSubmitWorkout() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const date = utcDateStamp();

  return useMutation({
    mutationFn: async (input: SubmitWorkoutInput): Promise<WorkoutSubmissionView> => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }

      if (input.images.length < 1) {
        throw new Error('Add every required proof to log today.');
      }

      const logged = await logWorkout({
        challengeId: input.challengeId,
        proofs: input.images,
        notes: input.notes ?? null,
      });

      return {
        ...(await withDisplayUrls(logged)),
        days_completed: logged.days_completed,
      };
    },
    onSuccess: (data, input) => {
      queryClient.setQueryData(submissionQueryKey(input.challengeId, user?.id, date), data);
      if (typeof data.days_completed === 'number' && user) {
        queryClient.setQueryData<ChallengeParticipant>(
          ['my-participation', input.challengeId, user.id],
          (current) =>
            current
              ? { ...current, days_completed: data.days_completed ?? current.days_completed }
              : current,
        );
        queryClient.setQueryData<number>(
          ['logged-workout-days', input.challengeId, user.id],
          data.days_completed,
        );
        queryClient.setQueryData<ProgressRow[]>(['my-challenge-progress', user.id], (current) =>
          (current ?? []).map((row) =>
            row.challenge_id === input.challengeId
              ? { ...row, days_completed: data.days_completed ?? row.days_completed }
              : row,
          ),
        );
      }
      void queryClient.invalidateQueries({ queryKey: ['feed', input.challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['feed', 'global'] });
      void reportBadgeActivity();
    },
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: submissionQueryKey(input.challengeId, user?.id, date),
      });
      void queryClient.invalidateQueries({
        queryKey: ['challenge-participants', input.challengeId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['my-participation', input.challengeId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['logged-workout-days', input.challengeId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['challenge-completions', input.challengeId],
      });
      void queryClient.invalidateQueries({ queryKey: ['my-challenge-progress'] });
      void queryClient.invalidateQueries({ queryKey: ['challenge', input.challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
      void queryClient.invalidateQueries({ queryKey: ['loggable-challenge'] });
    },
  });
}

export function usePeriodCompletions(challengeId: string | undefined) {
  const date = utcDateStamp();
  return useQuery({
    queryKey: ['challenge-completions', challengeId, date],
    enabled: Boolean(challengeId),
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('workout_submissions')
        .select('user_id')
        .eq('challenge_id', challengeId!)
        .eq('submission_date', date);
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      return new Set((data ?? []).map((row) => String((row as { user_id: string }).user_id)));
    },
  });
}
