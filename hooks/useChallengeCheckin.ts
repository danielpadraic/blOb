import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import {
  checkinCtaTitle,
  isCheckinPrimary,
  isSubmittedCheckin,
  type ChallengeCheckin,
  type CheckinPhase,
} from '@/lib/challengeCheckin';
import { incrementDaysCompleted } from '@/lib/checkin/progress';
import { checkinPointValue } from '@/lib/challengePoints';
import { parseChallengeCheckin, saveCheckinProof, submitCheckin } from '@/lib/challenges/stagedCheckin';
import { parseProofParts, proofImageUrls } from '@/lib/challengeProofs';
import { cancelCheckoutReminder, scheduleCheckoutReminder } from '@/lib/health/localNudges';
import { usesComparablePointsScoring, usesPointsBoard, usesTotalCountCheckins } from '@/lib/challengeExperience';
import { heroRingActive } from '@/lib/challengeStart';
import { supabase } from '@/lib/supabase';
import type { Challenge } from '@/lib/types';
import {
  challengeClockTz,
  checkinPeriodKey,
  checkinPeriodKeyCandidates,
  normalizePeriodKey,
  type CheckinPeriodChallenge,
} from '@/lib/checkinPeriod';
import { dateStampInZone } from '@/lib/officialDays';
import { isOfficialSeriesChallenge } from '@/lib/officialSeries';
import { getErrorMessage } from '@/utils/errors';
import { reportAppError } from '@/lib/appErrors';
import { checkedInForCurrentPeriod } from '@/lib/lobbyChallenge';
import { signedProofUrl } from '@/utils/upload';

const CHECKIN_COLUMNS =
  'id, user_id, challenge_id, period_key, status, proof_parts, pre_selfie_url, post_selfie_url, hr_monitor_url, notes, health_workout_id, workout_submission_id, started_at, submitted_at, created_at, updated_at';

type PeriodChallenge = CheckinPeriodChallenge & {
  frequency?: string | null;
  target_count?: number | null;
  days_required?: number | null;
  length_value?: number | null;
  challenge_type?: string | null;
  scoring_method?: string | null;
  comparable_points_config?: unknown;
  scoring_config?: unknown;
  is_official?: boolean | null;
  category?: string | null;
};

export type ChallengeCheckinView = ChallengeCheckin & {
  phase: CheckinPhase;
  ctaTitle: string;
  isPrimary: boolean;
};

function periodKeyFor(challenge?: PeriodChallenge | null): string {
  if (!challenge) {
    return '';
  }
  try {
    return checkinPeriodKey(challenge);
  } catch {
    return normalizePeriodKey(dateStampInZone(new Date(), 'UTC'));
  }
}

function checkinQueryKey(challengeId: string | undefined, userId: string | undefined) {
  return ['challenge-checkin', challengeId, userId] as const;
}

function writeCheckinCache(
  queryClient: ReturnType<typeof useQueryClient>,
  challengeId: string,
  userId: string,
  row: ChallengeCheckin,
) {
  queryClient.setQueriesData({ queryKey: checkinQueryKey(challengeId, userId) }, asView(row));
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
    .order('created_at', { ascending: false })
    .limit(1)
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
  return hydrateCheckin(result.data as Record<string, unknown>);
}

async function hydrateCheckin(data: Record<string, unknown>): Promise<ChallengeCheckin> {
  const parsed = parseChallengeCheckin(data);
  const parts = { ...parsed.proof_parts };
  await Promise.all(
    Object.entries(parts).map(async ([id, part]) => {
      const signed = await Promise.all(
        proofImageUrls(part).map(async (url) => (await signedProofUrl(url)) ?? url),
      );
      if (signed.length === 0 && !part.url) {
        return;
      }
      parts[id] = {
        ...part,
        url: signed[0] ?? ((await signedProofUrl(part.url)) ?? part.url),
        urls: signed,
      };
    }),
  );
  const signLegacy = async (url?: string | null) => {
    const raw = String(url ?? '').trim();
    if (!raw) {
      return null;
    }
    return (await signedProofUrl(raw)) ?? raw;
  };
  return {
    ...parsed,
    proof_parts: parts,
    pre_selfie_url: await signLegacy(parsed.pre_selfie_url),
    post_selfie_url: await signLegacy(parsed.post_selfie_url),
    hr_monitor_url: await signLegacy(parsed.hr_monitor_url),
  };
}

