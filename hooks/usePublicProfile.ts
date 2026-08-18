import { useQuery } from '@tanstack/react-query';

import { PUBLIC_PROFILE_COLUMNS } from '@/lib/constants';
import { asWalletCurrency } from '@/lib/currency';
import { officialFlags } from '@/lib/profileBadges';
import { supabase } from '@/lib/supabase';
import type {
  Challenge,
  ChallengeParticipant,
  PublicProfile,
} from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { useAuth } from '@/hooks/useAuth';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CHALLENGE_PREVIEW_COLUMNS =
  'id, title, is_official, created_by, buy_in_amount, status, prize_pool, currency, challenge_type, target_count, days_required, tasks, visibility';

export type ProfileChallenge = {
  challenge: Pick<
    Challenge,
    | 'id'
    | 'title'
    | 'is_official'
    | 'created_by'
    | 'buy_in_amount'
    | 'status'
    | 'prize_pool'
    | 'currency'
    | 'challenge_type'
    | 'target_count'
    | 'days_required'
    | 'tasks'
    | 'visibility'
  > & {
    days_required?: number;
  };
  participation?: Pick<
    ChallengeParticipant,
    'status' | 'days_completed' | 'completed_at' | 'eliminated_at'
  > | null;
};

export type PublicProfileStats = {
  completedCount: number;
  hostedCount: number;
  coinsEarned: number;
  bucksEarned: number;
  calloutWins: number;
  officialJoined: boolean;
  officialCompleted: boolean;
  bestRun: number;
  accolades: string[];
};

export type PublicProfileBundle = {
  profile: PublicProfile;
  stats: PublicProfileStats;
  hosted: ProfileChallenge[];
  participating: ProfileChallenge[];
};

export function usePublicProfile(handle?: string) {
  return useQuery({
    queryKey: ['public-profile', handle],
    enabled: Boolean(handle),
    queryFn: () => fetchPublicProfileBundle(handle!),
  });
}

export function useRecommendedProfiles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['recommended-profiles', user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchRecommendedProfiles(user!.id),
  });
}

async function fetchPublicProfileBundle(handle: string): Promise<PublicProfileBundle> {
  const profile = await fetchPublicProfile(handle);
  const [hostedRows, participationRows, payouts, earnings] = await Promise.all([
    supabase.from('challenges').select(CHALLENGE_PREVIEW_COLUMNS).eq('created_by', profile.id),
    supabase
      .from('challenge_participants')
      .select('challenge_id, status, days_completed, completed_at, eliminated_at')
      .eq('user_id', profile.id),
    supabase
      .from('challenge_payouts')
      .select('amount, challenge_id, challenges(currency)')
      .eq('user_id', profile.id),
    supabase.rpc('lifetime_earnings', { p_user_id: profile.id }),
  ]);

  if (hostedRows.error) {
    console.log('[blob:profile] hosted challenges skipped', hostedRows.error.message);
  }
  if (participationRows.error) {
    console.log('[blob:profile] participation skipped', participationRows.error.message);
  }
  if (payouts.error) {
    console.log('[blob:profile] payouts skipped', payouts.error.message);
  }
  if (earnings.error) {
    console.log('[blob:profile] lifetime earnings rpc skipped', earnings.error.message);
  }

  const hosted = (hostedRows.data ?? []).map((row) => ({
    challenge: row as ProfileChallenge['challenge'],
    participation: null,
  }));

  const participationList = (participationRows.data ?? []) as Array<{
    challenge_id: string;
    status: ChallengeParticipant['status'];
    days_completed: number | null;
    completed_at: string | null;
    eliminated_at: string | null;
  }>;

  const joinedIds = participationList.map((row) => row.challenge_id);
  let joinedChallenges: ProfileChallenge['challenge'][] = [];
  if (joinedIds.length > 0) {
    const joined = await supabase
      .from('challenges')
      .select(CHALLENGE_PREVIEW_COLUMNS)
      .in('id', joinedIds);
    joinedChallenges = (joined.data ?? []) as ProfileChallenge['challenge'][];
  }
  const byId = new Map(joinedChallenges.map((row) => [row.id, row]));

  const participating: ProfileChallenge[] = [];
  for (const row of participationList) {
    const challenge = byId.get(row.challenge_id);
    if (!challenge) {
      continue;
    }
    participating.push({
      challenge,
      participation: {
        status: row.status,
        days_completed: Number(row.days_completed ?? 0),
        completed_at: row.completed_at,
        eliminated_at: row.eliminated_at,
      },
    });
  }

  const completedCount = participating.filter(
    (row) =>
      row.participation?.status === 'completed' || Boolean(row.participation?.completed_at),
  ).length;
  const payoutSplit = splitPayouts(payouts.data ?? []);
  const rpcRaw = earnings.data;
  const rpcRow = (Array.isArray(rpcRaw) ? rpcRaw[0] : rpcRaw) as
    | { coins?: number; bucks?: number; callout_wins?: number }
    | null
    | undefined;
  const coinsEarned = Number(rpcRow?.coins ?? payoutSplit.coins);
  const bucksEarned = Number(rpcRow?.bucks ?? payoutSplit.bucks);
  const calloutWins = Number(rpcRow?.callout_wins ?? 0);
  const bestRun = participating.reduce(
    (max, row) => Math.max(max, Number(row.participation?.days_completed ?? 0)),
    0,
  );
  const flags = officialFlags(participating);

  const accolades: string[] = [...(profile.skill_tags ?? [])];
  if (hosted.length > 0) {
    accolades.push('Host');
  }
  if (completedCount > 0) {
    accolades.push('Finisher');
  }
  if (coinsEarned > 0 || bucksEarned > 0) {
    accolades.push('Winner');
  }
  if (flags.officialCompleted || flags.officialJoined) {
    accolades.push('Official');
  }
  if (calloutWins > 0) {
    accolades.push('Call-out');
  }

  return {
    profile,
    stats: {
      completedCount,
      hostedCount: hosted.length,
      coinsEarned,
      bucksEarned,
      calloutWins,
      officialJoined: flags.officialJoined,
      officialCompleted: flags.officialCompleted,
      bestRun,
      accolades: [...new Set(accolades)],
    },
    hosted,
    participating,
  };
}

