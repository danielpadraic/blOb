import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { isClosedForLogs } from '@/lib/settlement';
import { supabase } from '@/lib/supabase';
import type { Challenge, ChallengeParticipant } from '@/lib/types';
import { utcDateStamp } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';

export type LoggableChallenge = Pick<
  Challenge,
  'id' | 'title' | 'is_official' | 'status' | 'starts_at' | 'ends_at' | 'is_unlimited'
>;

type ParticipationRow = Pick<
  ChallengeParticipant,
  'challenge_id' | 'status' | 'joined_at' | 'eliminated_at'
>;

const PARTICIPANT_SELECT = 'challenge_id, status, joined_at, eliminated_at';
const PARTICIPANT_SELECT_LEGACY = 'challenge_id, status, joined_at';

const CHALLENGE_SELECTS = [
  'id, title, is_official, status, starts_at, ends_at, is_unlimited',
  'id, title, is_official, status, starts_at, ends_at',
] as const;

export function useLoggableChallenge() {
  const { user } = useAuth();
  const date = utcDateStamp();

  return useQuery({
    queryKey: ['loggable-challenge', user?.id, date],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<LoggableChallenge | null> => {
      if (!user) {
        return null;
      }
      const participations = await fetchActiveParticipations(user.id);
      if (participations.length === 0) {
        return null;
      }
      const challengeIds = participations.map((row) => row.challenge_id);
      const [challenges, loggedIds] = await Promise.all([
        fetchChallenges(challengeIds),
        fetchLoggedChallengeIds(user.id, date, challengeIds),
      ]);
      const joinedAt = new Map(participations.map((row) => [row.challenge_id, row.joined_at]));
      const now = Date.now();

      const eligible = challenges
        .filter((challenge) => {
          if (loggedIds.has(challenge.id)) {
            return false;
          }
          if (new Date(challenge.starts_at).getTime() > now) {
            return false;
          }
          return !isClosedForLogs(challenge);
        })
        .sort((a, b) => {
          if (a.is_official !== b.is_official) {
            return a.is_official ? -1 : 1;
          }
          const aJoined = joinedAt.get(a.id) ?? '';
          const bJoined = joinedAt.get(b.id) ?? '';
          return new Date(bJoined).getTime() - new Date(aJoined).getTime();
        });

      return eligible[0] ?? null;
    },
  });
}

async function fetchActiveParticipations(userId: string): Promise<ParticipationRow[]> {
  const primary = await supabase
    .from('challenge_participants')
    .select(PARTICIPANT_SELECT)
    .eq('user_id', userId);
  const result = primary.error
    ? await supabase
        .from('challenge_participants')
        .select(PARTICIPANT_SELECT_LEGACY)
        .eq('user_id', userId)
    : primary;
  if (result.error) {
    throw new Error(getErrorMessage(result.error));
  }
  return ((result.data ?? []) as ParticipationRow[])
    .map((row) => ({
      ...row,
      eliminated_at: row.eliminated_at ?? null,
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
    }));
  }
  return [];
}

async function fetchLoggedChallengeIds(
  userId: string,
  date: string,
  challengeIds: string[],
): Promise<Set<string>> {
  if (challengeIds.length === 0) {
    return new Set();
  }
  const { data, error } = await supabase
    .from('workout_submissions')
    .select('challenge_id')
    .eq('user_id', userId)
    .eq('submission_date', date)
    .in('challenge_id', challengeIds);
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return new Set((data ?? []).map((row) => row.challenge_id));
}
