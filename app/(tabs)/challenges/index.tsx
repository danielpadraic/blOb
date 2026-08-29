import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';

import { remainingFromChallenge } from '@/components/challenge/ChallengePosterCard';
import {
  LobbyChallengeCard,
  LobbyChallengeRow,
  type InviteHost,
} from '@/components/challenge/LobbyChallengeCard';
import { ContinueDraftCard } from '@/components/challenge/create/wizardUi';
import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { SharedTabs } from '@/components/ui/SharedTabs';
import { AppHeader } from '@/components/wallet/AppHeader';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import {
  useCompetingChallenges,
  useFriendsDiscoverChallenges,
  useHostingChallenges,
  useMyChallengeProgress,
  useOfficialDiscoverChallenges,
} from '@/hooks/useChallenge';
import { useLobbyTodayCheckins } from '@/hooks/useChallengeCheckin';
import { useChallengeDrafts, useDiscardChallengeDraft } from '@/hooks/useChallengeDraft';
import { createHrefForDraft, isVisibleDraft } from '@/lib/challengeDraft';
import { isJoinableNotStarted } from '@/lib/challengeDiscoverability';
import { openChallengeLobby } from '@/lib/challengeOpen';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { asCopyTone, copy } from '@/lib/copy';
import {
  isLobbyActiveParticipantStatus,
  isOfficialLobbyRow,
  loadLobbyLayout,
  loadLobbyUncheckedFilter,
  saveLobbyLayout,
  saveLobbyUncheckedFilter,
  scheduleNeedsTick,
  sortEndingSoonest,
  type LobbyLayout,
  type LobbyTab,
} from '@/lib/lobbyChallenge';
import { fetchPublicProfilesByIds, personDisplayName } from '@/lib/social';
import { THEME, themeShadow } from '@/lib/theme';
import { AppText } from '@/components/ui/AppText';
import type { ChallengeWithStats } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';

const LOBBY_TABS = [
  { value: 'official', label: 'Official' },
  { value: 'active', label: 'Active' },
  { value: 'hosting', label: 'Hosting' },
] as const;

function matchesSearch(title: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return title.toLowerCase().includes(needle);
}

function isLobbyDiscoverCard(challenge: ChallengeWithStats, joined: boolean) {
  if (joined) {
    return true;
  }
  if (!isJoinableNotStarted(challenge.status)) {
    return false;
  }
  if (challenge.status === 'filling' || challenge.status === 'arming') {
    return true;
  }
  return remainingFromChallenge(challenge) > 0;
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) {
      continue;
    }
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function hostByIdHas(map: Map<string, InviteHost>, id?: string | null) {
  return Boolean(id && map.has(id));
}

