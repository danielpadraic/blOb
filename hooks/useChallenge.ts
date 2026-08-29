import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reportBadgeActivity } from '@/lib/badgeActivity';
import { discardChallengeDraft } from '@/lib/challengeDraft';
import { announceCreatedChallenge } from '@/lib/challengeFeedPost';
import { notifyFriendsOfCreatedChallenge } from '@/lib/notifications';
import { applyLaneForPublish } from '@/lib/challengeLane';
import { parseComparablePointsConfig } from '@/lib/comparablePoints';
import { asPrivacyMode } from '@/lib/privacyMode';
import { durationDaysFromValues, ensureSchedule, publishEndMode } from '@/lib/challengeSchedule';
import { resolveChallengeTimezone } from '@/lib/challengeTimezone';
import {
  fetchChallengeShareState,
  fetchActiveChallenges,
  fetchCompetingChallenges,
  fetchDiscoverChallenges,
  fetchFriendsDiscoverChallenges,
  fetchEndedLobbyChallenges,
  fetchHostingChallenges,
  fetchJoinedLobbyChallenges,
  fetchLobbyChallenges,
  fetchLobbyFriendCounts,
  fetchOfficialDiscoverChallenges,
  insertUserChallenge,
  persistPrivacyMode,
  joinChallenge,
  applyChallengeStart,
  nudgeChallengeStart,
  publishScoringChange,
  fetchScoringAudit,
  updateUserChallenge,
  updateOfficialChallengeDetails,
  type OfficialChallengeDetailsPayload,
  withParticipantCounts,
  type FriendChallengeProof,
} from '@/lib/challenges';
import {
  firstProofMethod,
  proofRequirementsFrom,
  proofsForStorage,
  proofTypeFromMethod,
} from '@/lib/challengeProofs';
import { persistChallengePlaces, proofsReadyToPublish } from '@/lib/locationPlaces';
import {
  minMinutesForPublish,
  namedProofsForPublish,
  persistTasksForPublish,
} from '@/lib/challengeCreatePublish';
import {
  fetchChallengeSettlement,
  markChallengeJudging,
  settleChallenge,
  syncChallengeStatuses,
} from '@/lib/settlement';
import {
  buildRulesStructured,
  checkinTargetForStore,
  composeChallengeRules,
} from '@/lib/consistencyRules';
import {
  challengeFromFeedPreview,
  challengeSnapshotHasIdentity,
  loadChallengeDetail,
  peekLastGoodChallenge,
  rememberLastGoodChallenge,
} from '@/lib/challengeOpen';
import { isChallengeLoadError } from '@/lib/challengeLoad';
import { queryClient as appQueryClient } from '@/lib/queryClient';
import { fetchChallengePreviewsByIds, type FeedChallengePreview } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type {
  Challenge,
  ChallengeParticipant,
  ChallengeParticipantWithProfile,
  ChallengeSettlementView,
  ChallengeWithStats,
  Profile,
} from '@/lib/types';
import { leaveChallenge, topUpChallengePrize } from '@/lib/api/challenges';
import { cancelProviderRef, getPaymentsProvider } from '@/services/payments';
import { getErrorMessage } from '@/utils/errors';
import { challengeCurrency, formatCash, formatWallet, walletBalance } from '@/lib/currency';
import { durationIntegerForPublish, publishPayoutFields } from '@/lib/formatPayout';
import { useAuth } from '@/hooks/useAuth';
import { fetchCurrentUserProfile } from '@/hooks/useProfile';
import type { CreateChallengeValues } from '@/utils/validators';

let lobbyBootstrap: Promise<void> | null = null;
let lobbyBootstrapAt = 0;
const LOBBY_BOOTSTRAP_MS = 30_000;

async function prepareLobby(_userId?: string) {
  const now = Date.now();
  if (lobbyBootstrap && now - lobbyBootstrapAt < LOBBY_BOOTSTRAP_MS) {
    return lobbyBootstrap;
  }
  lobbyBootstrapAt = now;
  lobbyBootstrap = (async () => {
    try {
      await supabase.rpc('tick_official_series');
    } catch (error) {
      console.log('[blob:lobby] official series tick skipped', error);
    }
    try {
      await syncChallengeStatuses();
    } catch (error) {
      console.log('[blob:lobby] status sync skipped', error);
    }
  })();
  return lobbyBootstrap;
}

