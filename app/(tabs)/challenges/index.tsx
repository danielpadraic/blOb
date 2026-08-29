import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';

import { remainingFromChallenge } from '@/components/challenge/ChallengePosterCard';
import {
  LobbyChallengeCard,
  LobbyChallengeRow,
  type InviteHost,
} from '@/components/challenge/LobbyChallengeCard';
import { LobbyFilterChips } from '@/components/challenge/LobbyFilterChips';
import { LobbyFilterSheet } from '@/components/challenge/LobbyFilterSheet';
import { LobbySortMenu } from '@/components/challenge/LobbySortMenu';
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
  useEndedChallenges,
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
import { fetchLobbyFriendCounts } from '@/lib/challenges';
import { asCopyTone, copy } from '@/lib/copy';
import {
  applyLobbyFilters,
  clearLobbyFilterChip,
  defaultFiltersForTab,
  defaultLobbyFilterStore,
  effectiveLobbyFilters,
  isDefaultLobbyFilters,
  isEndedLobbyStatus,
  isLobbyActiveParticipantStatus,
  isOfficialLobbyRow,
  loadLobbyFilterStore,
  loadLobbyLayout,
  lobbyFilterBadgeCount,
  lobbyFilterChips,
  lobbyResultLine,
  saveLobbyFilterStore,
  saveLobbyLayout,
  scheduleNeedsTick,
  sortLobbyRows,
  type LobbyFilterState,
  type LobbyFilterStore,
  type LobbyLayout,
  type LobbySort,
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
  { value: 'ended', label: 'Ended' },
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
  const [store, setStore] = useState<LobbyFilterStore>(defaultLobbyFilterStore);
  const [touchedTabs, setTouchedTabs] = useState(() => new Set<LobbyTab>());
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const tone = asCopyTone(profile?.motivation_tone);
  const hostingQuery = useHostingChallenges({
    enabled: tab === 'hosting' || tab === 'official' || !tabReady,
  });
  const activeQuery = useCompetingChallenges({ enabled: tab === 'active' || tab === 'official' || !tabReady });
  const officialQuery = useOfficialDiscoverChallenges({ enabled: tab === 'official' || !tabReady });
  const endedQuery = useEndedChallenges({ enabled: tab === 'ended' });
  const friendsQuery = useFriendsDiscoverChallenges({ enabled: tab === 'active' });
  const mine = useMyChallengeProgress();
  const draftsQuery = useChallengeDrafts();
  const discardDraft = useDiscardChallengeDraft();
  const [query, setQuery] = useState('');

  const prefs = store[tab];
  const filters = prefs.filters;
  const sort = prefs.sort;

  useEffect(() => {
    void Promise.all([loadLobbyLayout(), loadLobbyFilterStore()]).then(([nextLayout, nextStore]) => {
      setLayout(nextLayout);
      setStore(nextStore);
    });
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
    const map = new Map<
      string,
      { days: number; status: string; eliminated?: boolean; result?: string | null; place?: number | null }
    >();
    for (const row of mine.data ?? []) {
      if (!isLobbyActiveParticipantStatus(row.status) && !row.result && !row.place) {
        continue;
      }
      map.set(row.challenge_id, {
        days: Number(row.days_completed ?? 0),
        status: row.status ?? 'joined',
        eliminated: Boolean(row.eliminated_at),
        result: row.result,
        place: row.place,
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
      ]).filter((row) => !isEndedLobbyStatus(row.status)),
    [activeQuery.data, hostingQuery.data, officialQuery.data],
  );

  const activeAll = useMemo(
    () => (activeQuery.data ?? []).filter((row) => !isEndedLobbyStatus(row.status)),
    [activeQuery.data],
  );
  const activeIds = useMemo(() => new Set(activeAll.map((row) => row.id)), [activeAll]);

  const hostingAll = useMemo(
    () => (hostingQuery.data ?? []).filter((row) => !isEndedLobbyStatus(row.status)),
    [hostingQuery.data],
  );
  const hostingIds = useMemo(() => new Set(hostingAll.map((row) => row.id)), [hostingAll]);

  const endedAll = useMemo(
    () => (endedQuery.data ?? []).filter((row) => isEndedLobbyStatus(row.status)),
    [endedQuery.data],
  );

  const friendsAll = useMemo(
    () =>
      (friendsQuery.data ?? []).filter(
        (row) =>
          !progressById.has(row.challenge.id) &&
          !activeIds.has(row.challenge.id) &&
          !hostingIds.has(row.challenge.id) &&
          !isOfficialLobbyRow(row.challenge) &&
          !isEndedLobbyStatus(row.challenge.status) &&
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

  const friendSourceIds = useMemo(
    () =>
      uniqueById([
        ...officialAll,
        ...activeAll,
        ...hostingAll,
        ...endedAll,
        ...friendsAll.map((row) => row.challenge),
      ]).map((row) => row.id),
    [activeAll, endedAll, friendsAll, hostingAll, officialAll],
  );
  const friendCountsQuery = useQuery({
    queryKey: ['lobby-friend-counts', user?.id, friendSourceIds.join(',')],
    enabled: Boolean(user?.id && friendSourceIds.length > 0),
    queryFn: () => fetchLobbyFriendCounts(user!.id, friendSourceIds),
  });
  const friendCounts = friendCountsQuery.data ?? new Map<string, number>();

  useEffect(() => {
    if (tabReady) {
      return;
    }
    const pending =
      (activeQuery.isPending && !activeQuery.data) ||
      (officialQuery.isPending && !officialQuery.data) ||
      (hostingQuery.isPending && !hostingQuery.data);
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

  const filterCtx = useMemo(
    () => ({ nowMs, checkedToday, friendCounts }),
    [checkedToday, friendCounts, nowMs],
  );

  function filtersFor(listTab: LobbyTab, rows: ChallengeWithStats[]) {
    const current = store[listTab].filters;
    if (touchedTabs.has(listTab)) {
      return current;
    }
    return effectiveLobbyFilters(listTab, current, rows, filterCtx);
  }

  function applyList(rows: ChallengeWithStats[], listTab: LobbyTab) {
    const searched = rows.filter((row) => matchesSearch(challengeDisplayTitle(row), search));
    return sortLobbyRows(
      applyLobbyFilters(searched, listTab, filtersFor(listTab, rows), filterCtx),
      store[listTab].sort,
    );
  }

  const official = applyList(officialAll, 'official');
  const active = applyList(activeAll, 'active');
  const hosting = applyList(hostingAll, 'hosting');
  const ended = applyList(endedAll, 'ended');
  const friends = sortLobbyRows(
    applyLobbyFilters(
      friendsAll
        .map((row) => row.challenge)
        .filter((row) => matchesSearch(challengeDisplayTitle(row), search)),
      'active',
      filtersFor('active', friendsAll.map((row) => row.challenge)),
      filterCtx,
    ),
    store.active.sort,
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
    for (const row of [
      ...officialAll,
      ...activeAll,
      ...hostingAll,
      ...endedAll,
      ...friendsAll.map((item) => item.challenge),
    ]) {
      if (row.created_by && row.created_by !== user?.id) {
        ids.add(row.created_by);
      }
    }
    return [...ids];
  }, [activeAll, endedAll, friendsAll, hostingAll, officialAll, user?.id]);
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

  const loading = !tabReady
    ? (officialQuery.isPending && !officialQuery.data) ||
      (activeQuery.isPending && !activeQuery.data) ||
      (hostingQuery.isPending && !hostingQuery.data)
    : tab === 'ended'
      ? endedQuery.isPending && !endedQuery.data
      : tab === 'hosting'
        ? hostingQuery.isPending && !hostingQuery.data
        : tab === 'active'
          ? activeQuery.isPending && !activeQuery.data
          : officialQuery.isPending && !officialQuery.data;
  const failed = !tabReady
    ? officialQuery.isError &&
      activeQuery.isError &&
      !officialQuery.data &&
      !activeQuery.data
    : tab === 'ended'
      ? endedQuery.isError && !endedQuery.data
      : tab === 'hosting'
        ? hostingQuery.isError && !hostingQuery.data
        : tab === 'active'
          ? activeQuery.isError && !activeQuery.data
          : officialQuery.isError && !officialQuery.data;

  const tabRows =
    tab === 'official' ? official : tab === 'active' ? active : tab === 'hosting' ? hosting : ended;
  const ticking = [...tabRows, ...friends].some((row) => scheduleNeedsTick(row, nowMs));

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
    const jobs = [
      officialQuery.refetch(),
      activeQuery.refetch(),
      mine.refetch(),
      draftsQuery.refetch(),
      todayCheckins.refetch(),
      friendCountsQuery.refetch(),
    ];
    if (tab === 'hosting') {
      jobs.push(hostingQuery.refetch());
    }
    if (tab === 'ended') {
      jobs.push(endedQuery.refetch());
    }
    if (tab === 'active') {
      jobs.push(friendsQuery.refetch());
    }
    await Promise.all(jobs);
  }

  function onLayoutChange(next: LobbyLayout) {
    setLayout(next);
    void saveLobbyLayout(next);
  }

  function persistStore(next: LobbyFilterStore) {
    setStore(next);
    void saveLobbyFilterStore(next);
  }

  function markFiltersTouched() {
    setTouchedTabs((prev) => {
      if (prev.has(tab)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }

  function onFiltersChange(next: LobbyFilterState) {
    markFiltersTouched();
    setStore({ ...store, [tab]: { ...prefs, filters: next } });
  }

  function onFiltersCommit(next: LobbyFilterState) {
    markFiltersTouched();
    persistStore({ ...store, [tab]: { ...prefs, filters: next } });
  }

  function onFilterDone() {
    void saveLobbyFilterStore(store);
  }

  function onSortChange(next: LobbySort) {
    persistStore({ ...store, [tab]: { ...prefs, sort: next } });
  }

  function onClearFilters() {
    onFiltersCommit(defaultFiltersForTab(tab));
  }

  const rawForTab =
    tab === 'official' ? officialAll : tab === 'active' ? activeAll : tab === 'hosting' ? hostingAll : endedAll;
  const displayFilters = filtersFor(tab, rawForTab);
  const chips = lobbyFilterChips(tab, displayFilters);
  const badge = lobbyFilterBadgeCount(tab, displayFilters);
  const filtersDefault = isDefaultLobbyFilters(tab, displayFilters);

  useEffect(() => {
    if (touchedTabs.has(tab) || rawForTab.length === 0) {
      return;
    }
    if (JSON.stringify(displayFilters) === JSON.stringify(filters)) {
      return;
    }
    persistStore({ ...store, [tab]: { ...prefs, filters: displayFilters } });
  }, [displayFilters, filters, prefs, rawForTab.length, store, tab, touchedTabs]);
  const tabEmpty =
    tabRows.length === 0 &&
    (tab !== 'active' || friends.length === 0) &&
    (tab !== 'hosting' || visibleDrafts.length === 0);

  function emptyCopy() {
    if (!filtersDefault) {
      return { title: 'Nothing matches these filters.', action: 'Clear filters', onAction: onClearFilters };
    }
    if (tab === 'hosting') {
      return {
        title: 'You’re not hosting yet.',
        action: user ? 'Create' : undefined,
        onAction: user ? () => router.push('/challenges/create') : undefined,
      };
    }
    if (tab === 'active') {
      return { title: 'No active challenges yet.' };
    }
    if (tab === 'ended') {
      return { title: 'No ended challenges yet.' };
    }
    return { title: copy('lobby.empty', tone) };
  }

  const empty = emptyCopy();

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
          accessibilityLabel={badge > 0 ? `Filters, ${badge} on` : 'Filters'}
          onPress={() => setFilterOpen(true)}
          hitSlop={6}
          style={{ minHeight: 36, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AppText
            className="text-[13px] font-semibold"
            style={{ color: badge > 0 ? THEME.accent : THEME.textMuted }}>
            Filters
          </AppText>
          {badge > 0 ? (
            <View
              style={{
                minWidth: 18,
                height: 18,
                paddingHorizontal: 5,
                borderRadius: 999,
                backgroundColor: THEME.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <AppText className="text-[11px] font-extrabold" style={{ color: THEME.primaryForeground }}>
                {badge}
              </AppText>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sort"
          onPress={() => setSortOpen(true)}
          hitSlop={6}
          style={{ minHeight: 36, justifyContent: 'center' }}>
          <AppText className="text-[13px] font-semibold" style={{ color: THEME.textMuted }}>
            Sort
          </AppText>
        </Pressable>
      </View>

      <LobbyFilterChips chips={chips} onDismiss={(id) => onFiltersCommit(clearLobbyFilterChip(displayFilters, id))} />

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
                (officialQuery.isRefetching ||
                  activeQuery.isRefetching ||
                  (tab === 'hosting' && hostingQuery.isRefetching) ||
                  (tab === 'ended' && endedQuery.isRefetching) ||
                  (tab === 'active' && friendsQuery.isRefetching)) &&
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
              title={empty.title}
              actionLabel={empty.action}
              onAction={empty.onAction}
              compact
            />
          ) : (
            <View style={{ gap: 10 }}>
              {tab === 'active' && friends.length > 0 ? (
                <View style={{ gap: 10 }}>
                  <AppText className="text-[13px] font-semibold" style={{ color: THEME.textMuted }}>
                    From friends
                  </AppText>
                  {friends.map((challenge) => (
                    <LobbyListCard
                      key={challenge.id}
                      challenge={challenge}
                      section="active"
                      layout={layout}
                      nowMs={nowMs}
                      currentUserId={user?.id}
                      progress={progressById.get(challenge.id)}
                      checkedInToday={checkedToday.has(challenge.id)}
                      host={
                        (challenge.created_by && hostById.get(challenge.created_by)) || null
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
                  section={tab}
                  layout={layout}
                  nowMs={nowMs}
                  currentUserId={user?.id}
                  progress={progressById.get(challenge.id)}
                  checkedInToday={checkedToday.has(challenge.id)}
                  host={
                    challenge.created_by === user?.id
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
      <LobbyFilterSheet
        visible={filterOpen}
        tab={tab}
        filters={filters}
        onChange={onFiltersChange}
        onDone={onFilterDone}
        onClose={() => setFilterOpen(false)}
      />
      <LobbySortMenu
        visible={sortOpen}
        tab={tab}
        value={sort}
        onChange={onSortChange}
        onClose={() => setSortOpen(false)}
      />
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
  checkedInToday,
  host,
  onPress,
}: {
  challenge: ChallengeWithStats;
  section: LobbyTab;
  layout: LobbyLayout;
  nowMs: number;
  currentUserId?: string;
  progress?: { days: number; status: string; eliminated?: boolean; result?: string | null; place?: number | null };
  checkedInToday?: boolean;
  host?: InviteHost | null;
  onPress: (id: string, snapshot?: ChallengeWithStats) => void;
}) {
  const hosting = Boolean(currentUserId && challenge.created_by === currentUserId);
  const resultLine =
    section === 'ended' && progress
      ? lobbyResultLine({ result: progress.result, place: progress.place })
      : null;
  function open() {
    if (!challenge.id) {
      return;
    }
    onPress(challenge.id, challenge);
  }
  if (layout === 'list') {
    return (
      <LobbyChallengeRow
        challenge={challenge}
        nowMs={nowMs}
        resultLine={resultLine}
        forceEnded={section === 'ended'}
        onPress={open}
      />
    );
  }
  return (
    <LobbyChallengeCard
      challenge={challenge}
      theme={challenge.is_official ? 'official' : 'user'}
      context="lobby"
      section={section === 'ended' ? 'ended' : section === 'official' ? 'official' : section === 'hosting' ? 'hosting' : 'active'}
      joined={Boolean(progress)}
      hosting={hosting}
      eliminated={Boolean(progress?.eliminated)}
      host={host}
      resultLine={resultLine}
      checkedInToday={checkedInToday}
      onPress={open}
    />
  );
}
