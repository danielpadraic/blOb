import { useMemo, useRef, useState, type RefObject } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { MascotState } from '@/components/mascot/MascotState';
import { FriendCard } from '@/components/social/FriendCard';
import { FriendRequestCard } from '@/components/social/FriendRequestCard';
import { FriendsHeader } from '@/components/social/FriendsHeader';
import { UserSearchResult } from '@/components/social/UserSearchResult';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AppText } from '@/components/ui/AppText';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useAuth } from '@/hooks/useAuth';
import {
  useAcceptFriendRequest,
  useConversations,
  useFollowUser,
  useFollowing,
  useFriendRequests,
  useFriends,
  useGetOrCreateConversation,
  usePeopleSearch,
  useRejectFriendRequest,
  useSendFriendRequest,
} from '@/hooks/useSocial';
import { conversationHref, MESSAGES_HREF } from '@/lib/routes';
import {
  detectPeopleSearch,
  otherFriendshipUserId,
  peopleRelation,
  type PeopleRelation,
} from '@/lib/social';
import { THEME } from '@/lib/theme';
import type { PublicProfile } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

const SEGMENTS = [
  { value: 'friends', label: 'Friends' },
  { value: 'requests', label: 'Requests' },
  { value: 'search', label: 'Find' },
] as const;

type FriendsSegment = (typeof SEGMENTS)[number]['value'];

export default function FriendsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [segment, setSegment] = useState<FriendsSegment>('friends');
  const [query, setQuery] = useState('');
  const searchRef = useRef<TextInput>(null);

  const friendsQuery = useFriends();
  const requestsQuery = useFriendRequests();
  const followingQuery = useFollowing();
  const searchQuery = usePeopleSearch(query);

  const followUser = useFollowUser();
  const sendRequest = useSendFriendRequest();
  const acceptRequest = useAcceptFriendRequest();
  const rejectRequest = useRejectFriendRequest();
  const startChat = useGetOrCreateConversation();
  const conversations = useConversations();
  const unreadMessages = (conversations.data ?? []).filter((row) => row.unread).length;

  const friends = friendsQuery.data ?? [];
  const incoming = requestsQuery.data?.incoming ?? [];
  const outgoing = requestsQuery.data?.outgoing ?? [];
  const requestCount = incoming.length + outgoing.length;

  const graph = useMemo(() => {
    const friendIds = new Set(
      friends.map((row) => otherFriendshipUserId(row, user?.id ?? '')).filter(Boolean),
    );
    const incomingIds = new Set(
      incoming.map((row) => otherFriendshipUserId(row, user?.id ?? '')).filter(Boolean),
    );
    const outgoingIds = new Set(
      outgoing.map((row) => otherFriendshipUserId(row, user?.id ?? '')).filter(Boolean),
    );
    const followingIds = new Set((followingQuery.data ?? []).map((row) => row.following_id));
    return { friendIds, incomingIds, outgoingIds, followingIds };
  }, [friends, incoming, outgoing, followingQuery.data, user?.id]);

  const parsedSearch = detectPeopleSearch(query);
  const results = parsedSearch ? (searchQuery.data ?? []) : [];
  const busyId =
    followUser.variables ??
    sendRequest.variables ??
    acceptRequest.variables ??
    rejectRequest.variables ??
    startChat.variables ??
    null;
  const actionPending =
    followUser.isPending ||
    sendRequest.isPending ||
    acceptRequest.isPending ||
    rejectRequest.isPending;

  const segments = useMemo(
    () =>
      SEGMENTS.map((option) =>
        option.value === 'requests' && incoming.length > 0
          ? { ...option, label: `Requests · ${incoming.length}` }
          : option,
      ),
    [incoming.length],
  );

  function goFind() {
    setSegment('search');
    setTimeout(() => searchRef.current?.focus(), 80);
  }

  function fail(error: unknown, title: string) {
    Alert.alert(title, getErrorMessage(error));
  }

  async function onMessage(targetUserId: string) {
    try {
      const conversation = await startChat.mutateAsync(targetUserId);
      router.push(conversationHref(conversation.id));
    } catch (error) {
      fail(error, 'Couldn’t open that chat');
    }
  }

  function onSearchPrimary(profile: PublicProfile, relation: PeopleRelation) {
    if (relation === 'friends') {
      router.push({ pathname: '/friends/u/[username]', params: { username: profile.username } });
      return;
    }
    if (relation === 'none') {
      followUser.mutate(profile.id, {
        onError: (error) => fail(error, 'Couldn’t follow'),
      });
      return;
    }
    if (relation === 'following') {
      sendRequest.mutate(profile.id, {
        onError: (error) => fail(error, 'Couldn’t send that request'),
      });
      return;
    }
    if (relation === 'requested') {
      rejectRequest.mutate(profile.id, {
        onError: (error) => fail(error, 'Couldn’t cancel that request'),
      });
      return;
    }
    if (relation === 'incoming') {
      acceptRequest.mutate(profile.id, {
        onError: (error) => fail(error, 'Couldn’t accept that request'),
      });
    }
  }

  const refreshing =
    (friendsQuery.isRefetching && !friendsQuery.isLoading) ||
    (requestsQuery.isRefetching && !requestsQuery.isLoading);

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} className="px-4 pt-1">
      <FriendsHeader
        friendCount={friends.length}
        requestCount={requestCount}
        unreadMessages={unreadMessages}
        onPressSearch={goFind}
        onPressMessages={() => router.push(MESSAGES_HREF)}
      />
      <SegmentedControl
        value={segment}
        options={segments}
        onChange={setSegment}
        accessibilityLabel="Friends sections"
      />

      {segment === 'friends' ? (
        <FriendsPane
          loading={friendsQuery.isLoading}
          error={friendsQuery.error instanceof Error ? friendsQuery.error.message : null}
          friends={friends}
          refreshing={refreshing}
          userId={user?.id}
          messagingId={startChat.isPending ? startChat.variables ?? null : null}
          onRefresh={() => {
            void friendsQuery.refetch();
            void requestsQuery.refetch();
          }}
          onRetry={() => void friendsQuery.refetch()}
          onFind={goFind}
          onMessage={(friend) => onMessage(otherFriendshipUserId(friend, user?.id ?? ''))}
        />
      ) : null}

      {segment === 'requests' ? (
        <RequestsPane
          loading={requestsQuery.isLoading}
          error={requestsQuery.error instanceof Error ? requestsQuery.error.message : null}
          incoming={incoming}
          outgoing={outgoing}
          userId={user?.id}
          busyId={actionPending ? busyId : null}
          onRetry={() => void requestsQuery.refetch()}
          onFind={goFind}
          onAccept={(id) =>
            acceptRequest.mutate(id, {
              onError: (error) => fail(error, 'Couldn’t accept that request'),
            })
          }
          onDecline={(id) =>
            rejectRequest.mutate(id, {
              onError: (error) => fail(error, 'Couldn’t decline that request'),
            })
          }
          onCancel={(id) =>
            rejectRequest.mutate(id, {
              onError: (error) => fail(error, 'Couldn’t cancel that request'),
            })
          }
        />
      ) : null}

      {segment === 'search' ? (
        <SearchPane
          query={query}
          inputRef={searchRef}
          loading={searchQuery.isFetching && Boolean(parsedSearch)}
          results={results}
          userId={user?.id}
          graph={graph}
          busyId={actionPending ? busyId : null}
          onChangeQuery={setQuery}
          onPrimary={onSearchPrimary}
        />
      ) : null}
    </Screen>
  );
}

