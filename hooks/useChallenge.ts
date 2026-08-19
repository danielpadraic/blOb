import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reportBadgeActivity } from '@/lib/badgeActivity';
import { discardChallengeDraft } from '@/lib/challengeDraft';
import { applyLaneForPublish } from '@/lib/challengeLane';
import { ensureSchedule, publishEndMode } from '@/lib/challengeSchedule';
import { cancelChallenge } from '@/lib/api/challenges';
import {
  fetchChallengeById,
  fetchChallengeShareState,
  fetchActiveChallenges,
  fetchCompetingChallenges,
  fetchDiscoverChallenges,
  fetchFriendsDiscoverChallenges,
  fetchHostingChallenges,
  fetchJoinedLobbyChallenges,
  fetchLobbyChallenges,
  fetchLobbyFriendCounts,
  fetchOfficialDiscoverChallenges,
  insertUserChallenge,
  joinChallenge,
  withParticipantCounts,
  type FriendChallengeProof,
} from '@/lib/challenges';
import {
  firstProofMethod,
  namedProofsFromLegacyTypes,
  proofRequirementsFrom,
  proofTypeFromMethod,
} from '@/lib/challengeProofs';
import {
  fetchChallengeSettlement,
  markChallengeJudging,
  settleChallenge,
  syncChallengeStatuses,
} from '@/lib/settlement';
import {
  buildRulesStructured,
  composeChallengeRules,
  deriveFinishTarget,
  extraHasMinMinutes,
} from '@/lib/consistencyRules';
import { copy } from '@/lib/copy';
import { DEFAULT_MIN_MINUTES, OFFICIAL_CHALLENGE, OFFICIAL_CHALLENGE_TITLE } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import type {
  Challenge,
  ChallengeParticipant,
  ChallengeParticipantWithProfile,
  ChallengeSettlementView,
  ChallengeWithStats,
  Profile,
} from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { challengeCurrency, formatWallet, walletBalance } from '@/lib/currency';
import { useAuth } from '@/hooks/useAuth';
import { fetchCurrentUserProfile } from '@/hooks/useProfile';
import type { CreateChallengeValues } from '@/utils/validators';

async function prepareLobby(userId: string | undefined) {
  try {
    await ensureOfficialChallenge(userId);
  } catch (error) {
    console.log('[blob:lobby] ensure official skipped', error);
  }
  try {
    await syncChallengeStatuses();
  } catch (error) {
    console.log('[blob:lobby] status sync skipped', error);
  }
}

export function useDiscoverChallenges() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['lobby-discover', user?.id],
    queryFn: async (): Promise<ChallengeWithStats[]> => {
      await prepareLobby(user?.id);
      return withParticipantCounts(await fetchDiscoverChallenges(user?.id));
    },
  });
}

export function useHostingChallenges() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['lobby-hosting', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<ChallengeWithStats[]> => {
      await prepareLobby(user?.id);
      return withParticipantCounts(await fetchHostingChallenges(user!.id));
    },
  });
}

export function useCompetingChallenges() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['lobby-active', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<ChallengeWithStats[]> => {
      return withParticipantCounts(await fetchCompetingChallenges(user!.id));
    },
  });
}

export function useOfficialDiscoverChallenges() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['lobby-official', user?.id],
    queryFn: async (): Promise<ChallengeWithStats[]> => {
      await prepareLobby(user?.id);
      return withParticipantCounts(await fetchOfficialDiscoverChallenges(user?.id));
    },
  });
}

export function useFriendsDiscoverChallenges() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['lobby-friends', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Array<FriendChallengeProof & { challenge: ChallengeWithStats }>> => {
      const rows = await fetchFriendsDiscoverChallenges(user!.id);
      const withCounts = await withParticipantCounts(rows.map((row) => row.challenge));
      const byId = new Map(withCounts.map((row) => [row.id, row]));
      return rows
        .map((row) => {
          const challenge = byId.get(row.challenge.id);
          return challenge ? { ...row, challenge } : null;
        })
        .filter((row): row is FriendChallengeProof & { challenge: ChallengeWithStats } => Boolean(row));
    },
  });
}

