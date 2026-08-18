import { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { MessageBubble } from '@/components/messages/MessageBubble';
import { MessageInput } from '@/components/messages/MessageInput';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useConversation, useMarkConversationRead, useMessages, useSendMessage } from '@/hooks/useSocial';
import { personDisplayName } from '@/lib/social';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';
import type { Message } from '@/types/social';

export default function ConversationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Array.isArray(id) ? id[0] : id;
  const conversation = useConversation(conversationId);
  const messages = useMessages(conversationId);
  const sendMessage = useSendMessage();
  const markRead = useMarkConversationRead();
  const listRef = useRef<FlatList<Message>>(null);
  const rows = messages.data ?? [];
  const peer = conversation.data?.peer;
  const name = personDisplayName(peer);
  const lastId = rows.at(-1)?.id;

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
    const handle = peer?.username ?? peer?.id;
    if (!handle) {
      return;
    }
    router.push({ pathname: '/friends/u/[username]', params: { username: handle } });
  }

  function onSend(body: string) {
    if (!conversationId) {
      return;
    }
    sendMessage.mutate(
      { conversation_id: conversationId, body },
      {
        onError: (error) => Alert.alert('Couldn’t send that', getErrorMessage(error)),
      },
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ backgroundColor: THEME.background }}>
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
          disabled={!peer}
          accessibilityRole="button"
          accessibilityLabel={`${name} profile`}
          className="min-w-0 flex-1 flex-row items-center">
          <Avatar uri={peer?.avatar_url} name={name} size={36} />
          <View className="ml-2 min-w-0 flex-1">
            <AppText className="text-[16px] font-bold text-charcoal" numberOfLines={1}>
              {name}
            </AppText>
            {peer?.username ? (
              <AppText className="text-[12px] text-muted" numberOfLines={1}>
                @{peer.username}
              </AppText>
            ) : null}
          </View>
        </Pressable>
      </View>

      {messages.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={THEME.accent} />
        </View>
      ) : messages.error ? (
        <View className="flex-1 items-center justify-center px-8">
          <AppText className="text-center text-[16px] font-bold text-charcoal">Couldn’t load this chat</AppText>
          <AppText className="mt-1 text-center text-[13px] text-muted">
            {messages.error instanceof Error ? messages.error.message : 'Try again in a moment.'}
          </AppText>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          className="flex-1"
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerClassName="grow justify-end gap-3 px-4 py-4"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <AppText className="px-6 py-10 text-center text-[14px] text-muted">
              Say hi to {name}. Keep it short — the challenge can wait.
            </AppText>
          }
          renderItem={({ item }) => <MessageBubble message={item} mine={item.sender_id === user?.id} />}
        />
      )}

      <View style={{ paddingBottom: 8 }}>
        <MessageInput onSend={onSend} />
      </View>
    </View>
    </KeyboardAvoidingView>
  );
}
