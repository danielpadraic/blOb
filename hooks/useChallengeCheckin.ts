import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import {
  checkinCtaTitle,
  isCheckinPrimary,
  type ChallengeCheckin,
  type CheckinPhase,
} from '@/lib/challengeCheckin';
import { parseChallengeCheckin, saveCheckinProof, submitCheckin } from '@/lib/challenges/stagedCheckin';
import { parseProofParts } from '@/lib/challengeProofs';
import { heroRingActive } from '@/lib/challengeStart';
import { supabase } from '@/lib/supabase';
import type { Challenge } from '@/lib/types';
import { officialLogDate } from '@/lib/officialDays';
import { isOfficialSeriesChallenge } from '@/lib/officialSeries';
import { utcDateStamp } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';
import { reportAppError } from '@/lib/appErrors';
import { signedProofUrl } from '@/utils/upload';

const CHECKIN_COLUMNS =
  'id, user_id, challenge_id, period_key, status, proof_parts, pre_selfie_url, post_selfie_url, hr_monitor_url, notes, health_workout_id, workout_submission_id, started_at, submitted_at, created_at, updated_at';

type PeriodChallenge = Pick<
  Challenge,
  'is_official' | 'series_id' | 'status' | 'starts_at' | 'timezone' | 'days_required' | 'day_windows'
> & {
  target_count?: number | null;
};

export type ChallengeCheckinView = ChallengeCheckin & {
  phase: CheckinPhase;
  ctaTitle: string;
  isPrimary: boolean;
};

function periodKeyFor(challenge?: PeriodChallenge | null): string {
  if (challenge && isOfficialSeriesChallenge(challenge)) {
    return officialLogDate(challenge) ?? utcDateStamp();
  }
  return utcDateStamp();
}

function checkinQueryKey(challengeId: string | undefined, userId: string | undefined, date: string) {
  return ['challenge-checkin', challengeId, userId, date] as const;
}

function isMissingRelation(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('42p01') ||
    text.includes('42703') ||
    text.includes('pgrst')
  );
}

async function fetchPeriodCheckin(
  challengeId: string,
  userId: string,
  date: string,
): Promise<ChallengeCheckin | null> {
  const result = await supabase
    .from('challenge_checkins')
    .select(CHECKIN_COLUMNS)
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .eq('period_key', date)
    .maybeSingle();
  if (result.error) {
    if (isMissingRelation(result.error.message)) {
      return null;
    }
    reportAppError({
      route: 'checkin_fetch',
      error: result.error,
      payload: { challenge_id: challengeId },
    });
    throw new Error(getErrorMessage(result.error));
  }
  if (!result.data) {
    return null;
  }
  const parsed = parseChallengeCheckin(result.data as Record<string, unknown>);
  const parts = { ...parsed.proof_parts };
  await Promise.all(
    Object.entries(parts).map(async ([id, part]) => {
      if (part.url) {
        parts[id] = { ...part, url: (await signedProofUrl(part.url)) ?? part.url };
      }
    }),
  );
  return { ...parsed, proof_parts: parts };
}

function asView(row: ChallengeCheckin | null): ChallengeCheckinView {
  const phase: CheckinPhase = row?.status ?? 'none';
  return {
    ...(row ?? {
      id: '',
      user_id: '',
      challenge_id: '',
      period_key: '',
      status: 'in_progress',
      proof_parts: {},
      started_at: '',
      created_at: '',
    }),
    phase: row ? row.status : 'none',
    ctaTitle: checkinCtaTitle(phase),
    isPrimary: isCheckinPrimary(phase),
  };
}

export function useSubmittedCheckinCount(
  challengeId: string | undefined,
  challenge?: {
    status?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
  } | null,
) {
  const { user } = useAuth();
  const liveWindow = heroRingActive(challenge?.status);
  const windowKey = liveWindow ? (challenge?.starts_at ?? 'live') : 'not-live';

  return useQuery({
    queryKey: ['submitted-checkins', challengeId, user?.id, windowKey],
    enabled: Boolean(challengeId && user?.id),
    queryFn: async (): Promise<number> => {
      if (!liveWindow) {
        return 0;
      }
      let query = supabase
        .from('challenge_checkins')
        .select('id', { count: 'exact', head: true })
        .eq('challenge_id', challengeId!)
        .eq('user_id', user!.id)
        .eq('status', 'submitted')
        .not('submitted_at', 'is', null);
      const { count, error } = await query;
      if (error) {
        if (isMissingRelation(error.message)) {
          return 0;
        }
        throw new Error(getErrorMessage(error));
      }
      return Math.max(0, count ?? 0);
    },
  });
}

export function usePeriodCheckin(
  challengeId: string | undefined,
  challenge?: PeriodChallenge | null,
) {
  const { user } = useAuth();
  const date = periodKeyFor(challenge);
  const official = Boolean(challenge && isOfficialSeriesChallenge(challenge));

  return useQuery({
    queryKey: checkinQueryKey(challengeId, user?.id, date),
    enabled: Boolean(challengeId && user?.id),
    refetchInterval: official ? 30_000 : false,
    queryFn: async (): Promise<ChallengeCheckinView> => {
      const row = await fetchPeriodCheckin(challengeId!, user!.id, date);
      return asView(row);
    },
  });
}

export function useSaveCheckinProof(challengeId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: saveCheckinProof,
    onSuccess: (row) => {
      if (!challengeId || !user?.id) {
        return;
      }
      queryClient.setQueryData(checkinQueryKey(challengeId, user.id, row.period_key), asView(row));
      void queryClient.invalidateQueries({ queryKey: ['feed', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-checkin'] });
      void queryClient.invalidateQueries({ queryKey: ['loggable-challenge'] });
    },
  });
}

export function useSubmitCheckin(challengeId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: () => submitCheckin(challengeId!),
    onSuccess: (row) => {
      if (!challengeId) {
        return;
      }
      if (row && user?.id) {
        queryClient.setQueryData(checkinQueryKey(challengeId, user.id, row.period_key), asView(row));
      }
      void queryClient.invalidateQueries({ queryKey: ['feed', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['workout-submission', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-completions', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['submitted-checkins', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['logged-workout-days', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-participants', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['my-challenge-progress'] });
      void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['loggable-challenge'] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-checkin'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function parseCheckinParts(value: unknown) {
  return parseProofParts(value);
}