export function useFeedActiveChallenges() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['feed-active-challenges', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<ChallengeWithStats[]> => {
      await prepareLobby(user?.id);
      return withParticipantCounts(await fetchActiveChallenges(user!.id));
    },
  });
}

export function useMyLobbyChallenges() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['lobby-joined', user?.id],
    queryFn: async (): Promise<ChallengeWithStats[]> => {
      if (!user?.id) {
        return [];
      }
      return withParticipantCounts(await fetchJoinedLobbyChallenges(user.id));
    },
  });
}

export function useChallenges() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['challenges', user?.id],
    queryFn: async (): Promise<ChallengeWithStats[]> => {
      await prepareLobby(user?.id);
      const rows = await fetchLobbyChallenges(user?.id);
      return withParticipantCounts(rows);
    },
  });
}

export function useLobbyFriendCounts(challengeIds: string[]) {
  const { user } = useAuth();
  const idsKey = challengeIds.slice().sort().join(',');

  return useQuery({
    queryKey: ['lobby-friend-counts', user?.id, idsKey],
    enabled: Boolean(user?.id) && challengeIds.length > 0,
    queryFn: async (): Promise<Map<string, number>> => {
      try {
        return await fetchLobbyFriendCounts(user!.id, challengeIds);
      } catch (error) {
        console.log('[blob:lobby] friend_count query skipped', error);
        return new Map();
      }
    },
    staleTime: 60_000,
  });
}

export function useChallengeShareState(id: string | null | undefined) {
  return useQuery({
    queryKey: ['challenge-share', id],
    enabled: Boolean(id),
    staleTime: 60_000,
    queryFn: () => fetchChallengeShareState(id!),
  });
}

export function useChallenge(id: string | undefined) {
  return useQuery({
    queryKey: ['challenge', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<ChallengeWithStats> => {
      console.log('[blob:detail] load', id);
      await syncChallengeStatuses();
      try {
        const challenge = await fetchChallengeById(id!);
        return {
          ...challenge,
          participant_count: 0,
        };
      } catch (error) {
        const reason = await supabase.rpc('challenge_access_reason', { p_challenge_id: id! });
        if (reason.data === 'geo') {
          throw new Error(copy('geo.unavailable'));
        }
        throw error;
      }
    },
  });
}

const PARTICIPANT_COLUMNS =
  'id, challenge_id, user_id, status, days_completed, joined_at, completed_at, eliminated_at';
const PARTICIPANT_COLUMNS_LEGACY =
  'id, challenge_id, user_id, status, days_completed, joined_at, completed_at';

export function useChallengeParticipants(challengeId: string | undefined) {
  return useQuery({
    queryKey: ['challenge-participants', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async (): Promise<ChallengeParticipantWithProfile[]> => {
      const { data, error } = await supabase
        .from('challenge_participants')
        .select(PARTICIPANT_COLUMNS)
        .eq('challenge_id', challengeId!)
        .order('joined_at', { ascending: true });
      if (error) {
        const fallback = await supabase
          .from('challenge_participants')
          .select(PARTICIPANT_COLUMNS_LEGACY)
          .eq('challenge_id', challengeId!)
          .order('joined_at', { ascending: true });
        if (fallback.error) {
          throw new Error(getErrorMessage(error));
        }
        return (fallback.data ?? []).map((row) => ({
          ...(row as ChallengeParticipant),
          eliminated_at: null,
        })) as ChallengeParticipantWithProfile[];
      }
      return (data ?? []) as unknown as ChallengeParticipantWithProfile[];
    },
  });
}

export function useMyParticipation(challengeId: string | undefined) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['my-participation', challengeId, user?.id],
    enabled: Boolean(challengeId && user?.id),
    queryFn: async (): Promise<ChallengeParticipant | null> => {
      const { data, error } = await supabase
        .from('challenge_participants')
        .select(PARTICIPANT_COLUMNS)
        .eq('challenge_id', challengeId!)
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) {
        const fallback = await supabase
          .from('challenge_participants')
          .select(PARTICIPANT_COLUMNS_LEGACY)
          .eq('challenge_id', challengeId!)
          .eq('user_id', user!.id)
          .maybeSingle();
        if (fallback.error) {
          throw new Error(getErrorMessage(error));
        }
        if (!fallback.data) {
          return null;
        }
        return {
          ...(fallback.data as ChallengeParticipant),
          days_completed: Number((fallback.data as ChallengeParticipant).days_completed ?? 0),
          eliminated_at: null,
        };
      }
      if (!data) {
        return null;
      }
      return {
        ...(data as ChallengeParticipant),
        days_completed: Number((data as ChallengeParticipant).days_completed ?? 0),
        eliminated_at: (data as ChallengeParticipant).eliminated_at ?? null,
      };
    },
  });
  return { ...query, participation: query.data ?? null };
}