type LobbyQueryOptions = { enabled?: boolean };

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

export function useHostingChallenges(options?: LobbyQueryOptions) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['lobby-hosting', user?.id],
    enabled: Boolean(user?.id) && options?.enabled !== false,
    queryFn: async (): Promise<ChallengeWithStats[]> => {
      return withParticipantCounts(await fetchHostingChallenges(user!.id));
    },
  });
}

export function useCompetingChallenges(options?: LobbyQueryOptions) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['lobby-active', user?.id],
    enabled: Boolean(user?.id) && options?.enabled !== false,
    queryFn: async (): Promise<ChallengeWithStats[]> => {
      return withParticipantCounts(await fetchCompetingChallenges(user!.id));
    },
  });
}

export function useEndedChallenges(options?: LobbyQueryOptions) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['lobby-ended', user?.id],
    enabled: Boolean(user?.id) && options?.enabled !== false,
    queryFn: async (): Promise<ChallengeWithStats[]> => {
      return withParticipantCounts(await fetchEndedLobbyChallenges(user!.id));
    },
  });
}

export function useOfficialDiscoverChallenges(options?: LobbyQueryOptions) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['lobby-official', user?.id],
    enabled: options?.enabled !== false,
    queryFn: async (): Promise<ChallengeWithStats[]> => {
      await prepareLobby(user?.id);
      return withParticipantCounts(await fetchOfficialDiscoverChallenges(user?.id));
    },
  });
}

export function useFriendsDiscoverChallenges(options?: LobbyQueryOptions) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['lobby-friends', user?.id],
    enabled: Boolean(user?.id) && options?.enabled !== false,
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

export function useChallengeFeedPreview(id: string | null | undefined) {
  return useQuery({
    queryKey: ['challenge-preview', id],
    enabled: Boolean(id),
    staleTime: 60_000,
    queryFn: async () => {
      const rows = await fetchChallengePreviewsByIds([id!]);
      const row = rows[0] ?? null;
      return row?.id === id ? row : null;
    },
  });
}

export function useChallenge(id: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['challenge', id],
    enabled: Boolean(id),
    retry: (count, error) => {
      if (isChallengeLoadError(error) && error.kind !== 'server') {
        return false;
      }
      return count < 1;
    },
    placeholderData: (previous) => {
      if (!id) {
        return undefined;
      }
      if (previous?.id === id && challengeSnapshotHasIdentity(previous)) {
        return previous;
      }
      const last = peekLastGoodChallenge(id);
      if (last) {
        return last;
      }
      const preview = queryClient.getQueryData<FeedChallengePreview>(['challenge-preview', id]);
      if (preview?.id === id && challengeSnapshotHasIdentity(preview)) {
        return challengeFromFeedPreview(preview);
      }
      return undefined;
    },
    queryFn: async (): Promise<ChallengeWithStats> => {
      console.log('[blob:detail] load', id);
      try {
        await syncChallengeStatuses();
      } catch (error) {
        console.log('[blob:detail] status sync skipped', error);
      }
      const snapshot = appQueryClient.getQueryData<ChallengeWithStats>(['challenge', id]);
      const usable = snapshot?.id === id && challengeSnapshotHasIdentity(snapshot) ? snapshot : undefined;
      const row = await loadChallengeDetail(id!, usable);
      if (row.id === id && challengeSnapshotHasIdentity(row)) {
        rememberLastGoodChallenge(row);
      }
      return row;
    },
  });
  return query;
}

const PARTICIPANT_COLUMNS =
  'id, challenge_id, user_id, status, days_completed, points, joined_at, completed_at, eliminated_at, distance_meters_total';
const PARTICIPANT_COLUMNS_NO_POINTS =
  'id, challenge_id, user_id, status, days_completed, joined_at, completed_at, eliminated_at';
const PARTICIPANT_COLUMNS_LEGACY =
  'id, challenge_id, user_id, status, days_completed, joined_at, completed_at';

