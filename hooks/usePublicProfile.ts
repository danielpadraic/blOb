import { useQuery } from '@tanstack/react-query';

import { PUBLIC_PROFILE_COLUMNS, PUBLIC_PROFILE_COLUMNS_BASE } from '@/lib/constants';
import { asWalletCurrency } from '@/lib/currency';
import { officialFlags } from '@/lib/profileBadges';
import { asPublicProfile } from '@/lib/social';
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
  'id, title, is_official, created_by, buy_in_amount, status, prize_pool, currency, challenge_type, target_count, days_required, tasks, visibility, privacy_mode, starts_at, ends_at, profile_visibility';

const CHALLENGE_PREVIEW_COLUMNS_BASE =
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
    privacy_mode?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    profile_visibility?: string | null;
  };
  participation?: Pick<
    ChallengeParticipant,
    'status' | 'days_completed' | 'completed_at' | 'eliminated_at'
  > & {
    profile_visibility?: string | null;
  } | null;
  hosted?: boolean;
  competed?: boolean;
  placement?: number | null;
  coinsWon?: number;
  bucksWon?: number;
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
    selectChallengePreview().eq('created_by', profile.id),
    selectParticipationRows(profile.id),
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
    hosted: true,
    competed: false,
  }));

  const participationList = (participationRows.data ?? []) as Array<{
    challenge_id: string;
    status: ChallengeParticipant['status'];
    days_completed: number | null;
    completed_at: string | null;
    eliminated_at: string | null;
    profile_visibility?: string | null;
  }>;

  const joinedIds = participationList.map((row) => row.challenge_id);
  let joinedChallenges: ProfileChallenge['challenge'][] = [];
  if (joinedIds.length > 0) {
    const joined = await selectChallengePreview().in('id', joinedIds);
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
        profile_visibility: row.profile_visibility ?? 'friends',
      },
      hosted: challenge.created_by === profile.id,
      competed: true,
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

  const payoutByChallenge = payoutsByChallenge(payouts.data ?? []);
  const ranks = await fetchSettledRanks(profile.id, [...hosted, ...participating]);
  const withMoney = (row: ProfileChallenge): ProfileChallenge => ({
    ...row,
    placement: ranks.get(row.challenge.id) ?? null,
    coinsWon: payoutByChallenge.get(row.challenge.id)?.coins ?? 0,
    bucksWon: payoutByChallenge.get(row.challenge.id)?.bucks ?? 0,
  });

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
    hosted: hosted.map(withMoney),
    participating: participating.map(withMoney),
  };
}

async function selectParticipationRows(userId: string) {
  const full = await supabase
    .from('challenge_participants')
    .select('challenge_id, status, days_completed, completed_at, eliminated_at, profile_visibility')
    .eq('user_id', userId);
  if (!full.error) {
    return full;
  }
  return supabase
    .from('challenge_participants')
    .select('challenge_id, status, days_completed, completed_at, eliminated_at')
    .eq('user_id', userId);
}

function selectChallengePreview() {
  return {
    eq: async (column: string, value: string) => {
      const full = await supabase.from('challenges').select(CHALLENGE_PREVIEW_COLUMNS).eq(column, value);
      if (!full.error) {
        return full;
      }
      return supabase.from('challenges').select(CHALLENGE_PREVIEW_COLUMNS_BASE).eq(column, value);
    },
    in: async (column: string, values: string[]) => {
      const full = await supabase.from('challenges').select(CHALLENGE_PREVIEW_COLUMNS).in(column, values);
      if (!full.error) {
        return full;
      }
      return supabase.from('challenges').select(CHALLENGE_PREVIEW_COLUMNS_BASE).in(column, values);
    },
  };
}

function payoutsByChallenge(rows: unknown[]): Map<string, { coins: number; bucks: number }> {
  const map = new Map<string, { coins: number; bucks: number }>();
  for (const raw of rows) {
    const row = raw as {
      amount?: number;
      challenge_id?: string;
      challenges?: { currency?: string | null } | { currency?: string | null }[] | null;
    };
    const id = String(row.challenge_id ?? '');
    if (!id) {
      continue;
    }
    const amount = Number(row.amount ?? 0);
    const related = Array.isArray(row.challenges) ? row.challenges[0] : row.challenges;
    const current = map.get(id) ?? { coins: 0, bucks: 0 };
    if (asWalletCurrency(related?.currency) === 'bucks') {
      current.bucks += amount;
    } else {
      current.coins += amount;
    }
    map.set(id, current);
  }
  return map;
}

async function fetchSettledRanks(userId: string, rows: ProfileChallenge[]): Promise<Map<string, number>> {
  const ranks = new Map<string, number>();
  const settled = rows.filter((row) => String(row.challenge.status) === 'settled');
  await Promise.all(
    settled.map(async (row) => {
      const result = await supabase.rpc('bob_participant_rank', {
        p_challenge_id: row.challenge.id,
        p_user_id: userId,
      });
      const rank = Number(result.data);
      if (Number.isFinite(rank) && rank > 0) {
        ranks.set(row.challenge.id, rank);
      }
    }),
  );
  return ranks;
}

function isMissingProfileColumn(error: { message?: string } | null): boolean {
  const text = String(error?.message ?? '').toLowerCase();
  return (
    (text.includes('is_creator') ||
      text.includes('allow_profile_posts') ||
      text.includes('profile_visibility') ||
      text.includes('cover_url')) &&
    (text.includes('does not exist') || text.includes('schema cache') || text.includes('42703') || text.includes('pgrst204'))
  );
}

async function selectPublicProfile(match: { column: 'id' | 'username'; value: string }) {
  const full = supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq(match.column, match.value).maybeSingle();
  const first = await full;
  if (!first.error) {
    return first;
  }
  if (!isMissingProfileColumn(first.error)) {
    return first;
  }
  return supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS_BASE).eq(match.column, match.value).maybeSingle();
}

async function fetchPublicProfile(handle: string): Promise<PublicProfile> {
  const decoded = decodeURIComponent(handle).trim();
  const byId = UUID_RE.test(decoded);
  const { data, error } = byId
    ? await selectPublicProfile({ column: 'id', value: decoded })
    : await selectPublicProfile({ column: 'username', value: decoded.toLowerCase() });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  if (!data) {
    throw new Error('That blob isn’t on the map.');
  }
  return redactPublicProfile(asPublicProfile(data as PublicProfile));
}

export async function fetchPublicProfileById(id: string): Promise<PublicProfile | null> {
  const { data, error } = await selectPublicProfile({ column: 'id', value: id });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return data ? redactPublicProfile(asPublicProfile(data as PublicProfile)) : null;
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
    is_official: Boolean(row.is_official),
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
    .select(PUBLIC_PROFILE_COLUMNS_BASE)
    .neq('id', userId)
    .order('created_at', { ascending: false })
    .limit(16);
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return ((data ?? []) as PublicProfile[])
    .filter((row) => !exclude.has(row.id))
    .map(redactPublicProfile)
    .slice(0, 12);
}