export function useMyChallengeProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-challenge-progress', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<
      Pick<ChallengeParticipant, 'challenge_id' | 'days_completed' | 'status'>[]
    > => {
      const { data, error } = await supabase
        .from('challenge_participants')
        .select('challenge_id, days_completed, status')
        .eq('user_id', user!.id);
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      return (data ?? []) as Pick<
        ChallengeParticipant,
        'challenge_id' | 'days_completed' | 'status'
      >[];
    },
  });
}

type JoinContext = {
  previousChallenge: ChallengeWithStats | undefined;
  previousParticipants: ChallengeParticipantWithProfile[] | undefined;
  previousParticipation: ChallengeParticipant | null | undefined;
  previousList: ChallengeWithStats[] | undefined;
  previousProfile: Profile | null | undefined;
};

export function useJoinChallenge() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (challengeId: string) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      return joinChallenge(challengeId);
    },
    onMutate: async (challengeId): Promise<JoinContext> => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['challenge', challengeId] }),
        queryClient.cancelQueries({ queryKey: ['challenge-participants', challengeId] }),
        queryClient.cancelQueries({ queryKey: ['my-participation', challengeId] }),
        queryClient.cancelQueries({ queryKey: ['challenges'] }),
        queryClient.cancelQueries({ queryKey: ['profile', user?.id] }),
      ]);

      const previousChallenge = queryClient.getQueryData<ChallengeWithStats>([
        'challenge',
        challengeId,
      ]);
      const previousParticipants = queryClient.getQueryData<
        ChallengeParticipantWithProfile[]
      >(['challenge-participants', challengeId]);
      const previousParticipation = queryClient.getQueryData<ChallengeParticipant | null>([
        'my-participation',
        challengeId,
        user?.id,
      ]);
      const previousList = queryClient.getQueryData<ChallengeWithStats[]>([
        'challenges',
        user?.id,
      ]);
      const previousProfile = queryClient.getQueryData<Profile | null>([
        'profile',
        user?.id,
        'self',
      ]);

      const buyIn = Math.max(Number(previousChallenge?.buy_in_amount ?? 0), 0);

      if (previousChallenge) {
        queryClient.setQueryData<ChallengeWithStats>(['challenge', challengeId], {
          ...previousChallenge,
          prize_pool: Number(previousChallenge.prize_pool) + buyIn,
          participant_count: Number(previousChallenge.participant_count ?? 0) + 1,
          eligible_count: Number(previousChallenge.eligible_count ?? previousChallenge.participant_count ?? 0) + 1,
        });
      }

      if (user) {
        const alreadyIn = (previousParticipants ?? []).some(
          (row) => row.user_id === user.id,
        );
        const optimisticRow: ChallengeParticipantWithProfile = {
          id: `optimistic-${user.id}`,
          challenge_id: challengeId,
          user_id: user.id,
          status: 'joined',
          days_completed: 0,
          joined_at: new Date().toISOString(),
          completed_at: null,
          eliminated_at: null,
        };
        if (!alreadyIn) {
          queryClient.setQueryData<ChallengeParticipantWithProfile[]>(
            ['challenge-participants', challengeId],
            [...(previousParticipants ?? []), optimisticRow],
          );
        }
        if (!previousParticipation) {
          queryClient.setQueryData<ChallengeParticipant>(
            ['my-participation', challengeId, user.id],
            optimisticRow,
          );
        }
      }

      if (previousList) {
        queryClient.setQueryData<ChallengeWithStats[]>(
          ['challenges', user?.id],
          previousList.map((item) =>
            item.id === challengeId
              ? {
                  ...item,
                  prize_pool:
                    Number(item.prize_pool) + Math.max(Number(item.buy_in_amount) || 0, 0),
                  participant_count: Number(item.participant_count ?? 0) + 1,
                }
              : item,
          ),
        );
      }

      if (previousProfile && user && buyIn > 0) {
        const currency = challengeCurrency(previousChallenge);
        const nextCoins = Number(previousProfile.coins ?? previousProfile.credits ?? 0);
        const nextBucks = Number(previousProfile.bucks ?? 0);
        queryClient.setQueryData(['profile', user.id, 'self'], {
          ...previousProfile,
          coins: currency === 'bucks' ? nextCoins : nextCoins - buyIn,
          bucks: currency === 'bucks' ? nextBucks - buyIn : nextBucks,
          credits: currency === 'bucks' ? nextCoins : nextCoins - buyIn,
        });
      }

      return {
        previousChallenge,
        previousParticipants,
        previousParticipation,
        previousList,
        previousProfile,
      };
    },
    onError: (_error, challengeId, context) => {
      if (!context) {
        return;
      }
      queryClient.setQueryData(['challenge', challengeId], context.previousChallenge);
      queryClient.setQueryData(
        ['challenge-participants', challengeId],
        context.previousParticipants,
      );
      queryClient.setQueryData(
        ['my-participation', challengeId, user?.id],
        context.previousParticipation,
      );
      queryClient.setQueryData(['challenges', user?.id], context.previousList);
      if (user) {
        queryClient.setQueryData(['profile', user.id, 'self'], context.previousProfile);
      }
    },
    onSettled: (_data, _error, challengeId) => {
      void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      void queryClient.invalidateQueries({
        queryKey: ['challenge-participants', challengeId],
      });
      void queryClient.invalidateQueries({ queryKey: ['my-participation', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-discover'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-joined'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-hosting'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-active'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-official'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-friends'] });
      void queryClient.invalidateQueries({ queryKey: ['feed-active-challenges'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: ['my-challenge-progress'] });
      void reportBadgeActivity();
    },
  });
}

