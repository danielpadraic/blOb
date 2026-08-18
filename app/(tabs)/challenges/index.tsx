import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, TextInput, View } from 'react-native';

import { ChallengeCarousel, type CarouselSocialProof } from '@/components/challenge/ChallengeCarousel';
import { ContinueDraftCard } from '@/components/challenge/create/wizardUi';
import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
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
import { isVisibleDraft } from '@/lib/challengeDraft';
import { THEME } from '@/lib/theme';
import { challengeDetailHref } from '@/lib/routes';
import { asCopyTone, copy } from '@/lib/copy';
import { fetchPublicProfilesByIds, personDisplayName } from '@/lib/social';
import { useQuery } from '@tanstack/react-query';

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

export default function ChallengesScreen() {
  const router = useRouter();
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

  const drafts = (draftsQuery.data ?? []).filter(isVisibleDraft);
  const search = query.trim();
  const hosting = (hostingQuery.data ?? []).filter((row) => matchesSearch(row.title, search));
  const active = (activeQuery.data ?? []).filter((row) => matchesSearch(row.title, search));
  const official = (officialQuery.data ?? []).filter((row) => matchesSearch(row.title, search));
  const friends = (friendsQuery.data ?? []).filter((row) => matchesSearch(row.challenge.title, search));
  const friendIds = useMemo(
    () => [...new Set(friends.map((row) => row.friendId))],
    [friends],
  );
  const friendProfiles = useQuery({
    queryKey: ['lobby-friend-proof-profiles', friendIds.join(',')],
    enabled: friendIds.length > 0,
    queryFn: () => fetchPublicProfilesByIds(friendIds),
  });
  const socialProofById = useMemo(() => {
    const map = new Map<string, CarouselSocialProof>();
    const byId = new Map((friendProfiles.data ?? []).map((row) => [row.id, row]));
    for (const row of friends) {
      const person = byId.get(row.friendId);
      map.set(row.challenge.id, {
        name: personDisplayName(person ?? { username: 'blob', display_name: null }),
        avatarUrl: person?.avatar_url,
        kind: row.kind,
      });
    }
    return map;
  }, [friendProfiles.data, friends]);
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
  const empty =
    hosting.length === 0 &&
    active.length === 0 &&
    official.length === 0 &&
    friends.length === 0 &&
    drafts.length === 0;

  function openChallenge(id: string) {
    if (!id) {
      return;
    }
    router.push(challengeDetailHref(id, 'lobby'));
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

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} className="px-4 pt-1">
      <AppHeader title="Lobby" subtitle={copy('lobby.subtitle')} />

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

      {user && drafts.length > 0 ? (
        <View className="mt-3 gap-2">
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

      {loading ? (
        <MascotState kind="loading" title={copy('lobby.loading', tone)} />
      ) : failed ? (
        <MascotState
          kind="error"
          title={copy('lobby.unreachable')}
          actionLabel="Retry"
          onAction={() => void onRefresh()}
        />
      ) : empty ? (
        <MascotState
          kind="empty"
          title={copy('lobby.empty', tone)}
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
          <ChallengeCarousel
            title={copy('lobby.railHosting')}
            challenges={hosting}
            currentUserId={user?.id}
            progressById={progressById}
            onPress={openChallenge}
          />
          <ChallengeCarousel
            title={copy('lobby.railActive')}
            challenges={active}
            currentUserId={user?.id}
            progressById={progressById}
            onPress={openChallenge}
          />
          <ChallengeCarousel
            title={copy('lobby.railOfficial')}
            challenges={official}
            currentUserId={user?.id}
            progressById={progressById}
            onPress={openChallenge}
          />
          <ChallengeCarousel
            title={copy('lobby.railFriends')}
            challenges={friends.map((row) => row.challenge)}
            currentUserId={user?.id}
            progressById={progressById}
            socialProofById={socialProofById}
            onPress={openChallenge}
          />
        </ScrollView>
      )}
    </Screen>
  );
}
