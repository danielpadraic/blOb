import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { checkinPeriodKey, checkinPeriodKeyCandidates, normalizePeriodKey } from '@/lib/checkinPeriod';
import { isClosedForLogs } from '@/lib/settlement';
import { supabase } from '@/lib/supabase';
import type { Challenge, ChallengeParticipant } from '@/lib/types';
import { checkinCtaTitle, type CheckinPhase } from '@/lib/challengeCheckin';
import { loggableStatusLine } from '@/lib/loggable';
import { utcDateStamp } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';

export { asLoggableList, loggableStatusLine } from '@/lib/loggable';

export type LoggableChallenge = Pick<
  Challenge,
  | 'id'
  | 'title'
  | 'is_official'
  | 'status'
  | 'starts_at'
  | 'ends_at'
  | 'is_unlimited'
  | 'frequency'
  | 'min_minutes'
  | 'series_id'
  | 'timezone'
  | 'days_required'
  | 'day_windows'
> & {
  checkinPhase?: CheckinPhase;
  ctaTitle?: string;
  daysCompleted?: number;
  statusLine?: string;
};

type ParticipationRow = Pick<
  ChallengeParticipant,
  'challenge_id' | 'status' | 'joined_at' | 'eliminated_at'
> & {
  days_completed?: number | null;
};

const PARTICIPANT_SELECT = 'challenge_id, status, joined_at, eliminated_at, days_completed';
const PARTICIPANT_SELECT_LEGACY = 'challenge_id, status, joined_at, days_completed';

const CHALLENGE_SELECTS = [
  'id, title, is_official, status, starts_at, ends_at, is_unlimited, frequency, min_minutes, series_id, timezone, days_required, day_windows',
  'id, title, is_official, status, starts_at, ends_at, is_unlimited, frequency, min_minutes, series_id, timezone, days_required',
  'id, title, is_official, status, starts_at, ends_at, is_unlimited, frequency, min_minutes',
  'id, title, is_official, status, starts_at, ends_at, is_unlimited',
  'id, title, is_official, status, starts_at, ends_at',
] as const;

export function useLoggableChallenges() {
  const { user } = useAuth();
  const date = utcDateStamp();

  return useQuery({
    queryKey: ['loggable-challenge', user?.id, date],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<LoggableChallenge[]> => {
      if (!user) {
        return [];
      }
      const participations = await fetchActiveParticipations(user.id);
      if (participations.length === 0) {
        return [];
      }
      const challengeIds = participations.map((row) => row.challenge_id);
      const [challenges, loggedRows, checkinRows] = await Promise.all([
        fetchChallenges(challengeIds),
        fetchLoggedDates(user.id, challengeIds),
        fetchCheckinPhases(user.id, challengeIds),
      ]);
      const joinedAt = new Map(participations.map((row) => [row.challenge_id, row.joined_at]));
      const daysCompleted = new Map(
        participations.map((row) => [row.challenge_id, Number(row.days_completed ?? 0)]),
      );
      const now = Date.now();

      return challenges
        .filter((challenge) => {
          const expected = checkinPeriodKey(challenge);
          if (loggedRows.get(challenge.id)?.has(expected)) {
            return false;
          }
          if (submittedThisPeriod(challenge, checkinRows)) {
            return false;
          }
          if (new Date(challenge.starts_at).getTime() > now) {
            return false;
          }
          if (String(challenge.status ?? '') !== 'live') {
            return false;
          }
          return !isClosedForLogs(challenge);
        })
        .sort((a, b) => {
          const aDue = a.ends_at ? new Date(a.ends_at).getTime() : Number.POSITIVE_INFINITY;
          const bDue = b.ends_at ? new Date(b.ends_at).getTime() : Number.POSITIVE_INFINITY;
          if (aDue !== bDue) {
            return aDue - bDue;
          }
          if (a.is_official !== b.is_official) {
            return a.is_official ? -1 : 1;
          }
          const aJoined = joinedAt.get(a.id) ?? '';
          const bJoined = joinedAt.get(b.id) ?? '';
          return new Date(bJoined).getTime() - new Date(aJoined).getTime();
        })
        .map((challenge) => {
          const phase = phaseForPeriod(challenge, checkinRows);
          const completed = daysCompleted.get(challenge.id) ?? 0;
          return {
            ...challenge,
            daysCompleted: completed,
            checkinPhase: phase,
            ctaTitle: checkinCtaTitle(phase),
            statusLine: loggableStatusLine({
              ends_at: challenge.ends_at,
              days_required: challenge.days_required,
              daysCompleted: completed,
              todayKey: checkinPeriodKey(challenge),
            }),
          };
        });
    },
  });
}