async function ensureOfficialChallenge(userId: string | undefined) {
  if (!userId) {
    return;
  }

  const { data, error } = await supabase
    .from('challenges')
    .select('id, title, is_official')
    .eq('title', OFFICIAL_CHALLENGE_TITLE)
    .limit(1);
  if (error) {
    console.log('[blob:lobby] official lookup failed', error.message);
    return;
  }
  if ((data ?? []).length > 0) {
    return;
  }

  const starts = new Date();
  const ends = new Date(starts.getTime() + OFFICIAL_CHALLENGE.windowDays * 24 * 60 * 60 * 1000);
  const { error: insertError } = await supabase.from('challenges').insert({
    title: OFFICIAL_CHALLENGE.title,
    description: OFFICIAL_CHALLENGE.description,
    rules: OFFICIAL_CHALLENGE.rules,
    is_official: true,
    created_by: userId,
    buy_in_amount: OFFICIAL_CHALLENGE.buyIn,
    days_required: OFFICIAL_CHALLENGE.daysRequired,
    min_minutes: OFFICIAL_CHALLENGE.minMinutes,
    status: 'open',
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    category: 'fitness',
    challenge_type: 'consistency',
    visibility: 'public',
    proof_requirements: [
      { type: 'pre_selfie', required: true },
      { type: 'post_selfie', required: true },
      { type: 'hr_monitor', required: true },
    ],
    frequency: 'daily',
    target_count: OFFICIAL_CHALLENGE.daysRequired,
    tasks: [],
    prize_structure: 'equal_split',
    top_places_mode: null,
    top_places_value: null,
    top_places_distribution: null,
    funding_model: 'participants',
    creator_contribution: 0,
    max_participants: null,
    currency: 'coins',
  });
  if (insertError) {
    console.log('[blob:lobby] official seed insert failed', insertError.message);
  }
}