function FriendsPane({
  loading,
  error,
  friends,
  refreshing,
  userId,
  messagingId,
  onRefresh,
  onRetry,
  onFind,
  onMessage,
}: {
  loading: boolean;
  error: string | null;
  friends: ReturnType<typeof useFriends>['data'];
  refreshing: boolean;
  userId?: string;
  messagingId: string | null;
  onRefresh: () => void;
  onRetry: () => void;
  onFind: () => void;
  onMessage: (friend: NonNullable<ReturnType<typeof useFriends>['data']>[number]) => void;
}) {
  if (loading) {
    return <MascotState kind="loading" title="Gathering your people" compact />;
  }
  if (error) {
    return (
      <MascotState
        kind="error"
        title="Couldn’t load friends"
        body={error}
        actionLabel="Retry"
        onAction={onRetry}
        compact
      />
    );
  }
  if (!friends || friends.length === 0) {
    return (
      <MascotState
        kind="empty"
        title="No friends yet"
        body="Go compete with someone — a challenge is the fastest way to make a friend here."
        actionLabel="Find people"
        onAction={onFind}
        compact
      />
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-3 pb-4 pt-4"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.accent} />
      }>
      {friends.map((friend) => {
        const otherId = userId ? otherFriendshipUserId(friend, userId) : (friend.profile?.id ?? '');
        return (
          <FriendCard
            key={`${friend.user_a_id}-${friend.user_b_id}`}
            friend={friend}
            messaging={messagingId === otherId}
            onMessage={() => onMessage(friend)}
          />
        );
      })}
    </ScrollView>
  );
}

