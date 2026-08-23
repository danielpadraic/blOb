import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { reportBadgeActivity } from '@/lib/badgeActivity';
import { logHealthWorkout } from '@/lib/challenges/logHealthWorkout';
import { logWorkout } from '@/lib/challenges/logWorkout';
import { upsertHealthWorkout, workoutNotes } from '@/lib/health/remote';
import { getHealthProvider } from '@/services/health';
import type { HealthWorkout } from '@/services/health/types';
import { copy } from '@/lib/copy';
import { parseProofParts } from '@/lib/challengeProofs';
import { supabase } from '@/lib/supabase';
import type { Challenge, ChallengeParticipant, ChallengeProof, ProofType, WorkoutSubmission } from '@/lib/types';
import { checkinPeriodKey, checkinPeriodKeyCandidates, challengeClockTz } from '@/lib/checkinPeriod';
import { dateStampInZone } from '@/lib/officialDays';
import { isOfficialSeriesChallenge } from '@/lib/officialSeries';
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
  'id, challenge_id, user_id, submission_date, pre_selfie_url, post_selfie_url, hr_monitor_url, notes, status, created_at, proof_parts, proof_kind, health_workout_id';

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
    proof_parts: parseProofParts(row.proof_parts),
    proof_kind: (row.proof_kind as WorkoutSubmission['proof_kind']) ?? null,
    health_workout_id: (row.health_workout_id as string | null) ?? null,
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
      const fallback = await supabase
        .from('workout_submissions')
        .select('id, challenge_id, user_id, submission_date, pre_selfie_url, post_selfie_url, hr_monitor_url, notes, status, created_at')
        .eq('challenge_id', challengeId)
        .eq('user_id', userId)
        .eq('submission_date', date)
        .maybeSingle();
      if (fallback.error) {
        if (isMissingColumn(fallback.error.message)) {
          return null;
        }
        throw new Error(getErrorMessage(fallback.error));
      }
      return fallback.data ? asSubmission(fallback.data as Record<string, unknown>) : null;
    }
    throw new Error(getErrorMessage(result.error));
  }
  return result.data ? asSubmission(result.data as Record<string, unknown>) : null;
}

type OfficialDateChallenge = Pick<
  Challenge,
  'is_official' | 'series_id' | 'status' | 'starts_at' | 'timezone' | 'days_required' | 'target_count' | 'day_windows'
>;

function submissionDateFor(challenge?: OfficialDateChallenge | null): string {
  return checkinPeriodKey(challenge);
}

export function useTodaySubmission(
  challengeId: string | undefined,
  challenge?: OfficialDateChallenge | null,
) {
  const { user } = useAuth();
  const date = submissionDateFor(challenge);
  const official = Boolean(challenge && isOfficialSeriesChallenge(challenge));

  return useQuery({
    queryKey: submissionQueryKey(challengeId, user?.id, date ?? 'none'),
    enabled: Boolean(challengeId && user?.id && date),
    refetchInterval: official ? 30_000 : false,
    queryFn: async (): Promise<WorkoutSubmissionView | null> => {
      const row = await fetchTodaySubmission(challengeId!, user!.id, date!);
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
  images: Array<{ type: ProofType; uri: string; mimeType?: string | null; proofId?: string; text?: string | null }>;
  required?: ChallengeProof[];
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

      const required = input.required ?? [];
      if (required.length === 0 && input.images.length < 1) {
        throw new Error('Add every required proof to check in today.');
      }

      const logged = await logWorkout({
        challengeId: input.challengeId,
        proofs: input.images,
        required,
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
        queryKey: ['submitted-checkins', input.challengeId],
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

type SubmitHealthWorkoutInput = {
  challengeId: string;
  workout: HealthWorkout;
};

export function useSubmitHealthWorkout() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const date = utcDateStamp();

  return useMutation({
    mutationFn: async (input: SubmitHealthWorkoutInput): Promise<WorkoutSubmissionView> => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      try {
        const provider = getHealthProvider();
        const enriched = provider?.enrichHeartRate
          ? await provider.enrichHeartRate(input.workout)
          : input.workout;
        const healthWorkoutId = await upsertHealthWorkout(user.id, enriched);
        const logged = await logHealthWorkout({
          challengeId: input.challengeId,
          healthWorkoutId,
          notes: workoutNotes(enriched),
        });
        return {
          ...(await withDisplayUrls(logged)),
          days_completed: logged.days_completed,
        };
      } catch (error) {
        if (error instanceof Error && error.message === 'health_schema_missing') {
          throw new Error(copy('health.attachFailed'));
        }
        throw error;
      }
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
        queryKey: ['submitted-checkins', input.challengeId],
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

async function fetchSubmittedUserIds(challengeId: string, periodKey: string): Promise<Set<string>> {
  const submitted = await supabase
    .from('challenge_checkins')
    .select('user_id')
    .eq('challenge_id', challengeId)
    .eq('period_key', periodKey)
    .eq('status', 'submitted')
    .not('submitted_at', 'is', null);
  if (submitted.error) {
    if (isMissingColumn(submitted.error.message)) {
      return new Set();
    }
    throw new Error(getErrorMessage(submitted.error));
  }
  return new Set((submitted.data ?? []).map((row) => String((row as { user_id: string }).user_id)));
}

export function usePeriodCompletions(
  challengeId: string | undefined,
  challenge?: OfficialDateChallenge | null,
) {
  const { user } = useAuth();
  const date = submissionDateFor(challenge);
  const live = String(challenge?.status ?? '') === 'live';
  return useQuery({
    queryKey: ['challenge-completions', challengeId, date, live ? 'live' : 'not-live'],
    enabled: Boolean(challengeId && challenge),
    queryFn: async (): Promise<Set<string>> => {
      if (!live) {
        return new Set();
      }
      const exact = await fetchSubmittedUserIds(challengeId!, date);
      if (exact.size > 0) {
        return exact;
      }
      if (!user?.id) {
        return exact;
      }
      const mine = await supabase
        .from('challenge_checkins')
        .select('period_key, submitted_at, status')
        .eq('challenge_id', challengeId!)
        .eq('user_id', user.id)
        .eq('status', 'submitted')
        .not('submitted_at', 'is', null)
        .order('period_key', { ascending: false })
        .limit(5);
      if (mine.error) {
        if (isMissingColumn(mine.error.message)) {
          return exact;
        }
        throw new Error(getErrorMessage(mine.error));
      }
      const candidates = new Set(checkinPeriodKeyCandidates(challenge));
      const tz = challengeClockTz(challenge);
      const today = dateStampInZone(new Date(), tz);
      const recovered = (mine.data ?? []).find((row) => {
        const key = String((row as { period_key: string }).period_key ?? '');
        const submittedAt = String((row as { submitted_at?: string | null }).submitted_at ?? '');
        if (candidates.has(key)) {
          return true;
        }
        if (!submittedAt) {
          return false;
        }
        const at = new Date(submittedAt);
        return !Number.isNaN(at.getTime()) && dateStampInZone(at, tz) === today;
      });
      if (!recovered) {
        return exact;
      }
      const recoveredKey = String((recovered as { period_key: string }).period_key);
      if (!recoveredKey || recoveredKey === date) {
        return exact;
      }
      return fetchSubmittedUserIds(challengeId!, recoveredKey);
    },
  });
}