async function fetchPublicProfile(handle: string): Promise<PublicProfile> {
  const decoded = decodeURIComponent(handle).trim();
  const byId = UUID_RE.test(decoded);
  const query = supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS);
  const { data, error } = byId
    ? await query.eq('id', decoded).maybeSingle()
    : await query.eq('username', decoded.toLowerCase()).maybeSingle();
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  if (!data) {
    throw new Error('That blob isn’t on the map.');
  }
  return redactPublicProfile(data as PublicProfile);
}

export async function fetchPublicProfileById(id: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return data ? redactPublicProfile(data as PublicProfile) : null;
}

function splitPayouts(rows: unknown[]): { coins: number; bucks: number } {
  let coins = 0;
  let bucks = 0;
  for (const raw of rows) {
    const row = raw as {
      amount?: number;
      challenges?: { currency?: string | null } | { currency?: string | null }[] | null;
    };
    const amount = Number(row.amount ?? 0);
    const related = Array.isArray(row.challenges) ? row.challenges[0] : row.challenges;
    if (asWalletCurrency(related?.currency) === 'bucks') {
      bucks += amount;
    } else {
      coins += amount;
    }
  }
  return { coins, bucks };
}

function redactPublicProfile(row: PublicProfile): PublicProfile {
  return {
    ...row,
    skill_tags: row.skill_tags ?? [],
    show_fitness_stats_publicly: false,
    height_cm: null,
    current_weight: null,
    goal_weight: null,
    weight_unit: null,
    typical_weekly_workout_frequency: null,
    primary_activities: [],
  };
}

async function fetchRecommendedProfiles(userId: string): Promise<PublicProfile[]> {
  const { data: friendRows } = await supabase
    .from('friendships')
    .select('user_a_id, user_b_id')
    .eq('status', 'accepted')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);
  const exclude = new Set(
    (friendRows ?? []).map((row) => (row.user_a_id === userId ? row.user_b_id : row.user_a_id)),
  );
  exclude.add(userId);

  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_PROFILE_COLUMNS)
    .neq('id', userId)
    .order('created_at', { ascending: false })
    .limit(16);
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return ((data ?? []) as PublicProfile[])
    .filter((row) => !exclude.has(row.id))
    .map(redactPublicProfile)
    .slice(0, 4);
}
