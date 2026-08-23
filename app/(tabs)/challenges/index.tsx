import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { RefreshControl, ScrollView, TextInput, View } from 'react-native';

import { CancelChallengeSheet } from '@/components/challenge/CancelChallengeSheet';
import { ChallengeCarousel, type CarouselSocialProof } from '@/components/challenge/ChallengeCarousel';
import {
  ChallengeMenuPopover,
  type MenuAnchor,
} from '@/components/challenge/ChallengeOverflowMenu';
import { remainingFromChallenge } from '@/components/challenge/ChallengePosterCard';
import { ContinueDraftCard } from '@/components/challenge/create/wizardUi';
import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { AppHeader } from '@/components/wallet/AppHeader';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import {
  useCancelChallenge,
  useCompetingChallenges,
  useFriendsDiscoverChallenges,
  useHostingChallenges,
  useMyChallengeProgress,
  useOfficialDiscoverChallenges,
} from '@/hooks/useChallenge';
import { useChallengeDrafts, useDiscardChallengeDraft } from '@/hooks/useChallengeDraft';
import { isVisibleDraft } from '@/lib/challengeDraft';
import { isJoinableNotStarted } from '@/lib/challengeDiscoverability';
import { isOfficialAccount } from '@/lib/official';
import { THEME, themeShadow } from '@/lib/theme';
import { AppText } from '@/components/ui/AppText';
import { challengeDetailHref } from '@/lib/routes';
import { asCopyTone, copy } from '@/lib/copy';
import { fetchPublicProfilesByIds, personDisplayName } from '@/lib/social';
import { getCancelChallengeMessage } from '@/utils/errors';
import type { ChallengeWithStats } from '@/lib/types';
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

export default function ChallengesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ notice?: string }>();
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const [toast, setToast] = useState<string | null>(null);
  const [overflow, setOverflow] = useState<{
    challenge: ChallengeWithStats;
    anchor: MenuAnchor;
  } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ChallengeWithStats | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const tone = asCopyTone(profile?.motivation_tone);
  const cancelChallenge = useCancelChallenge();
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
  const hosting = (hostingQuery.data ?? []).filter(
    (row) => matchesSearch(row.title, search) && !progressById.has(row.id),
  );
  const active = (activeQuery.data ?? []).filter((row) => matchesSearch(row.title, search));
  const official = (officialQuery.data ?? []).filter(
    (row) =>
      matchesSearch(row.title, search) &&
      !progressById.has(row.id) &&
      (row.status === 'filling' || row.status === 'arming'),
  );
  const friends = (friendsQuery.data ?? []).filter(
    (row) =>
      matchesSearch(row.challenge.title, search) &&
      !progressById.has(row.challenge.id) &&
      isLobbyDiscoverCard(row.challenge, false),
  );
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
            title={copy('lobby.railOfficial')}
            challenges={official}
            currentUserId={user?.id}
            progressById={progressById}
            onPress={openChallenge}
            allowCancel
            official={isOfficialAccount(profile)}
            onOverflow={(challenge, anchor) =>
              setOverflow((current) => (current ? null : { challenge, anchor }))
            }
          />
          <ChallengeCarousel
            title={copy('lobby.railActive')}
            challenges={active}
            currentUserId={user?.id}
            progressById={progressById}
            onPress={openChallenge}
            showStateTags
            allowCancel
            official={isOfficialAccount(profile)}
            onOverflow={(challenge, anchor) =>
              setOverflow((current) => (current ? null : { challenge, anchor }))
            }
          />
          <ChallengeCarousel
            title={copy('lobby.railFriends')}
            challenges={friends.map((row) => row.challenge)}
            currentUserId={user?.id}
            progressById={progressById}
            socialProofById={socialProofById}
            onPress={openChallenge}
          />
          <ChallengeCarousel
            title={copy('lobby.railHosting')}
            challenges={hosting}
            currentUserId={user?.id}
            progressById={progressById}
            onPress={openChallenge}
            allowCancel
            official={isOfficialAccount(profile)}
            onOverflow={(challenge, anchor) =>
              setOverflow((current) => (current ? null : { challenge, anchor }))
            }
          />
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
      <ChallengeMenuPopover
        anchor={overflow?.anchor ?? null}
        onClose={() => setOverflow(null)}
        actions={
          overflow
            ? [
                {
                  key: 'cancel',
                  label: isOfficialAccount(profile) ? copy('challenge.delete') : copy('challenge.cancel'),
                  danger: true,
                  onPress: () => {
                    setCancelError(null);
                    setCancelTarget(overflow.challenge);
                  },
                },
              ]
            : []
        }
      />
      {cancelTarget ? (
        <CancelChallengeSheet
          visible
          challenge={cancelTarget}
          loading={cancelChallenge.isPending}
          error={cancelError}
          onClose={() => {
            if (cancelChallenge.isPending) {
              return;
            }
            setCancelTarget(null);
          }}
          onConfirm={() => {
            if (cancelChallenge.isPending) {
              return;
            }
            setCancelError(null);
            cancelChallenge.mutate(cancelTarget.id, {
              onSuccess: () => {
                setCancelTarget(null);
                setToast(copy('challenge.cancelledToast'));
                setTimeout(() => setToast(null), 2200);
              },
              onError: (error) => {
                setCancelError(getCancelChallengeMessage(error));
              },
            });
          }}
        />
      ) : null}
    </Screen>
  );
}