export default function ChallengesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ notice?: string }>();
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<LobbyTab>('official');
  const [tabReady, setTabReady] = useState(false);
  const [layout, setLayout] = useState<LobbyLayout>('card');
  const [uncheckedOnly, setUncheckedOnly] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const tone = asCopyTone(profile?.motivation_tone);
  const hostingQuery = useHostingChallenges();
  const activeQuery = useCompetingChallenges();
  const officialQuery = useOfficialDiscoverChallenges();
  const friendsQuery = useFriendsDiscoverChallenges();
  const mine = useMyChallengeProgress();
  const draftsQuery = useChallengeDrafts();
  const discardDraft = useDiscardChallengeDraft();
  const [query, setQuery] = useState('');

  useEffect(() => {
    void Promise.all([loadLobbyLayout(), loadLobbyUncheckedFilter()]).then(
      ([nextLayout, nextFilter]) => {
        setLayout(nextLayout);
        setUncheckedOnly(nextFilter);
      },
    );
  }, []);

  useEffect(() => {
    if (notice !== 'cancelled') {
      return;
    }
    setToast(copy('challenge.cancelledToast'));
    router.setParams({ notice: undefined });
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [notice, router]);

  const drafts = (draftsQuery.data ?? []).filter(isVisibleDraft);
  const search = query.trim();
  const progressById = useMemo(() => {
    const map = new Map<string, { days: number; status: string; eliminated?: boolean }>();
    for (const row of mine.data ?? []) {
      if (!isLobbyActiveParticipantStatus(row.status)) {
        continue;
      }
      map.set(row.challenge_id, {
        days: Number(row.days_completed ?? 0),
        status: row.status ?? 'joined',
        eliminated: Boolean(row.eliminated_at),
      });
    }
    return map;
  }, [mine.data]);
  const selfHost = useMemo<InviteHost | null>(() => {
    if (!profile) {
      return user ? { name: 'You' } : null;
    }
    return {
      name: personDisplayName(profile),
      avatarUrl: profile.avatar_url,
    };
  }, [profile, user]);

  const officialAll = useMemo(
    () =>
      uniqueById([
        ...(officialQuery.data ?? []).filter(isOfficialLobbyRow),
        ...(activeQuery.data ?? []).filter(isOfficialLobbyRow),
        ...(hostingQuery.data ?? []).filter(isOfficialLobbyRow),
      ]),
    [activeQuery.data, hostingQuery.data, officialQuery.data],
  );

  const activeAll = useMemo(
    () => (activeQuery.data ?? []).filter((row) => !isOfficialLobbyRow(row)),
    [activeQuery.data],
  );
  const activeIds = useMemo(() => new Set(activeAll.map((row) => row.id)), [activeAll]);

  const hostingAll = useMemo(
    () => (hostingQuery.data ?? []).filter((row) => !isOfficialLobbyRow(row)),
    [hostingQuery.data],
  );
  const hostingIds = useMemo(() => new Set(hostingAll.map((row) => row.id)), [hostingAll]);

  const friendsAll = useMemo(
    () =>
      (friendsQuery.data ?? []).filter(
        (row) =>
          !progressById.has(row.challenge.id) &&
          !activeIds.has(row.challenge.id) &&
          !hostingIds.has(row.challenge.id) &&
          !isOfficialLobbyRow(row.challenge) &&
          isLobbyDiscoverCard(row.challenge, false),
      ),
    [activeIds, friendsQuery.data, hostingIds, progressById],
  );

  const todaySource = useMemo(
    () => uniqueById([...officialAll, ...activeAll, ...hostingAll, ...friendsAll.map((row) => row.challenge)]),
    [activeAll, friendsAll, hostingAll, officialAll],
  );
  const todayCheckins = useLobbyTodayCheckins(todaySource);
  const checkedToday = todayCheckins.data ?? new Set<string>();

  useEffect(() => {
    if (tabReady) {
      return;
    }
    const pending =
      (hostingQuery.isPending && !hostingQuery.data) ||
      (activeQuery.isPending && !activeQuery.data) ||
      (officialQuery.isPending && !officialQuery.data);
    if (pending) {
      return;
    }
    setTab(activeAll.length > 0 ? 'active' : 'official');
    setTabReady(true);
  }, [
    activeAll.length,
    activeQuery.data,
    activeQuery.isPending,
    hostingQuery.data,
    hostingQuery.isPending,
    officialQuery.data,
    officialQuery.isPending,
    tabReady,
  ]);

  function applyList(rows: ChallengeWithStats[]) {
    const searched = rows.filter((row) => matchesSearch(challengeDisplayTitle(row), search));
    const filtered = uncheckedOnly
      ? searched.filter((row) => !checkedToday.has(row.id))
      : searched;
    return sortEndingSoonest(filtered);
  }

  const official = applyList(officialAll);
  const active = applyList(activeAll);
  const hosting = applyList(hostingAll);
  const friends = sortEndingSoonest(
    friendsAll
      .filter((row) => matchesSearch(challengeDisplayTitle(row.challenge), search))
      .filter((row) => !uncheckedOnly || !checkedToday.has(row.challenge.id)),
  );
  const visibleDrafts =
    tab === 'hosting' ? drafts.filter((item) => matchesSearch(item.title ?? '', search)) : [];

  const friendIds = useMemo(
    () => [...new Set(friendsAll.map((row) => row.friendId))],
    [friendsAll],
  );
  const friendProfiles = useQuery({
    queryKey: ['lobby-friend-proof-profiles', friendIds.join(',')],
    enabled: friendIds.length > 0,
    queryFn: () => fetchPublicProfilesByIds(friendIds),
  });
  const hostIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of [...activeAll, ...hostingAll, ...friendsAll.map((item) => item.challenge)]) {
      if (!row.is_official && row.created_by && row.created_by !== user?.id) {
        ids.add(row.created_by);
      }
    }
    return [...ids];
  }, [activeAll, friendsAll, hostingAll, user?.id]);
  const hostProfiles = useQuery({
    queryKey: ['lobby-host-profiles', hostIds.join(',')],
    enabled: hostIds.length > 0,
    queryFn: () => fetchPublicProfilesByIds(hostIds),
  });
  const hostById = useMemo(() => {
    const map = new Map<string, InviteHost>();
    for (const row of hostProfiles.data ?? []) {
      map.set(row.id, {
        name: personDisplayName(row),
        avatarUrl: row.avatar_url,
      });
    }
    const byFriend = new Map((friendProfiles.data ?? []).map((row) => [row.id, row]));
    for (const row of friendsAll) {
      if (hostByIdHas(map, row.challenge.created_by)) {
        continue;
      }
      const person = byFriend.get(row.friendId);
      if (person && row.kind === 'hosting') {
        map.set(row.challenge.created_by ?? person.id, {
          name: personDisplayName(person),
          avatarUrl: person.avatar_url,
        });
      }
    }
    return map;
  }, [friendProfiles.data, friendsAll, hostProfiles.data]);

  const loading =
    hostingQuery.isPending &&
    !hostingQuery.data &&
    activeQuery.isPending &&
    !activeQuery.data &&
    officialQuery.isPending &&
    !officialQuery.data;
  const failed =
    hostingQuery.isError &&
    activeQuery.isError &&
    officialQuery.isError &&
    !hostingQuery.data &&
    !activeQuery.data &&
    !officialQuery.data;

  const tabRows = tab === 'official' ? official : tab === 'active' ? active : hosting;
  const ticking = [...tabRows, ...friends.map((row) => row.challenge)].some((row) =>
    scheduleNeedsTick(row, nowMs),
  );

  useEffect(() => {
    if (!ticking) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  function openChallenge(id: string, snapshot?: ChallengeWithStats) {
    openChallengeLobby(router, { id, snapshot, returnTo: 'lobby', extra: { tab: 'overview' } });
  }

  async function onRefresh() {
    await Promise.all([
      hostingQuery.refetch(),
      activeQuery.refetch(),
      officialQuery.refetch(),
      friendsQuery.refetch(),
      mine.refetch(),
      draftsQuery.refetch(),
      todayCheckins.refetch(),
    ]);
  }

  function onLayoutChange(next: LobbyLayout) {
    setLayout(next);
    void saveLobbyLayout(next);
  }

  function onUncheckedToggle() {
    setUncheckedOnly((current) => {
      const next = !current;
      void saveLobbyUncheckedFilter(next);
      return next;
    });
  }

  const tabEmpty =
    tabRows.length === 0 &&
    (tab !== 'active' || friends.length === 0) &&
    (tab !== 'hosting' || visibleDrafts.length === 0);

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} className="px-4 pt-1">
      <AppHeader
        title="Lobby"
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create"
            onPress={() => router.push('/challenges/create')}
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
            <AppText className="text-[15px] font-semibold" style={{ color: THEME.accent }}>
              Create
            </AppText>
          </Pressable>
        }
      />

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
          height: 44,
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

      <View className="mt-3">
        <SharedTabs
          value={tab}
          onChange={setTab}
          options={LOBBY_TABS}
          accessibilityLabel="Lobby sections"
        />
      </View>

      <View className="mt-2 flex-row items-center" style={{ gap: 12, minHeight: 36 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cards"
          accessibilityState={{ selected: layout === 'card' }}
          onPress={() => onLayoutChange('card')}
          hitSlop={6}
          style={{ minHeight: 36, justifyContent: 'center' }}>
          <AppText
            className="text-[13px] font-semibold"
            style={{ color: layout === 'card' ? THEME.accent : THEME.textMuted }}>
            Cards
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="List"
          accessibilityState={{ selected: layout === 'list' }}
          onPress={() => onLayoutChange('list')}
          hitSlop={6}
          style={{ minHeight: 36, justifyContent: 'center' }}>
          <AppText
            className="text-[13px] font-semibold"
            style={{ color: layout === 'list' ? THEME.accent : THEME.textMuted }}>
            List
          </AppText>
        </Pressable>
        <View style={{ flexGrow: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={uncheckedOnly ? 'Showing not checked in today. Tap to show all.' : 'Showing all. Tap to hide checked in today.'}
          onPress={onUncheckedToggle}
          hitSlop={6}
          style={{ minHeight: 36, justifyContent: 'center' }}>
          <AppText
            className="text-[13px] font-semibold"
            style={{ color: uncheckedOnly ? THEME.accent : THEME.textMuted }}>
            {uncheckedOnly ? 'Not checked in today' : 'All'}
          </AppText>
        </Pressable>
      </View>

      {loading ? (
        <MascotState kind="loading" title={copy('lobby.loading', tone)} />
      ) : failed ? (
        <MascotState
          kind="error"
          title={copy('lobby.unreachable')}
          actionLabel="Retry"
          onAction={() => void onRefresh()}
        />
      ) : (
        <ScrollView
          className="mt-3 flex-1"
          contentContainerClassName="pb-8"
          refreshControl={
            <RefreshControl
              refreshing={
                (hostingQuery.isRefetching ||
                  activeQuery.isRefetching ||
                  officialQuery.isRefetching ||
                  friendsQuery.isRefetching) &&
                !loading
              }
              onRefresh={() => void onRefresh()}
              tintColor={THEME.accent}
            />
          }
          showsVerticalScrollIndicator={false}>
          {tab === 'hosting' && user && visibleDrafts.length > 0 ? (
            <View className="mb-3 gap-2">
              {visibleDrafts.map((item) => (
                <ContinueDraftCard
                  key={item.id ?? item.updatedAt}
                  draft={item}
                  onContinue={() => router.push(createHrefForDraft(item))}
                  onDiscard={() => {
                    void discardDraft.mutateAsync(item.id);
                  }}
                />
              ))}
            </View>
          ) : null}

          {tabEmpty ? (
            <MascotState
              kind="empty"
              title={
                tab === 'hosting'
                  ? 'You’re not hosting yet.'
                  : tab === 'active'
                    ? 'No active challenges yet.'
                    : copy('lobby.empty', tone)
              }
              actionLabel={tab === 'hosting' && user ? 'Create' : undefined}
              onAction={tab === 'hosting' && user ? () => router.push('/challenges/create') : undefined}
              compact
            />
          ) : (
            <View style={{ gap: 10 }}>
              {tab === 'active' && friends.length > 0 ? (
                <View style={{ gap: 10 }}>
                  <AppText className="text-[13px] font-semibold" style={{ color: THEME.textMuted }}>
                    From friends
                  </AppText>
                  {friends.map((row) => (
                    <LobbyListCard
                      key={row.challenge.id}
                      challenge={row.challenge}
                      section="active"
                      layout={layout}
                      nowMs={nowMs}
                      currentUserId={user?.id}
                      progress={progressById.get(row.challenge.id)}
                      host={
                        (row.challenge.created_by && hostById.get(row.challenge.created_by)) || null
                      }
                      onPress={openChallenge}
                    />
                  ))}
                </View>
              ) : null}
              {tabRows.map((challenge) => (
                <LobbyListCard
                  key={challenge.id}
                  challenge={challenge}
                  section={tab === 'official' ? 'official' : tab === 'hosting' ? 'hosting' : 'active'}
                  layout={layout}
                  nowMs={nowMs}
                  currentUserId={user?.id}
                  progress={progressById.get(challenge.id)}
                  host={
                    challenge.is_official
                      ? null
                      : challenge.created_by === user?.id
                        ? selfHost
                        : (challenge.created_by && hostById.get(challenge.created_by)) || null
                  }
                  onPress={openChallenge}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
      {toast ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 16 }}>
          <View
            className="mx-8 items-center px-4 py-2.5"
            style={{
              backgroundColor: THEME.primary,
              borderRadius: 16,
              ...themeShadow('card'),
            }}>
            <AppText className="text-[13px] font-semibold" style={{ color: THEME.primaryForeground }}>
              {toast}
            </AppText>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function LobbyListCard({
  challenge,
  section,
  layout,
  nowMs,
  currentUserId,
  progress,
  host,
  onPress,
}: {
  challenge: ChallengeWithStats;
  section: 'official' | 'active' | 'hosting';
  layout: LobbyLayout;
  nowMs: number;
  currentUserId?: string;
  progress?: { days: number; status: string; eliminated?: boolean };
  host?: InviteHost | null;
  onPress: (id: string, snapshot?: ChallengeWithStats) => void;
}) {
  const hosting = Boolean(currentUserId && challenge.created_by === currentUserId);
  function open() {
    if (!challenge.id) {
      return;
    }
    onPress(challenge.id, challenge);
  }
  if (layout === 'list') {
    return <LobbyChallengeRow challenge={challenge} nowMs={nowMs} onPress={open} />;
  }
  return (
    <LobbyChallengeCard
      challenge={challenge}
      theme={challenge.is_official ? 'official' : 'user'}
      context="lobby"
      section={section}
      joined={Boolean(progress)}
      hosting={hosting}
      eliminated={Boolean(progress?.eliminated)}
      host={host}
      onPress={open}
    />
  );
}