export function useCreateChallenge() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (
      values: CreateChallengeValues & { draft_id?: string | null },
    ): Promise<Challenge> => {
      if (!user) {
        throw new Error('You need to be signed in to create a challenge.');
      }

      const unlimited = values.duration_type === 'unlimited';
      const schedule = ensureSchedule(values);
      const isPoints = !unlimited && values.challenge_type === 'points';
      const targetCount = deriveFinishTarget(values);
      const rulesText = composeChallengeRules(values);
      const rulesStructured = buildRulesStructured(values);
      const tasks = isPoints
        ? values.tasks.map((task) => {
            const proofs = task.proofs?.length ? task.proofs : task.proof_required ? ['photo'] : [];
            return {
              id: task.id,
              title: task.title.trim(),
              points: Number(task.points),
              proof_required: proofs.length > 0,
              proof_types: proofs.length > 0 ? proofs : undefined,
            };
          })
        : [];
      const contribution =
        values.funding_model === 'participants'
          ? 0
          : Math.max(Number(values.creator_contribution) || 0, 0);
      const maxParticipants =
        values.participant_cap === 'limited' ? Number(values.max_participants) : null;

      const minMinutes = extraHasMinMinutes(values)
        ? 30
        : Math.max(Number(values.min_minutes) || (values.category === 'fitness' ? DEFAULT_MIN_MINUTES : 1), 1);
      const cover = values.cover_image_url?.trim() || null;
      const video = values.rules_video_url?.trim() || null;

      const profile = await fetchCurrentUserProfile(user.id);
      if (!profile) {
        throw new Error('Finish setting up your profile before you publish.');
      }
      const lane = applyLaneForPublish({
        challenge_lane: values.challenge_lane,
        visibility: values.visibility,
        currency: values.currency,
        buy_in_amount: values.buy_in,
        host_funded: values.host_funded === true || values.currency === 'bucks',
      });
      const currentWallet = walletBalance(profile, lane.currency);
      const creatorBuyIn =
        values.creator_participating === true ? Math.max(Number(lane.buy_in_amount) || 0, 0) : 0;
      const needed = contribution + creatorBuyIn;
      if (needed > 0 && currentWallet < needed) {
        throw new Error(
          `You need ${formatWallet(needed, lane.currency)} to fund this pool. You have ${formatWallet(currentWallet, lane.currency)}.`,
        );
      }

      const namedProofs =
        values.challenge_proofs && values.challenge_proofs.length > 0
          ? values.challenge_proofs
          : namedProofsFromLegacyTypes(values.proofs);

      return insertUserChallenge({
        title: values.title.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
        rules: rulesText || null,
        created_by: user.id,
        buy_in_amount: lane.buy_in_amount,
        days_required: targetCount,
        min_minutes: minMinutes,
        proof_requirements: isPoints
          ? []
          : namedProofs.length > 0
            ? proofRequirementsFrom(namedProofs)
            : values.proofs.map((type) => ({ type, required: true })),
        proofs: isPoints ? [] : namedProofs,
        target_count: targetCount,
        frequency: isPoints ? 'once' : values.frequency,
        tasks,
        starts_at: schedule.starts_at,
        ends_at: unlimited ? null : schedule.ends_at,
        end_mode: unlimited ? 'indefinite_lms' : publishEndMode(schedule.end_mode),
        length_value: unlimited ? null : Number(schedule.duration_value) || Number(schedule.duration_days),
        length_unit: unlimited ? null : schedule.duration_unit,
        category: values.category,
        challenge_type: unlimited ? 'consistency' : values.challenge_type,
        visibility: lane.visibility,
        prize_structure: unlimited ? 'winner_take_all' : values.prize_structure,
        top_places_mode:
          values.prize_structure === 'top_places' ? values.top_places_mode : null,
        top_places_value:
          values.prize_structure === 'top_places' ? Number(values.top_places_value) : null,
        top_places_distribution:
          values.prize_structure === 'top_places' ? values.top_places_distribution : null,
        funding_model: values.funding_model,
        creator_contribution: contribution,
        max_participants: maxParticipants,
        is_unlimited: unlimited,
        prize_pool: contribution,
        currency: lane.currency,
        challenge_lane: lane.challenge_lane,
        creator_participating: values.creator_participating === true,
        cover_image_url: cover,
        rules_video_url: video,
        rules_list: rulesStructured,
        draft_id: values.draft_id ?? null,
        min_participants: Math.max(Number(values.min_participants) || 2, 2),
        host_funded: values.host_funded === true || lane.currency === 'bucks',
        host_budget: contribution,
        format: unlimited ? 'lms' : values.format ?? values.challenge_type,
        task: values.task?.trim() || values.rule_activity.trim() || null,
        required_checkins: Number(values.required_checkins) || targetCount,
        misses_allowed: Math.max(Number(values.misses_allowed) || 0, 0),
        proof_type:
          values.proof_type ??
          proofTypeFromMethod(firstProofMethod(namedProofs)),
        proof_review: values.proof_review ?? 'auto',
        payout_mode:
          values.payout_mode ??
          (values.prize_structure === 'winner_take_all'
            ? 'winner_take_all'
            : values.prize_structure === 'top_places'
              ? 'top_places'
              : 'even_split_remaining'),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        start_rule: 'at_starts_at',
        discoverability: values.discoverability ?? null,
      });
    },
    onSuccess: (challenge, values) => {
      const joined = values.creator_participating === true;
      queryClient.setQueryData<ChallengeWithStats>(['challenge', challenge.id], {
        ...challenge,
        participant_count: joined ? 1 : 0,
      });
      if (user) {
        queryClient.setQueryData(['challenge-draft', user.id], null);
        queryClient.setQueryData(['challenge-drafts', user.id], []);
        void discardChallengeDraft(user.id, values.draft_id);
      }
      void queryClient.invalidateQueries({ queryKey: ['challenge', challenge.id] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-participants', challenge.id] });
      void queryClient.invalidateQueries({ queryKey: ['my-participation', challenge.id] });
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-discover'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-joined'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-hosting'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-active'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-official'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-friends'] });
      void queryClient.invalidateQueries({ queryKey: ['feed-active-challenges'] });
      void queryClient.refetchQueries({ queryKey: ['lobby-discover'] });
      void queryClient.refetchQueries({ queryKey: ['lobby-joined'] });
      void queryClient.invalidateQueries({ queryKey: ['reusable-challenges'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void reportBadgeActivity();
    },
  });
}