/** First open check-in only. Quick Action should use `useLoggableChallenges`. */
export function useLoggableChallenge() {
  const list = useLoggableChallenges();
  return {
    ...list,
    data: list.data?.[0] ?? null,
  };
}

function submittedThisPeriod(
  challenge: LoggableChallenge,
  checkinRows: Map<string, CheckinPhase>,
): boolean {
  return checkinPeriodKeyCandidates(challenge).some(
    (key) => checkinRows.get(`${challenge.id}:${key}`) === 'submitted',
  );
}

function phaseForPeriod(
  challenge: LoggableChallenge,
  checkinRows: Map<string, CheckinPhase>,
): CheckinPhase {
  for (const key of checkinPeriodKeyCandidates(challenge)) {
    const phase = checkinRows.get(`${challenge.id}:${key}`);
    if (phase) {
      return phase;
    }
  }
  return 'none';
}

async function fetchActiveParticipations(userId: string): Promise<ParticipationRow[]> {
  const primary = await supabase
    .from('challenge_participants')
    .select(PARTICIPANT_SELECT)
    .eq('user_id', userId);
  const fallback = primary.error
    ? await supabase
        .from('challenge_participants')
        .select(PARTICIPANT_SELECT_LEGACY)
        .eq('user_id', userId)
    : primary;
  const result = fallback.error
    ? await supabase
        .from('challenge_participants')
        .select('challenge_id, status, joined_at')
        .eq('user_id', userId)
    : fallback;
  if (result.error) {
    throw new Error(getErrorMessage(result.error));
  }
  return ((result.data ?? []) as ParticipationRow[])
    .map((row) => ({
      ...row,
      eliminated_at: row.eliminated_at ?? null,
      days_completed: Number(row.days_completed ?? 0),
    }))
    .filter((row) => {
      const status = String(row.status ?? 'joined');
      const participating = status === 'joined' || status === 'active' || status === 'completed';
      return participating && !row.eliminated_at;
    });
}

async function fetchChallenges(ids: string[]): Promise<LoggableChallenge[]> {
  if (ids.length === 0) {
    return [];
  }
  for (const columns of CHALLENGE_SELECTS) {
    const { data, error } = await supabase.from('challenges').select(columns).in('id', ids);
    if (error) {
      continue;
    }
    return ((data ?? []) as unknown as LoggableChallenge[]).map((row) => ({
      ...row,
      is_official: Boolean(row.is_official),
      is_unlimited: Boolean(row.is_unlimited),
      frequency: row.frequency ?? null,
      min_minutes: Number(row.min_minutes ?? 0),
    }));
  }
  return [];
}

async function fetchCheckinPhases(
  userId: string,
  challengeIds: string[],
): Promise<Map<string, CheckinPhase>> {
  const phases = new Map<string, CheckinPhase>();
  if (challengeIds.length === 0) {
    return phases;
  }
  const result = await supabase
    .from('challenge_checkins')
    .select('challenge_id, period_key, status, submitted_at')
    .eq('user_id', userId)
    .in('challenge_id', challengeIds);
  if (result.error) {
    const text = result.error.message.toLowerCase();
    if (
      text.includes('does not exist') ||
      text.includes('schema cache') ||
      text.includes('42p01') ||
      text.includes('pgrst')
    ) {
      return phases;
    }
    throw new Error(getErrorMessage(result.error));
  }
  for (const row of result.data ?? []) {
    const status = row.status;
    const phase: CheckinPhase =
      row.submitted_at || status === 'submitted'
        ? 'submitted'
        : status === 'ready' || status === 'in_progress'
          ? status
          : 'in_progress';
    phases.set(`${String(row.challenge_id)}:${normalizePeriodKey(row.period_key)}`, phase);
  }
  return phases;
}

async function fetchLoggedDates(
  userId: string,
  challengeIds: string[],
): Promise<Map<string, Set<string>>> {
  const logged = new Map<string, Set<string>>();
  if (challengeIds.length === 0) {
    return logged;
  }
  const { data, error } = await supabase
    .from('workout_submissions')
    .select('challenge_id, submission_date')
    .eq('user_id', userId)
    .in('challenge_id', challengeIds);
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  for (const row of data ?? []) {
    const id = String(row.challenge_id);
    const dates = logged.get(id) ?? new Set<string>();
    dates.add(String(row.submission_date));
    logged.set(id, dates);
  }
  return logged;
}