function asParticipant(row: ChallengeParticipant, extras?: Partial<ChallengeParticipant>): ChallengeParticipant {
  return {
    ...row,
    days_completed: Number(row.days_completed ?? 0),
    points: Number(row.points ?? extras?.points ?? 0),
    eliminated_at: row.eliminated_at ?? extras?.eliminated_at ?? null,
    distance_meters_total:
      row.distance_meters_total == null && extras?.distance_meters_total == null
        ? null
        : Number(row.distance_meters_total ?? extras?.distance_meters_total ?? 0),
  };
}

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
      if (!error) {
        return (data ?? []).map((row) => asParticipant(row as ChallengeParticipant));
      }
      const withoutPoints = await supabase
        .from('challenge_participants')
        .select(PARTICIPANT_COLUMNS_NO_POINTS)
        .eq('challenge_id', challengeId!)
        .order('joined_at', { ascending: true });
      if (!withoutPoints.error) {
        return (withoutPoints.data ?? []).map((row) =>
          asParticipant(row as ChallengeParticipant, { points: 0 }),
        );
      }
      const fallback = await supabase
        .from('challenge_participants')
        .select(PARTICIPANT_COLUMNS_LEGACY)
        .eq('challenge_id', challengeId!)
        .order('joined_at', { ascending: true });
      if (fallback.error) {
        throw new Error(getErrorMessage(error));
      }
      return (fallback.data ?? []).map((row) =>
        asParticipant(row as ChallengeParticipant, { points: 0, eliminated_at: null }),
      );
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
      if (!error) {
        return data ? asParticipant(data as ChallengeParticipant) : null;
      }
      const withoutPoints = await supabase
        .from('challenge_participants')
        .select(PARTICIPANT_COLUMNS_NO_POINTS)
        .eq('challenge_id', challengeId!)
        .eq('user_id', user!.id)
        .maybeSingle();
      if (!withoutPoints.error) {
        return withoutPoints.data
          ? asParticipant(withoutPoints.data as ChallengeParticipant, { points: 0 })
          : null;
      }
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
      return asParticipant(fallback.data as ChallengeParticipant, { points: 0, eliminated_at: null });
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
      Pick<
        ChallengeParticipant,
        'challenge_id' | 'days_completed' | 'status' | 'eliminated_at' | 'place' | 'result'
      >[]
    > => {
      const { data, error } = await supabase
        .from('challenge_participants')
        .select('challenge_id, days_completed, status, eliminated_at, place, result')
        .eq('user_id', user!.id);
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      return (data ?? []) as Pick<
        ChallengeParticipant,
        'challenge_id' | 'days_completed' | 'status' | 'eliminated_at' | 'place' | 'result'
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
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void reportBadgeActivity();
    },
  });
}

export function useLeaveChallenge() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (challengeId: string) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      return leaveChallenge(challengeId);
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
          prize_pool: Math.max(Number(previousChallenge.prize_pool) - buyIn, 0),
          participant_count: Math.max(Number(previousChallenge.participant_count ?? 0) - 1, 0),
          eligible_count: Math.max(
            Number(previousChallenge.eligible_count ?? previousChallenge.participant_count ?? 0) - 1,
            0,
          ),
        });
      }

      if (user) {
        queryClient.setQueryData<ChallengeParticipantWithProfile[]>(
          ['challenge-participants', challengeId],
          (previousParticipants ?? []).filter((row) => row.user_id !== user.id),
        );
        queryClient.setQueryData(['my-participation', challengeId, user.id], null);
      }

      if (previousList) {
        queryClient.setQueryData<ChallengeWithStats[]>(
          ['challenges', user?.id],
          previousList.map((item) =>
            item.id === challengeId
              ? {
                  ...item,
                  prize_pool: Math.max(
                    Number(item.prize_pool) - Math.max(Number(item.buy_in_amount) || 0, 0),
                    0,
                  ),
                  participant_count: Math.max(Number(item.participant_count ?? 0) - 1, 0),
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
          coins: currency === 'bucks' ? nextCoins : nextCoins + buyIn,
          bucks: currency === 'bucks' ? nextBucks + buyIn : nextBucks,
          credits: currency === 'bucks' ? nextCoins : nextCoins + buyIn,
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
      void queryClient.invalidateQueries({ queryKey: ['challenge-checkin'] });
      void queryClient.invalidateQueries({ queryKey: ['submitted-checkins', challengeId] });
      void reportBadgeActivity();
    },
  });
}