export function useChallengeSettlement(challengeId: string | undefined) {
  return useQuery({
    queryKey: ['challenge-settlement', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async (): Promise<ChallengeSettlementView | null> => {
      return fetchChallengeSettlement(challengeId!);
    },
  });
}

export function useMarkChallengeJudging() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (challengeId: string) => markChallengeJudging(challengeId),
    onSuccess: (result, challengeId) => {
      queryClient.setQueryData<ChallengeWithStats>(['challenge', challengeId], (current) =>
        current
          ? {
              ...current,
              status: 'judging',
              judging_started_at:
                result.judging_started_at ??
                current.judging_started_at ??
                current.ends_at ??
                new Date().toISOString(),
            }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-discover'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-joined'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-hosting'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-active'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-official'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-friends'] });
      void queryClient.invalidateQueries({ queryKey: ['feed-active-challenges'] });
      void queryClient.invalidateQueries({ queryKey: ['my-challenge-progress'] });
    },
  });
}

export function useCancelChallenge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (challengeId: string) => cancelChallenge(challengeId),
    onSuccess: (_result, challengeId) => {
      queryClient.setQueryData<ChallengeWithStats>(['challenge', challengeId], (current) =>
        current
          ? {
              ...current,
              status: 'cancelled',
              cancelled_at: new Date().toISOString(),
            }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-discover'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-joined'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-hosting'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-active'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-official'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-friends'] });
      void queryClient.invalidateQueries({ queryKey: ['feed-active-challenges'] });
      void queryClient.invalidateQueries({ queryKey: ['my-challenge-progress'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useSettleChallenge() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (challengeId: string) => settleChallenge(challengeId),
    onSuccess: (result, challengeId) => {
      queryClient.setQueryData(['challenge-settlement', challengeId], result);
      queryClient.setQueryData<ChallengeWithStats>(['challenge', challengeId], (current) =>
        current
          ? {
              ...current,
              status: 'settled',
              prize_pool: 0,
              distributed_at: result.settlement.settled_at ?? current.distributed_at,
            }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-participants', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['my-participation', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-discover'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-joined'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-hosting'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-active'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-official'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-friends'] });
      void queryClient.invalidateQueries({ queryKey: ['feed-active-challenges'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: ['my-challenge-progress'] });
      if (user) {
        void queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
      }
      void reportBadgeActivity();
    },
  });
}
