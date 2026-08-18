import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';

import { ChallengeCard } from '@/components/challenge/ChallengeCard';
import { JoinConfirmModal } from '@/components/challenge/JoinConfirmModal';
import { ContinueDraftCard } from '@/components/challenge/create/wizardUi';
import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { MascotState } from '@/components/mascot/MascotState';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { AppHeader } from '@/components/wallet/AppHeader';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import {
  useDiscoverChallenges,
  useJoinChallenge,
  useLobbyFriendCounts,
  useMyChallengeProgress,
  useMyLobbyChallenges,
} from '@/hooks/useChallenge';
import { useChallengeDrafts, useDiscardChallengeDraft } from '@/hooks/useChallengeDraft';
import { hasCompletedBodyMetrics } from '@/lib/bodyMetrics';
import { isVisibleDraft } from '@/lib/challengeDraft';
import { isBucksChallenge } from '@/lib/currency';
import { THEME } from '@/lib/theme';
import type { ChallengeWithStats } from '@/lib/types';
import { BODY_METRICS_HREF, challengeDetailHref } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/utils/errors';

type LobbyFilter = 'all' | 'joined' | 'open' | 'official' | 'bucks' | 'coins';

const FILTERS: { id: LobbyFilter; label: string; currency?: 'coins' | 'bucks' }[] = [
  { id: 'all', label: 'All' },
  { id: 'joined', label: 'Joined' },
  { id: 'open', label: 'Open' },
  { id: 'official', label: 'Official' },
  { id: 'coins', label: 'Coins', currency: 'coins' },
  { id: 'bucks', label: '$ Bucks', currency: 'bucks' },
];

const CHIP_HEIGHT = 34;
const EMPTY_FRIENDS = new Map<string, number>();

function isLobbyParticipant(status: string | null | undefined) {
  const value = status ?? 'joined';
  return value === 'joined' || value === 'active' || value === 'completed';
}

function matchesSearch(challenge: ChallengeWithStats, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return challenge.title.toLowerCase().includes(needle);
}

function matchesFacet(challenge: ChallengeWithStats, filter: LobbyFilter) {
  if (filter === 'official') {
    return Boolean(challenge.is_official);
  }
  if (filter === 'bucks') {
    return isBucksChallenge(challenge);
  }
  if (filter === 'coins') {
    return !isBucksChallenge(challenge);
  }
  return true;
}