export function useTopUpChallengePrize() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { challengeId: string; amount: number }) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      return topUpChallengePrize(input.challengeId, input.amount);
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ['challenge', input.challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: ['wallet-ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
    },
  });
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
      const durationDays = unlimited ? null : durationDaysFromValues(schedule);
      const durationInt = unlimited ? null : durationIntegerForPublish(durationDays);
      const targetCount = isPoints ? checkinTargetForStore(values, durationDays) : durationInt ?? 1;
      const payout = unlimited
        ? {
            prize_structure: 'winner_take_all' as const,
            payout_mode: 'winner_take_all' as const,
            top_places_mode: null as const,
            top_places_value: null as const,
            top_places_distribution: null as const,
          }
        : publishPayoutFields(values);
      const rulesText = composeChallengeRules(values);
      const rulesStructured = buildRulesStructured(values);
      const tasks = persistTasksForPublish(values, isPoints);
      const contribution =
        values.funding_model === 'participants'
          ? 0
          : Math.max(Number(values.creator_contribution) || 0, 0);
      const maxParticipants =
        values.participant_cap === 'limited' ? Number(values.max_participants) : null;

      const minMinutes = minMinutesForPublish(values);
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
        if (lane.currency === 'bucks') {
          throw new Error(`Add ${formatCash(needed - currentWallet)}`);
        }
        throw new Error(
          `You need ${formatWallet(needed, lane.currency)} to fund this prize. You have ${formatWallet(currentWallet, lane.currency)}.`,
        );
      }

      const namedProofs = namedProofsForPublish(values);
      const placeError = proofsReadyToPublish(namedProofs);
      if (placeError) {
        throw new Error(placeError);
      }

      const challenge = await insertUserChallenge({
        title: values.title.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
        rules: rulesText || null,
        created_by: user.id,
        buy_in_amount: lane.currency === 'bucks' ? 0 : lane.buy_in_amount,
        days_required: durationInt ?? targetCount,
        min_minutes: minMinutes,
        proof_requirements: isPoints
          ? []
          : namedProofs.length > 0
            ? proofRequirementsFrom(namedProofs)
            : values.proof_type === 'honor' || values.proofs.every((type) => type === 'honor')
              ? []
              : values.proofs
                  .filter((type) => type !== 'pre_selfie' && type !== 'post_selfie' && type !== 'hr_monitor')
                  .map((type) => ({ type, required: true })),
        proofs: isPoints ? [] : proofsForStorage(namedProofs),
        target_count: targetCount,
        frequency: isPoints ? 'once' : values.frequency,
        tasks,
        starts_at: schedule.starts_at,
        ends_at: unlimited ? null : schedule.ends_at,
        end_mode: unlimited ? 'indefinite_lms' : publishEndMode(schedule.end_mode),
        length_value: durationInt,
        duration_days: durationInt,
        length_unit: unlimited ? null : schedule.duration_unit,
        category: values.category,
        challenge_type: unlimited ? 'consistency' : values.challenge_type,
        visibility: lane.visibility,
        prize_structure: payout.prize_structure,
        top_places_mode: payout.prize_structure === 'top_places' ? payout.top_places_mode : null,
        top_places_value:
          payout.prize_structure === 'top_places' ? Number(payout.top_places_value) : null,
        top_places_distribution:
          payout.prize_structure === 'top_places' ? payout.top_places_distribution : null,
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
        host_funded: values.host_funded === true || contribution > 0,
        host_budget:
          (values.guarantee_enabled ??
            asPrivacyMode(values.privacy_mode, values.visibility, values.challenge_lane) !==
              'private_corporate')
            ? contribution
            : 0,
        format: unlimited ? 'lms' : values.format ?? values.challenge_type,
        task: values.task?.trim() || values.rule_activity.trim() || null,
        required_checkins: durationInt ?? (isPoints ? 1 : targetCount),
        misses_allowed:
          isPoints || values.challenge_type === 'cumulative'
            ? 0
            : Math.max(Number(values.misses_allowed) || 0, 0),
        proof_type:
          values.proof_type ??
          proofTypeFromMethod(firstProofMethod(namedProofs)),
        proof_review: values.proof_review ?? 'auto',
        payout_mode: payout.payout_mode,
        timezone: resolveChallengeTimezone(),
        start_rule: 'at_starts_at',
        discoverability: values.discoverability ?? null,
        privacy_mode: asPrivacyMode(values.privacy_mode, values.visibility, values.challenge_lane),
        scoring_method: values.scoring_method === 'comparable_points' ? 'comparable_points' : null,
        scoring_config:
          values.scoring_method === 'comparable_points'
            ? parseComparablePointsConfig(values.scoring_config)
            : null,
        cumulative_metric: values.challenge_type === 'cumulative' ? values.cumulative_metric ?? 'distance_m' : null,
        cumulative_target:
          values.challenge_type === 'cumulative' ? Math.max(Number(values.cumulative_target) || 0, 0) : null,
        cumulative_window:
          values.challenge_type === 'cumulative' ? values.cumulative_window ?? 'challenge' : null,
        distance_meters_required: Math.max(Number(values.distance_meters_required) || 0, 0) || null,
      });
      await persistChallengePlaces(challenge.id, namedProofs);
      await announceCreatedChallenge({
        authorId: user.id,
        challengeId: challenge.id,
        title: challenge.title,
        visibility: challenge.visibility ?? lane.visibility,
        challenge_lane: challenge.challenge_lane ?? lane.challenge_lane,
        is_official: challenge.is_official,
        privacy_mode: challenge.privacy_mode,
      });
      void notifyFriendsOfCreatedChallenge(challenge.id);
      return challenge;
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
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void reportBadgeActivity();
    },
  });
}

function resetChallengeProgressCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  challengeId: string,
  userId?: string,
) {
  queryClient.setQueryData(['my-participation', challengeId, userId], (current: ChallengeParticipant | null | undefined) =>
    current ? { ...current, days_completed: 0, completed_at: null } : current,
  );
  queryClient.setQueryData(
    ['challenge-participants', challengeId],
    (rows: ChallengeParticipantWithProfile[] | undefined) =>
      (rows ?? []).map((row) => ({ ...row, days_completed: 0, completed_at: null })),
  );
  if (userId) {
    queryClient.setQueryData(['logged-workout-days', challengeId, userId], 0);
  }
  queryClient.setQueriesData({ queryKey: ['submitted-checkins', challengeId] }, () => 0);
  queryClient.setQueriesData({ queryKey: ['workout-submission', challengeId] }, () => null);
  queryClient.removeQueries({ queryKey: ['challenge-checkin', challengeId] });
  queryClient.setQueriesData({ queryKey: ['challenge-completions', challengeId] }, () => new Set<string>());
}

function invalidateChallengeCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  challengeId: string,
  userId?: string,
  options?: { refetchChallenge?: boolean },
) {
  if (options?.refetchChallenge === false) {
    void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId], refetchType: 'none' });
  } else {
    void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
    void queryClient.refetchQueries({ queryKey: ['challenge', challengeId] });
  }
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
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  void queryClient.invalidateQueries({ queryKey: ['challenge-checkin', challengeId] });
  void queryClient.invalidateQueries({ queryKey: ['workout-submission', challengeId] });
  void queryClient.invalidateQueries({ queryKey: ['submitted-checkins', challengeId] });
  void queryClient.invalidateQueries({ queryKey: ['logged-workout-days', challengeId] });
  void queryClient.invalidateQueries({ queryKey: ['challenge-completions', challengeId] });
  void queryClient.invalidateQueries({ queryKey: ['completed-task-ids', challengeId] });
  void queryClient.invalidateQueries({ queryKey: ['my-challenge-progress'] });
  void queryClient.invalidateQueries({ queryKey: ['loggable-challenge'] });
  void queryClient.refetchQueries({ queryKey: ['challenge-participants', challengeId] });
  void queryClient.refetchQueries({ queryKey: ['my-participation', challengeId] });
  void queryClient.refetchQueries({ queryKey: ['submitted-checkins', challengeId] });
  void queryClient.refetchQueries({ queryKey: ['logged-workout-days', challengeId] });
  void queryClient.refetchQueries({ queryKey: ['challenge-checkin', challengeId] });
  void queryClient.refetchQueries({ queryKey: ['workout-submission', challengeId] });
  void queryClient.refetchQueries({ queryKey: ['challenge-completions', challengeId] });
  if (userId) {
    void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
  }
}