function isSubmittedToday(
  row: { status?: string | null; submitted_at?: string | null; period_key?: unknown },
  challenge?: PeriodChallenge | null,
): boolean {
  if (!isSubmittedCheckin(row)) {
    return false;
  }
  const key = normalizePeriodKey(row.period_key);
  if (key && key === checkinPeriodKey(challenge)) {
    return true;
  }
  if (!row.submitted_at) {
    return false;
  }
  const submitted = new Date(row.submitted_at);
  if (Number.isNaN(submitted.getTime())) {
    return false;
  }
  const tz = challengeClockTz(challenge);
  return dateStampInZone(submitted, tz) === checkinPeriodKey(challenge);
}

export async function fetchCurrentPeriodCheckin(
  challengeId: string,
  userId: string,
  challenge?: PeriodChallenge | null,
  date?: string,
): Promise<ChallengeCheckin | null> {
  const key = normalizePeriodKey(date ?? periodKeyFor(challenge));
  const exact = key ? await fetchPeriodCheckin(challengeId, userId, key) : null;
  if (exact && !(usesTotalCountCheckins(challenge) && isSubmittedCheckin(exact))) {
    return exact;
  }
  const recent = await supabase
    .from('challenge_checkins')
    .select(CHECKIN_COLUMNS)
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .order('period_key', { ascending: false })
    .limit(12);
  if (recent.error) {
    if (isMissingRelation(recent.error.message)) {
      return null;
    }
    throw new Error(getErrorMessage(recent.error));
  }
  const candidates = new Set(checkinPeriodKeyCandidates(challenge).map(normalizePeriodKey));
  const rows = (recent.data ?? []) as Record<string, unknown>[];
  const open = rows.find(
    (row) =>
      candidates.has(normalizePeriodKey(row.period_key)) &&
      String(row.status ?? '') !== 'submitted' &&
      !row.submitted_at,
  );
  if (open) {
    return hydrateCheckin(open);
  }
  const match =
    rows.find((row) => candidates.has(normalizePeriodKey(row.period_key))) ??
    rows.find((row) =>
      isSubmittedToday(
        {
          status: typeof row.status === 'string' ? row.status : null,
          submitted_at: typeof row.submitted_at === 'string' ? row.submitted_at : null,
          period_key: row.period_key,
        },
        challenge,
      ),
    );
  if (!match) {
    return null;
  }
  if (usesTotalCountCheckins(challenge) && isSubmittedCheckin(match)) {
    return null;
  }
  return hydrateCheckin(match);
}

function phaseFromRow(row: ChallengeCheckin | null): CheckinPhase {
  if (!row) {
    return 'none';
  }
  if (isSubmittedCheckin(row)) {
    return 'submitted';
  }
  return row.status;
}