function startMs(challenge: ChallengeWithStats) {
  const value = Date.parse(challenge.starts_at);
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

function createdMs(challenge: ChallengeWithStats) {
  const value = Date.parse(challenge.created_at);
  return Number.isNaN(value) ? 0 : value;
}

function sortDiscoverRows(
  rows: ChallengeWithStats[],
  friendCounts: Map<string, number>,
): ChallengeWithStats[] {
  return [...rows].sort((a, b) => {
    const friendsA = friendCounts.get(a.id) ?? 0;
    const friendsB = friendCounts.get(b.id) ?? 0;
    if (friendsA !== friendsB) {
      return friendsB - friendsA;
    }
    if (Boolean(a.is_official) !== Boolean(b.is_official)) {
      return a.is_official ? -1 : 1;
    }
    const startA = startMs(a);
    const startB = startMs(b);
    if (startA !== startB) {
      return startA - startB;
    }
    return createdMs(b) - createdMs(a);
  });
}

function FilterChip({
  label,
  active,
  onPress,
  currency,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  currency?: 'coins' | 'bucks';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        height: CHIP_HEIGHT,
        paddingHorizontal: currency ? 12 : 14,
        borderRadius: 999,
        backgroundColor: active ? THEME.accentSoft : THEME.surface,
        borderWidth: 1,
        borderColor: active ? THEME.accent : THEME.border,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        flexGrow: 0,
        flexShrink: 0,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {currency ? <CurrencyMark currency={currency} size={15} /> : null}
        <AppText
          numberOfLines={1}
          className="text-[13px] font-medium"
          style={{
            color: active ? THEME.accent : THEME.textPrimary,
            lineHeight: 16,
            includeFontPadding: false,
          }}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

export default function ChallengesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const discoverQuery = useDiscoverChallenges();
  const joinedQuery = useMyLobbyChallenges();
  const mine = useMyChallengeProgress();
  const join = useJoinChallenge();
  const draftsQuery = useChallengeDrafts();
  const discardDraft = useDiscardChallengeDraft();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LobbyFilter>('all');
  const [joinTarget, setJoinTarget] = useState<ChallengeWithStats | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const search = query.trim().toLowerCase();
  const discoverSource = discoverQuery.data ?? [];
  const joinedSource = joinedQuery.data ?? [];
  const drafts = (draftsQuery.data ?? []).filter(isVisibleDraft);
  const challengeIds = useMemo(
    () => [...new Set([...joinedSource, ...discoverSource].map((row) => row.id))],
    [discoverSource, joinedSource],
  );
  const friendCountsQuery = useLobbyFriendCounts(challengeIds);
  const friendCounts = friendCountsQuery.data ?? EMPTY_FRIENDS;
  const progressById = useMemo(() => {
    const map = new Map<string, { days: number; status: string }>();
    for (const row of mine.data ?? []) {
      if (!isLobbyParticipant(row.status)) {
        continue;
      }
      map.set(row.challenge_id, {
        days: Number(row.days_completed ?? 0),
        status: row.status ?? 'joined',
      });
    }
    return map;
  }, [mine.data]);
  const participantIds = useMemo(() => new Set(progressById.keys()), [progressById]);
  const joinedIds = useMemo(() => new Set(joinedSource.map((row) => row.id)), [joinedSource]);

  const joinedRows = useMemo(
    () =>
      joinedSource.filter(
        (challenge) => matchesSearch(challenge, search) && matchesFacet(challenge, filter),
      ),
    [filter, joinedSource, search],
  );

  const discoverRows = useMemo(() => {
    const filtered = discoverSource.filter((challenge) => {
      if (joinedIds.has(challenge.id) || progressById.has(challenge.id)) {
        return false;
      }
      return matchesSearch(challenge, search) && matchesFacet(challenge, filter);
    });
    return sortDiscoverRows(filtered, friendCounts);
  }, [discoverSource, filter, friendCounts, joinedIds, progressById, search]);

  const showJoined = filter !== 'open' && (filter === 'joined' || joinedSource.length > 0);
  const showDiscover = filter !== 'joined';
  const showLoading =
    (discoverQuery.isPending && !discoverQuery.data) &&
    (joinedQuery.isPending && !joinedQuery.data);
  const showError =
    discoverQuery.isError &&
    joinedQuery.isError &&
    !discoverQuery.data &&
    !joinedQuery.data;
  const noData =
    !discoverQuery.isError &&
    !joinedQuery.isError &&
    discoverQuery.isSuccess &&
    joinedQuery.isSuccess &&
    discoverSource.length === 0 &&
    joinedSource.length === 0;

  function openChallenge(id: string) {
    if (!id) {
      return;
    }
    router.push(challengeDetailHref(id, 'lobby'));
  }

  function requestJoin(challenge: ChallengeWithStats) {
    if (!user) {
      router.push('/login');
      return;
    }
    if (challenge.is_official && !hasCompletedBodyMetrics(profile)) {
      void supabase.rpc('notify_my_profile_gate', { p_missing: 'physical details' });
      router.push(BODY_METRICS_HREF);
      return;
    }
    setJoinError(null);
    setJoinTarget(challenge);
  }

  function onConfirmJoin() {
    if (!joinTarget) {
      return;
    }
    join.mutate(joinTarget.id, {
      onSuccess: () => {
        setJoinTarget(null);
        setJoinError(null);
      },
      onError: (error) => {
        setJoinError(getErrorMessage(error));
      },
    });
  }

  async function onRefresh() {
    await Promise.all([
      discoverQuery.refetch(),
      joinedQuery.refetch(),
      mine.refetch(),
      draftsQuery.refetch(),
      user && challengeIds.length > 0 ? friendCountsQuery.refetch() : Promise.resolve(),
    ]);
  }

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} className="px-4 pt-1">
      <AppHeader title="Lobby" subtitle="Find a challenge. Buy in. Prove the work." />

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search challenges"
        placeholderTextColor={THEME.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        style={{
          marginTop: 8,
          height: 40,
          paddingHorizontal: 12,
          color: THEME.textPrimary,
          backgroundColor: THEME.surface,
          borderWidth: 1,
          borderColor: THEME.border,
          borderRadius: 999,
          fontSize: 15,
        }}
        accessibilityLabel="Search challenges"
      />

      <View style={{ height: CHIP_HEIGHT, marginTop: 12, flexGrow: 0, flexShrink: 0 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ height: CHIP_HEIGHT, flexGrow: 0 }}
          contentContainerStyle={{
            alignItems: 'center',
            gap: 8,
            paddingRight: 8,
            height: CHIP_HEIGHT,
            flexGrow: 0,
          }}>
          {FILTERS.map((item) => (
            <FilterChip
              key={item.id}
              label={item.label}
              currency={item.currency}
              active={filter === item.id}
              onPress={() => setFilter(item.id)}
            />
          ))}
        </ScrollView>
      </View>

      {user ? (
        <View className="mt-3 gap-2">
          <Button title="Create a Challenge" size="lg" onPress={() => router.push('/challenges/create')} />
          {drafts.length > 0 ? (
            <View className="gap-2">
              {drafts.map((item) => (
                <ContinueDraftCard
                  key={item.id ?? item.updatedAt}
                  draft={item}
                  onContinue={() =>
                    router.push(
                      item.id
                        ? `/challenges/create?resume=1&draftId=${encodeURIComponent(item.id)}`
                        : '/challenges/create?resume=1',
                    )
                  }
                  onDiscard={() => {
                    void discardDraft.mutateAsync(item.id);
                  }}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {showLoading ? (
        <MascotState kind="loading" title="Opening the lobby" body="Looking for open competitions." />
      ) : showError ? (
        <MascotState
          kind="error"
          title="Lobby is unreachable"
          body={discoverQuery.error?.message ?? joinedQuery.error?.message ?? 'Couldn’t load challenges.'}
          actionLabel="Retry"
          onAction={() => {
            void discoverQuery.refetch();
            void joinedQuery.refetch();
          }}
        />
      ) : noData ? (
        <MascotState
          kind="empty"
          title="Lobby’s quiet"
          body={
            user
              ? 'Be the first. Create a challenge and others can jump in.'
              : 'Open challenges will show up here. Pull to refresh if you just seeded one.'
          }
          actionLabel={user ? 'Create a Challenge' : undefined}
          onAction={user ? () => router.push('/challenges/create') : undefined}
        />
      ) : (
        <ScrollView
          className="mt-4 flex-1"
          contentContainerClassName="pb-8"
          refreshControl={
            <RefreshControl
              refreshing={
                (discoverQuery.isRefetching || joinedQuery.isRefetching) &&
                !discoverQuery.isPending &&
                !joinedQuery.isPending
              }
              onRefresh={() => void onRefresh()}
              tintColor={THEME.accent}
            />
          }
          showsVerticalScrollIndicator={false}>
          {showJoined ? (
            <View className="mb-5">
              <AppText className="text-[18px] font-extrabold text-charcoal">Your challenges</AppText>
              {joinedQuery.isError && joinedSource.length === 0 ? (
                <AppText className="mt-2 text-[13px] leading-5 text-muted">
                  Couldn’t load your challenges. Pull to refresh.
                </AppText>
              ) : joinedRows.length === 0 ? (
                <AppText className="mt-2 text-[13px] leading-5 text-muted">
                  {search
                    ? 'None of your challenges match that search.'
                    : 'Nothing here yet. Create one or jump into an open challenge below.'}
                </AppText>
              ) : (
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  directionalLockEnabled
                  showsHorizontalScrollIndicator={false}
                  className="mt-2.5"
                  contentContainerStyle={{ gap: 8, paddingRight: 12 }}>
                  {joinedRows.map((challenge) => {
                    const participating = participantIds.has(challenge.id);
                    const hosting = Boolean(user?.id && challenge.created_by === user.id);
                    return (
                      <ChallengeCard
                        key={challenge.id}
                        variant="rail"
                        challenge={challenge}
                        myDays={participating ? progressById.get(challenge.id)?.days ?? 0 : null}
                        joined={participating}
                        hosting={hosting}
                        invited={!participating && !hosting}
                        onPress={() => openChallenge(challenge.id)}
                      />
                    );
                  })}
                </ScrollView>
              )}
            </View>
          ) : null}

          {showDiscover ? (
            <View className="gap-2.5">
              <AppText className="text-[18px] font-extrabold text-charcoal">Open challenges</AppText>
              {discoverQuery.isError && discoverSource.length === 0 ? (
                <AppText className="text-[13px] leading-5 text-muted">
                  Couldn’t load open challenges. Pull to refresh.
                </AppText>
              ) : discoverRows.length === 0 ? (
                <AppText className="text-[13px] leading-5 text-muted">
                  {search
                    ? 'No open challenges match that. Try All or a shorter word.'
                    : 'Nothing open right now. Create one and the lobby will fill up.'}
                </AppText>
              ) : (
                discoverRows.map((challenge) => {
                  const joined = joinedIds.has(challenge.id) || progressById.has(challenge.id);
                  return (
                    <ChallengeCard
                      key={challenge.id}
                      challenge={challenge}
                      joined={joined}
                      friendCount={friendCounts.get(challenge.id) ?? 0}
                      myDays={joined ? progressById.get(challenge.id)?.days : null}
                      onPress={() => openChallenge(challenge.id)}
                      onJoin={
                        joined || challenge.official_started_at
                          ? undefined
                          : () => requestJoin(challenge)
                      }
                    />
                  );
                })
              )}
            </View>
          ) : null}
        </ScrollView>
      )}

      {joinTarget ? (
        <JoinConfirmModal
          visible
          challenge={joinTarget}
          loading={join.isPending}
          error={joinError}
          onClose={() => {
            if (join.isPending) {
              return;
            }
            setJoinTarget(null);
            setJoinError(null);
          }}
          onConfirm={onConfirmJoin}
        />
      ) : null}
    </Screen>
  );
}