export function useResolveStartRoll() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      challengeId,
      startsAt,
      mode,
    }: {
      challengeId: string;
      startsAt: string;
      mode: 'keep' | 'shorten';
    }) => applyChallengeStart(challengeId, startsAt, mode),
    onSuccess: (challenge) => {
      queryClient.setQueryData<ChallengeWithStats>(['challenge', challenge.id], (current) =>
        current ? { ...current, ...challenge } : { ...challenge, participant_count: 0 },
      );
      resetChallengeProgressCaches(queryClient, challenge.id, user?.id);
      invalidateChallengeCaches(queryClient, challenge.id, user?.id, { refetchChallenge: false });
    },
  });
}

export function useNudgeChallengeStart() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (challengeId: string) => nudgeChallengeStart(challengeId),
    onSuccess: (challenge) => {
      queryClient.setQueryData<ChallengeWithStats>(['challenge', challenge.id], (current) =>
        current ? { ...current, ...challenge } : { ...challenge, participant_count: 0 },
      );
      resetChallengeProgressCaches(queryClient, challenge.id, user?.id);
      invalidateChallengeCaches(queryClient, challenge.id, user?.id, { refetchChallenge: false });
    },
  });
}

export function useUpdateUserChallenge() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      challengeId,
      values,
    }: {
      challengeId: string;
      values: CreateChallengeValues;
    }): Promise<Challenge> => {
      const unlimited = values.duration_type === 'unlimited';
      const schedule = ensureSchedule(values);
      const isPoints = !unlimited && values.challenge_type === 'points';
      const durationDays = unlimited ? null : durationDaysFromValues(schedule);
      const durationInt = unlimited ? null : durationIntegerForPublish(durationDays);
      const targetCount = isPoints ? checkinTargetForStore(values, durationDays) : durationInt ?? 1;
      const payout = unlimited
        ? {
            prize_structure: 'winner_take_all' as const,
            payout_mode: 'winner_take_all' as const,
            top_places_mode: null as const,
            top_places_value: null as const,
            top_places_distribution: null as const,
          }
        : publishPayoutFields(values);
      const namedProofs = namedProofsForPublish(values);
      const placeError = proofsReadyToPublish(namedProofs);
      if (placeError) {
        throw new Error(placeError);
      }
      const privacyMode = asPrivacyMode(values.privacy_mode, values.visibility, values.challenge_lane);
      const challenge = await updateUserChallenge(challengeId, {
        title: values.title.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
        rules: composeChallengeRules(values) || null,
        starts_at: schedule.starts_at,
        ends_at: unlimited ? null : schedule.ends_at,
        is_unlimited: unlimited,
        min_participants: Math.max(Number(values.min_participants) || 2, 2),
        days_required: durationInt ?? targetCount,
        length_value: durationInt,
        duration_days: durationInt,
        target_count: targetCount,
        min_minutes: minMinutesForPublish(values),
        frequency: isPoints ? 'once' : values.frequency,
        proofs: proofsForStorage(namedProofs),
        proof_requirements:
          namedProofs.length > 0
            ? proofRequirementsFrom(namedProofs)
            : [],
        tasks: persistTasksForPublish(values, isPoints),
        rules_list: buildRulesStructured(values),
        visibility: values.visibility,
        discoverability: values.discoverability ?? null,
        privacy_mode: privacyMode,
        task: values.task?.trim() || values.rule_activity.trim() || null,
        length_unit: unlimited ? null : schedule.duration_unit,
        required_checkins: durationInt ?? (isPoints ? 1 : targetCount),
        misses_allowed:
          isPoints || values.challenge_type === 'cumulative'
            ? 0
            : Math.max(Number(values.misses_allowed) || 0, 0),
        proof_type: values.proof_type ?? proofTypeFromMethod(firstProofMethod(namedProofs)),
        cover_image_url: values.cover_image_url?.trim() || null,
        rules_video_url: values.rules_video_url?.trim() || null,
        format: unlimited ? 'lms' : values.format ?? values.challenge_type,
        challenge_type: unlimited ? 'consistency' : values.challenge_type,
        prize_structure: payout.prize_structure,
        payout_mode: payout.payout_mode,
        top_places_mode: payout.prize_structure === 'top_places' ? payout.top_places_mode : null,
        top_places_value: payout.prize_structure === 'top_places' ? Number(payout.top_places_value) : null,
        top_places_distribution:
          payout.prize_structure === 'top_places' ? payout.top_places_distribution : null,
        cumulative_metric: values.challenge_type === 'cumulative' ? values.cumulative_metric ?? 'distance_m' : null,
        cumulative_target:
          values.challenge_type === 'cumulative' ? Math.max(Number(values.cumulative_target) || 0, 0) : null,
        cumulative_window:
          values.challenge_type === 'cumulative' ? values.cumulative_window ?? 'challenge' : null,
        distance_meters_required: Math.max(Number(values.distance_meters_required) || 0, 0) || null,
      });
      await persistChallengePlaces(challengeId, namedProofs);
      const scoring = parseComparablePointsConfig(values.scoring_config);
      if (values.scoring_method === 'comparable_points' && scoring) {
        await publishScoringChange(challengeId, scoring);
      }
      if (user?.id) {
        await persistPrivacyMode({
          challengeId,
          createdBy: user.id,
          next: privacyMode,
          current: challenge.privacy_mode,
        });
      }
      return { ...challenge, privacy_mode: privacyMode };
    },
    onSuccess: (challenge) => {
      queryClient.setQueryData<ChallengeWithStats>(['challenge', challenge.id], (current) =>
        current ? { ...current, ...challenge } : { ...challenge, participant_count: 0 },
      );
      invalidateChallengeCaches(queryClient, challenge.id, user?.id);
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useUpdateOfficialChallengeDetails(challengeId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: OfficialChallengeDetailsPayload): Promise<Challenge> => {
      if (!challengeId) {
        throw new Error('Challenge not found');
      }
      return updateOfficialChallengeDetails(challengeId, payload);
    },
    onSuccess: (challenge) => {
      queryClient.setQueryData<ChallengeWithStats>(['challenge', challenge.id], (current) =>
        current ? { ...current, ...challenge } : { ...challenge, participant_count: 0 },
      );
      invalidateChallengeCaches(queryClient, challenge.id, user?.id);
      void queryClient.invalidateQueries({ queryKey: ['official-details-source', challenge.id] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function usePublishScoringChange(challengeId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { config: unknown; summary?: string | null }) => {
      if (!challengeId) {
        throw new Error('Challenge not found');
      }
      return publishScoringChange(challengeId, input.config, input.summary);
    },
    onSuccess: (result) => {
      if (!challengeId) {
        return;
      }
      queryClient.setQueryData<ChallengeWithStats>(['challenge', challengeId], (current) =>
        current
          ? {
              ...current,
              scoring_method: 'comparable_points',
              scoring_version: result.version,
              scoring_config: result.scoring_config,
              comparable_points_config: result.comparable_points_config,
            }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['scoring-audit', challengeId] });
      if (user?.id) {
        invalidateChallengeCaches(queryClient, challengeId, user.id);
      }
    },
  });
}

export function useScoringAudit(challengeId: string | undefined) {
  return useQuery({
    queryKey: ['scoring-audit', challengeId],
    enabled: Boolean(challengeId),
    queryFn: () => fetchScoringAudit(challengeId!),
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
    mutationFn: async (challengeId: string) => {
      await getPaymentsProvider().refundJoin(
        cancelProviderRef(challengeId),
        0,
        'challenge_cancel',
      );
      return { ok: true as const };
    },
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
    mutationFn: async (challengeId: string) => {
      const cached = queryClient.getQueryData<ChallengeWithStats>(['challenge', challengeId]);
      return settleChallenge(challengeId, cached ?? null);
    },
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