function asView(row: ChallengeCheckin | null): ChallengeCheckinView {
  const phase = phaseFromRow(row);
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
    phase,
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
      // Count live challenge_checkins only. posts.hidden_from_home must not join or filter this.
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
    queryKey: [...checkinQueryKey(challengeId, user?.id), challengeClockTz(challenge), date],
    enabled: Boolean(challengeId && user?.id),
    refetchInterval: official ? 30_000 : false,
    queryFn: async (): Promise<ChallengeCheckinView> => {
      const row = await fetchCurrentPeriodCheckin(challengeId!, user!.id, challenge, date);
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
      writeCheckinCache(queryClient, challengeId, user.id, row);
      void queryClient.invalidateQueries({ queryKey: ['feed', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-checkin'] });
      void queryClient.invalidateQueries({ queryKey: ['loggable-challenge'] });
      const cached = queryClient.getQueryData<Challenge>(['challenge', challengeId]);
      if (row.post_selfie_url || row.status === 'submitted') {
        void cancelCheckoutReminder(row.id);
      } else if (row.status === 'in_progress' || row.status === 'ready') {
        void scheduleCheckoutReminder({
          checkinId: row.id,
          challengeId,
          userId: user.id,
          beganAt: row.started_at,
          minMinutes: cached?.min_minutes,
          frequency: cached?.frequency,
          startsAt: cached?.starts_at,
          isOfficial: cached?.is_official,
          seriesId: cached?.series_id,
          timezone: cached?.timezone,
          daysRequired: cached?.days_required,
          dayWindows: cached?.day_windows,
        });
      }
    },
  });
}

export function useSubmitCheckin(challengeId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: () => submitCheckin(challengeId!),
    onSuccess: (row) => {
      if (row?.id) {
        void cancelCheckoutReminder(row.id);
      }
      if (!challengeId) {
        return;
      }
      if (row && user?.id) {
        const cachedChallenge = queryClient.getQueryData<Challenge>(['challenge', challengeId]);
        if (usesTotalCountCheckins(cachedChallenge)) {
          queryClient.setQueriesData({ queryKey: checkinQueryKey(challengeId, user.id) }, asView(null));
        } else {
          writeCheckinCache(queryClient, challengeId, user.id, row);
        }
        const bumpPoints =
          usesPointsBoard(cachedChallenge) && !usesComparablePointsScoring(cachedChallenge);
        const award = bumpPoints ? checkinPointValue(cachedChallenge) : 0;
        queryClient.setQueryData<ChallengeParticipantLike[]>(
          ['challenge-participants', challengeId],
          (current) =>
            (current ?? []).map((item) =>
              item.user_id === user.id
                ? {
                    ...item,
                    days_completed: incrementDaysCompleted(Number(item.days_completed) || 0, false),
                    points: bumpPoints ? (Number(item.points) || 0) + award : item.points,
                  }
                : item,
            ),
        );
        queryClient.setQueryData(
          ['my-participation', challengeId, user.id],
          (current: ChallengeParticipantLike | null | undefined) =>
            current
              ? {
                  ...current,
                  days_completed: incrementDaysCompleted(Number(current.days_completed) || 0, false),
                  points: bumpPoints ? (Number(current.points) || 0) + award : current.points,
                }
              : current,
        );
        queryClient.setQueriesData<number>(
          { queryKey: ['submitted-checkins', challengeId] },
          (current) => incrementDaysCompleted(Number(current) || 0, false),
        );
      }
      void queryClient.invalidateQueries({ queryKey: ['feed', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['workout-submission', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-completions', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['submitted-checkins', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['logged-workout-days', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-participants', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['my-participation', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['my-challenge-progress'] });
      void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['loggable-challenge'] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-checkin'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

type ChallengeParticipantLike = {
  user_id: string;
  days_completed?: number | null;
  points?: number | null;
};

export function parseCheckinParts(value: unknown) {
  return parseProofParts(value);
}

export function useLobbyTodayCheckins(
  challenges: Array<CheckinPeriodChallenge & { id: string }>,
) {
  const { user } = useAuth();
  const ids = challenges.map((row) => row.id).filter(Boolean);
  return useQuery({
    queryKey: ['lobby-today-checkins', user?.id, ids.join(',')],
    enabled: Boolean(user?.id) && ids.length > 0,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('challenge_checkins')
        .select('challenge_id, period_key, status, submitted_at')
        .eq('user_id', user!.id)
        .in('challenge_id', ids);
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      const byId = new Map(challenges.map((row) => [row.id, row]));
      const submitted = new Set<string>();
      for (const row of data ?? []) {
        const challengeId = String((row as { challenge_id?: string }).challenge_id ?? '');
        if (!challengeId) {
          continue;
        }
        if (checkedInForCurrentPeriod(row, byId.get(challengeId))) {
          submitted.add(challengeId);
        }
      }
      return submitted;
    },
  });
}
