import { useMemo, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
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
  useFollowing,
  useFriendRequests,
  useFriends,
  useGetOrCreateConversation,
  usePeopleSearch,
  useRejectFriendRequest,
  useSendFriendRequest,
} from '@/hooks/useSocial';
import { useCopyTone } from '@/hooks/useCopy';
import { copy } from '@/lib/copy';
import { isOfficialAccount } from '@/lib/official';
import { conversationHref } from '@/lib/routes';
import {
  detectPeopleSearch,
  otherFriendshipUserId,
  peopleRelation,
  type FriendEdge,
  type PeopleRelation,
} from '@/lib/social';
import { TAB_BAR_CONTENT_INSET, THEME } from '@/lib/theme';
import type { PublicProfile } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

const SEGMENTS = [
  { value: 'friends', label: 'Friends' },
  { value: 'requests', label: 'Requests' },
  { value: 'search', label: 'Find' },
] as const;

type FriendsSegment = (typeof SEGMENTS)[number]['value'];

const PANE_FILL: ViewStyle = { flex: 1, minHeight: 0, overflow: 'visible' };

const PANE_SCROLL: StyleProp<ViewStyle> =
  Platform.OS === 'web'
    ? ({ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } as object as ViewStyle)
    : { flex: 1, minHeight: 0 };

const PANE_CONTENT = {
  paddingTop: 16,
  paddingBottom: TAB_BAR_CONTENT_INSET,
  gap: 12,
};

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

  const sendRequest = useSendFriendRequest();
  const acceptRequest = useAcceptFriendRequest();
  const rejectRequest = useRejectFriendRequest();
  const startChat = useGetOrCreateConversation();

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
    sendRequest.variables ??
    acceptRequest.variables ??
    rejectRequest.variables ??
    startChat.variables ??
    null;
  const actionPending =
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
    if (isOfficialAccount(profile) || relation === 'friends') {
      router.push({ pathname: '/friends/u/[username]', params: { username: profile.username } });
      return;
    }
    if (relation === 'none' || relation === 'following') {
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
      />
      <SegmentedControl
        value={segment}
        options={segments}
        onChange={setSegment}
        accessibilityLabel="Friends sections"
      />

      <View style={PANE_FILL}>
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
      </View>
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
  friends: FriendEdge[];
  refreshing: boolean;
  userId?: string;
  messagingId: string | null;
  onRefresh: () => void;
  onRetry: () => void;
  onFind: () => void;
  onMessage: (friend: FriendEdge) => void;
}) {
  const tone = useCopyTone();
  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.accent} />
  );

  if (loading) {
    return (
      <PaneScroll refreshControl={refreshControl}>
        <MascotState kind="loading" title={copy('friends.loading', tone)} compact />
      </PaneScroll>
    );
  }
  if (error) {
    return (
      <PaneScroll refreshControl={refreshControl}>
        <MascotState
          kind="error"
          title="Couldn’t load friends"
          body={error}
          actionLabel="Retry"
          onAction={onRetry}
          compact
        />
      </PaneScroll>
    );
  }
  if (friends.length === 0) {
    return (
      <PaneScroll refreshControl={refreshControl}>
        <MascotState
          kind="empty"
          title={copy('friends.empty', tone)}
          actionLabel="Find people"
          onAction={onFind}
          compact
        />
      </PaneScroll>
    );
  }

  return (
    <FlatList
      data={friends}
      keyExtractor={(friend) => `${friend.user_a_id}-${friend.user_b_id}`}
      style={PANE_SCROLL}
      contentContainerStyle={PANE_CONTENT}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      initialNumToRender={16}
      maxToRenderPerBatch={16}
      windowSize={10}
      removeClippedSubviews={Platform.OS !== 'web'}
      refreshControl={refreshControl}
      renderItem={({ item: friend }) => {
        const otherId = userId ? otherFriendshipUserId(friend, userId) : (friend.profile?.id ?? '');
        return (
          <FriendCard
            friend={friend}
            messaging={messagingId === otherId}
            onMessage={() => onMessage(friend)}
          />
        );
      }}
    />
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
  incoming: FriendEdge[];
  outgoing: FriendEdge[];
  userId?: string;
  busyId: string | null;
  onRetry: () => void;
  onFind: () => void;
  onAccept: (userId: string) => void;
  onDecline: (userId: string) => void;
  onCancel: (userId: string) => void;
}) {
  const tone = useCopyTone();
  if (loading) {
    return (
      <PaneScroll>
        <MascotState kind="loading" title="Checking requests" compact />
      </PaneScroll>
    );
  }
  if (error) {
    return (
      <PaneScroll>
        <MascotState
          kind="error"
          title="Couldn’t load requests"
          body={error}
          actionLabel="Retry"
          onAction={onRetry}
          compact
        />
      </PaneScroll>
    );
  }
  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <PaneScroll>
        <MascotState
          kind="empty"
          title={copy('alerts.empty', tone)}
          body="No pending requests. Find someone in the Lobby and send a request after you compete."
          actionLabel="Find people"
          onAction={onFind}
          compact
        />
      </PaneScroll>
    );
  }

  return (
    <PaneScroll>
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
    </PaneScroll>
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
  const tone = useCopyTone();
  const hint =
    parsed?.kind === 'email'
      ? 'Exact email match only — we never search partial emails.'
      : parsed?.kind === 'phone'
        ? 'Exact phone match only — we never search partial numbers.'
        : null;

  return (
    <View style={[PANE_FILL, { paddingTop: 16 }]}>
      <Input
        ref={inputRef}
        value={query}
        onChangeText={onChangeQuery}
        placeholder={copy('friends.searchPlaceholder')}
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
      <View style={PANE_FILL}>
        {parsed && !loading && results.length === 0 ? (
          <PaneScroll>
            <MascotState kind="empty" title={copy('friends.noneMatch', tone)} compact />
          </PaneScroll>
        ) : null}
        {!term && !loading ? (
          <PaneScroll>
            <MascotState
              kind="empty"
              title="Find your people"
              body="Search by name or @username, or paste a full email or phone number."
              compact
            />
          </PaneScroll>
        ) : null}
        {results.length > 0 ? (
          <FlatList
            data={results}
            keyExtractor={(profile) => profile.id}
            style={PANE_SCROLL}
            contentContainerStyle={{ paddingTop: 12, paddingBottom: TAB_BAR_CONTENT_INSET, gap: 12 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            renderItem={({ item: profile }) => {
              const relation = peopleRelation({
                userId,
                targetId: profile.id,
                ...graph,
              });
              return (
                <UserSearchResult
                  profile={profile}
                  relation={relation}
                  busy={busyId === profile.id}
                  onPrimary={() => onPrimary(profile, relation)}
                />
              );
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

function PaneScroll({
  children,
  refreshControl,
}: {
  children: ReactNode;
  refreshControl?: ReactElement;
}) {
  return (
    <ScrollView
      style={PANE_SCROLL}
      contentContainerStyle={PANE_CONTENT}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}>
      {children}
    </ScrollView>
  );
}