function RequestsPane({
  loading,
  error,
  incoming,
  outgoing,
  userId,
  busyId,
  onRetry,
  onFind,
  onAccept,
  onDecline,
  onCancel,
}: {
  loading: boolean;
  error: string | null;
  incoming: NonNullable<ReturnType<typeof useFriendRequests>['data']>['incoming'];
  outgoing: NonNullable<ReturnType<typeof useFriendRequests>['data']>['outgoing'];
  userId?: string;
  busyId: string | null;
  onRetry: () => void;
  onFind: () => void;
  onAccept: (userId: string) => void;
  onDecline: (userId: string) => void;
  onCancel: (userId: string) => void;
}) {
  if (loading) {
    return <MascotState kind="loading" title="Checking requests" compact />;
  }
  if (error) {
    return (
      <MascotState
        kind="error"
        title="Couldn’t load requests"
        body={error}
        actionLabel="Retry"
        onAction={onRetry}
        compact
      />
    );
  }
  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <MascotState
        kind="empty"
        title="You’re all caught up"
        body="No pending requests. Find someone in the Lobby and send a request after you compete."
        actionLabel="Find people"
        onAction={onFind}
        compact
      />
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-3 pb-4 pt-4"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {incoming.length > 0 ? (
        <View className="gap-3">
          <AppText className="text-[13px] font-semibold text-muted">Incoming</AppText>
          {incoming.map((request) => {
            const otherId = userId
              ? otherFriendshipUserId(request, userId)
              : request.requested_by;
            return (
              <FriendRequestCard
                key={`${request.user_a_id}-${request.user_b_id}`}
                request={request}
                direction="incoming"
                busy={busyId === otherId}
                onAccept={() => onAccept(otherId)}
                onDecline={() => onDecline(otherId)}
              />
            );
          })}
        </View>
      ) : null}
      {outgoing.length > 0 ? (
        <View className="gap-3">
          <AppText className="text-[13px] font-semibold text-muted">Sent</AppText>
          {outgoing.map((request) => {
            const otherId = userId
              ? otherFriendshipUserId(request, userId)
              : request.profile?.id ?? '';
            return (
              <FriendRequestCard
                key={`${request.user_a_id}-${request.user_b_id}`}
                request={request}
                direction="outgoing"
                busy={busyId === otherId}
                onCancel={() => onCancel(otherId)}
              />
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

function SearchPane({
  query,
  inputRef,
  loading,
  results,
  userId,
  graph,
  busyId,
  onChangeQuery,
  onPrimary,
}: {
  query: string;
  inputRef: RefObject<TextInput | null>;
  loading: boolean;
  results: PublicProfile[];
  userId?: string;
  graph: {
    friendIds: Set<string>;
    incomingIds: Set<string>;
    outgoingIds: Set<string>;
    followingIds: Set<string>;
  };
  busyId: string | null;
  onChangeQuery: (value: string) => void;
  onPrimary: (profile: PublicProfile, relation: PeopleRelation) => void;
}) {
  const parsed = detectPeopleSearch(query);
  const term = query.trim();
  const hint =
    parsed?.kind === 'email'
      ? 'Exact email match only — we never search partial emails.'
      : parsed?.kind === 'phone'
        ? 'Exact phone match only — we never search partial numbers.'
        : null;

  return (
    <View className="flex-1 pt-4">
      <Input
        ref={inputRef}
        value={query}
        onChangeText={onChangeQuery}
        placeholder="Name, @username, email, or phone"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="default"
        returnKeyType="search"
      />
      {hint ? (
        <AppText className="mt-2 text-[12px] text-muted">{hint}</AppText>
      ) : null}
      {loading ? <ActivityIndicator className="mt-4" color={THEME.accent} /> : null}
      {term.length > 0 && !parsed ? (
        <AppText className="mt-3 text-[13px] text-muted">
          {term.includes('@')
            ? 'Enter the full email for an exact match.'
            : /^\+?[\d().\-\s]+$/.test(term)
              ? 'Enter the full phone number for an exact match.'
              : 'Type two characters to search.'}
        </AppText>
      ) : null}
      {parsed && !loading && results.length === 0 ? (
        <MascotState
          kind="empty"
          title="No blobs match that"
          body={
            parsed.kind === 'name'
              ? 'Try a username, display name, or the full email or phone.'
              : 'Email and phone only match exactly. Check the spelling, or search by name instead.'
          }
          compact
        />
      ) : null}
      {!term && !loading ? (
        <MascotState
          kind="empty"
          title="Find your people"
          body="Search by name or @username, or paste a full email or phone number."
          compact
        />
      ) : null}
      {results.length > 0 ? (
        <ScrollView
          className="mt-3 flex-1"
          contentContainerClassName="gap-3 pb-4"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {results.map((profile) => {
            const relation = peopleRelation({
              userId,
              targetId: profile.id,
              ...graph,
            });
            return (
              <UserSearchResult
                key={profile.id}
                profile={profile}
                relation={relation}
                busy={busyId === profile.id}
                onPrimary={() => onPrimary(profile, relation)}
              />
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}
