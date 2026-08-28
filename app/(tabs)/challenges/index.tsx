import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';

import { remainingFromChallenge } from '@/components/challenge/ChallengePosterCard';
import { LobbyChallengeCard, type InviteHost } from '@/components/challenge/LobbyChallengeCard';
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
import { useChallengeDrafts, useDiscardChallengeDraft } from '@/hooks/useChallengeDraft';
import { createHrefForDraft, isVisibleDraft } from '@/lib/challengeDraft';
import { isJoinableNotStarted } from '@/lib/challengeDiscoverability';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { isOfficialChallenge } from '@/lib/official';
import { THEME, themeShadow } from '@/lib/theme';
import { AppText } from '@/components/ui/AppText';
import { openChallengeLobby } from '@/lib/challengeOpen';
import { asCopyTone, copy } from '@/lib/copy';
import { fetchPublicProfilesByIds, personDisplayName } from '@/lib/social';
import type { ChallengeWithStats } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';

const LOBBY_TABS = [
  { value: 'official', label: 'Official' },
  { value: 'active', label: 'Active' },
  { value: 'hosting', label: 'Hosting' },
] as const;

type LobbyTab = (typeof LOBBY_TABS)[number]['value'];

function isLobbyParticipant(status: string | null | undefined) {
  const value = status ?? 'joined';
  return value === 'joined' || value === 'active' || value === 'completed';
}

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

export default function ChallengesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ notice?: string }>();
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<LobbyTab>('official');
  const [tabReady, setTabReady] = useState(false);
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
      if (!isLobbyParticipant(row.status)) {
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

  const hostingAll = useMemo(() => {
    const hosted = new Map<string, ChallengeWithStats>();
    for (const row of hostingQuery.data ?? []) {
      hosted.set(row.id, row);
    }
    for (const row of activeQuery.data ?? []) {
      if (user?.id && row.created_by === user.id) {
        hosted.set(row.id, row);
      }
    }
    return uniqueById([...hosted.values()]);
  }, [activeQuery.data, hostingQuery.data, user?.id]);
  const hostingIds = useMemo(() => new Set(hostingAll.map((row) => row.id)), [hostingAll]);

  const officialAll = useMemo(() => {
    const joinedOfficial = (activeQuery.data ?? []).filter(
      (row) => isOfficialChallenge(row) && !hostingIds.has(row.id),
    );
    const discover = (officialQuery.data ?? []).filter((row) => !hostingIds.has(row.id));
    return uniqueById([...discover, ...joinedOfficial]);
  }, [activeQuery.data, hostingIds, officialQuery.data]);

  const activeAll = useMemo(
    () =>
      (activeQuery.data ?? []).filter(
        (row) => !isOfficialChallenge(row) && !hostingIds.has(row.id),
      ),
    [activeQuery.data, hostingIds],
  );
  const activeIds = useMemo(() => new Set(activeAll.map((row) => row.id)), [activeAll]);

  const friendsAll = useMemo(
    () =>
      (friendsQuery.data ?? []).filter(
        (row) =>
          !progressById.has(row.challenge.id) &&
          !activeIds.has(row.challenge.id) &&
          !hostingIds.has(row.challenge.id) &&
          !isOfficialChallenge(row.challenge) &&
          isLobbyDiscoverCard(row.challenge, false),
      ),
    [activeIds, friendsQuery.data, hostingIds, progressById],
  );

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

  const official = officialAll.filter((row) => matchesSearch(challengeDisplayTitle(row), search));
  const active = activeAll.filter((row) => matchesSearch(challengeDisplayTitle(row), search));
  const hosting = hostingAll.filter((row) => matchesSearch(challengeDisplayTitle(row), search));
  const friends = friendsAll.filter((row) =>
    matchesSearch(challengeDisplayTitle(row.challenge), search),
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
    (hostingQuery.isPending && !hostingQuery.data) &&
    (activeQuery.isPending && !activeQuery.data) &&
    (officialQuery.isPending && !officialQuery.data);
  const failed =
    hostingQuery.isError &&
    activeQuery.isError &&
    officialQuery.isError &&
    !hostingQuery.data &&
    !activeQuery.data &&
    !officialQuery.data;

  function openChallenge(id: string, snapshot?: ChallengeWithStats) {
    openChallengeLobby(router, { id, snapshot, returnTo: 'lobby' });
  }

  async function onRefresh() {
    await Promise.all([
      hostingQuery.refetch(),
      activeQuery.refetch(),
      officialQuery.refetch(),
      friendsQuery.refetch(),
      mine.refetch(),
      draftsQuery.refetch(),
    ]);
  }

  const tabRows =
    tab === 'official' ? official : tab === 'active' ? active : hosting;
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
          className="mt-4 flex-1"
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

function hostByIdHas(map: Map<string, InviteHost>, id?: string | null) {
  return Boolean(id && map.has(id));
}

function LobbyListCard({
  challenge,
  section,
  currentUserId,
  progress,
  host,
  onPress,
}: {
  challenge: ChallengeWithStats;
  section: 'official' | 'active' | 'hosting';
  currentUserId?: string;
  progress?: { days: number; status: string; eliminated?: boolean };
  host?: InviteHost | null;
  onPress: (id: string, snapshot?: ChallengeWithStats) => void;
}) {
  const hosting = Boolean(currentUserId && challenge.created_by === currentUserId);
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
      onPress={() => {
        if (!challenge.id) {
          return;
        }
        onPress(challenge.id, challenge);
      }}
    />
  );
}
