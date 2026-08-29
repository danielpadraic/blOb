import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MessageBubble } from '@/components/messages/MessageBubble';
import { MessageInput } from '@/components/messages/MessageInput';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import {
  useConversation,
  useGetOrCreateConversation,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
} from '@/hooks/useSocial';
import { copy } from '@/lib/copy';
import { DM_BLOCKED_COPY } from '@/lib/dmOpen';
import { conversationHref } from '@/lib/routes';
import { subscribeVisualViewport } from '@/lib/visualViewport';
import { conversationTitle, fetchPublicProfilesByIds, personDisplayName } from '@/lib/social';
import { TAB_BAR_GUTTER, TAB_BAR_HEIGHT, TAB_BAR_PEEK, THEME } from '@/lib/theme';
import { getDmOpenMessage } from '@/utils/errors';
import type { PublicProfile } from '@/lib/types';
import type { Message } from '@/types/social';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function ConversationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id: string; peerId?: string; focus?: string; draft?: string }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const peerIdParam = Array.isArray(params.peerId) ? params.peerId[0] : params.peerId;
  const draftParam = Array.isArray(params.draft) ? params.draft[0] : params.draft;
  const focus = (Array.isArray(params.focus) ? params.focus[0] : params.focus) === '1';
  const conversationId = rawId && UUID_RE.test(rawId) ? rawId : null;

  const conversation = useConversation(conversationId);
  const messages = useMessages(conversationId);
  const sendMessage = useSendMessage();
  const markRead = useMarkConversationRead();
  const startChat = useGetOrCreateConversation();
  const listRef = useRef<FlatList<Message>>(null);
  const [peer, setPeer] = useState<PublicProfile | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const rows = messages.data ?? [];
  const lastId = rows.at(-1)?.id;
  const isGroup = Boolean(conversation.data?.is_group);
  const people = conversation.data?.people ?? [];
  const resolvedPeer = conversation.data?.peer ?? peer;
  const name = conversation.data
    ? conversationTitle(conversation.data)
    : personDisplayName(resolvedPeer);
  const opening = Boolean(!conversationId && peerIdParam && startChat.isPending);
  const threadError =
    openError ??
    (conversation.error ? getDmOpenMessage(conversation.error) : null) ??
    (messages.error ? getDmOpenMessage(messages.error) : null);

  const createThread = startChat.mutateAsync;

  useEffect(() => {
    if (Platform.OS === 'web') {
      return subscribeVisualViewport(setKeyboardHeight);
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const shown = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hidden = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  useEffect(() => {
    const id = peerIdParam || conversation.data?.peer?.id;
    if (!id || isGroup) {
      return;
    }
    if (resolvedPeer?.id === id) {
      return;
    }
    let cancelled = false;
    void fetchPublicProfilesByIds([id]).then((rows) => {
      if (!cancelled && rows[0]) {
        setPeer(rows[0]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [conversation.data?.peer?.id, isGroup, peerIdParam, resolvedPeer?.id]);

  useEffect(() => {
    if (conversationId) {
      return;
    }
    if (!peerIdParam || !user?.id) {
      setOpenError(copy('messages.openFailed'));
      return;
    }
    let cancelled = false;
    setOpenError(null);
    void createThread(peerIdParam).then(
      (row) => {
        if (cancelled || !row?.id) {
          return;
        }
        router.replace(conversationHref(row.id, { peerId: peerIdParam, focus: true }));
      },
      (error) => {
        if (!cancelled) {
          setOpenError(getDmOpenMessage(error));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [conversationId, createThread, peerIdParam, router, user?.id]);

  useEffect(() => {
    if (conversationId) {
      markRead.mutate(conversationId);
    }
  }, [conversationId, lastId, markRead.mutate]);

  useEffect(() => {
    if (rows.length === 0) {
      return;
    }
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [rows.length, lastId]);

  function close() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/messages');
  }

  function openProfile() {
    if (isGroup) {
      return;
    }
    const handle = resolvedPeer?.username ?? resolvedPeer?.id;
    if (!handle) {
      return;
    }
    router.push({ pathname: '/friends/u/[username]', params: { username: handle } });
  }

  function retryOpen() {
    setOpenError(null);
    if (conversationId) {
      void conversation.refetch();
      void messages.refetch();
      return;
    }
    if (!peerIdParam) {
      setOpenError(copy('messages.openFailed'));
      return;
    }
    void startChat.mutateAsync(peerIdParam).then(
      (row) => router.replace(conversationHref(row.id, { peerId: peerIdParam, focus: true })),
      (error) => setOpenError(getDmOpenMessage(error)),
    );
  }

  function onSend(payload: { body: string; media_url?: string | null }) {
    if (!conversationId) {
      return;
    }
    sendMessage.mutate(
      { conversation_id: conversationId, body: payload.body, media_url: payload.media_url },
      {
        onError: (error) => Alert.alert('Couldn’t send that', getDmOpenMessage(error)),
      },
    );
  }

  const showOpenError = Boolean(threadError && !conversation.data && !opening);
  const composerReady = Boolean(conversationId) && !showOpenError;
  const tabReserve = TAB_BAR_HEIGHT + Math.max(insets.bottom, TAB_BAR_GUTTER);
  const composerPad =
    keyboardHeight > 0
      ? Platform.OS === 'web'
        ? Math.max(8, keyboardHeight)
        : Platform.OS === 'ios'
          ? Math.max(8, keyboardHeight - tabReserve)
          : Math.max(insets.bottom, 8) + TAB_BAR_PEEK / 2
      : Math.max(insets.bottom, 8) + (Platform.OS === 'web' ? 0 : TAB_BAR_PEEK / 2);

  return (
    <View className="flex-1" style={{ backgroundColor: THEME.background }}>
      <View
        className="flex-row items-center px-4 pb-3"
        style={{ borderBottomWidth: 1, borderBottomColor: THEME.border }}>
        <Pressable
          onPress={close}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="mr-2 h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: THEME.surface, borderWidth: 1, borderColor: THEME.border }}>
          <AppText className="text-[16px] font-semibold text-muted">‹</AppText>
        </Pressable>
        <Pressable
          onPress={openProfile}
          disabled={!resolvedPeer || isGroup}
          accessibilityRole="button"
          accessibilityLabel={isGroup ? name : `${name} profile`}
          className="min-w-0 flex-1 flex-row items-center">
          <Avatar
            uri={resolvedPeer?.avatar_url}
            name={name}
            size={36}
          />
          <View className="ml-2 min-w-0 flex-1">
            <AppText className="text-[16px] font-bold text-charcoal" numberOfLines={1}>
              {name || 'Chat'}
            </AppText>
            {isGroup ? (
              <AppText className="text-[12px] text-muted" numberOfLines={1}>
                {people.length > 0 ? `${people.length + 1} people` : 'Group'}
              </AppText>
            ) : resolvedPeer?.username ? (
              <AppText className="text-[12px] text-muted" numberOfLines={1}>
                @{resolvedPeer.username}
              </AppText>
            ) : null}
          </View>
        </Pressable>
      </View>

      {showOpenError ? (
        <View className="flex-1 items-center justify-center px-8">
          <AppText className="text-center text-[16px] font-bold text-charcoal">
            {threadError === DM_BLOCKED_COPY ? DM_BLOCKED_COPY : copy('messages.openFailed')}
          </AppText>
          {threadError &&
          threadError !== DM_BLOCKED_COPY &&
          threadError !== copy('messages.openFailed') &&
          !/p0001|sqlstate|postgres/i.test(threadError) ? (
            <AppText className="mt-1 text-center text-[13px] text-muted">{threadError}</AppText>
          ) : null}
          <View className="mt-4 w-full">
            <Button title="Try again" onPress={retryOpen} loading={startChat.isPending || conversation.isLoading} />
          </View>
        </View>
      ) : messages.isLoading || opening || (!conversationId && peerIdParam) ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={THEME.accent} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          className="flex-1"
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerClassName="grow justify-end gap-3 px-4 py-4"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <AppText className="px-6 py-10 text-center text-[14px] text-muted">
              Say hi to {name || 'them'}. Keep it short — the challenge can wait.
            </AppText>
          }
          renderItem={({ item }) => <MessageBubble message={item} mine={item.sender_id === user?.id} />}
        />
      )}

      <View style={{ paddingBottom: composerPad }}>
        <MessageInput
          onSend={onSend}
          sending={sendMessage.isPending}
          autoFocus={focus && composerReady}
          disabled={!composerReady}
          draft={draftParam}
        />
      </View>
    </View>
  );
}
