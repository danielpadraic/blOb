import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ConversationListItem } from '@/components/messages/ConversationListItem';
import { EmptyConversations } from '@/components/messages/EmptyConversations';
import { MascotState } from '@/components/mascot/MascotState';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useAuth } from '@/hooks/useAuth';
import { useConversations } from '@/hooks/useSocial';
import { conversationHref } from '@/lib/routes';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';

export default function MessagesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const conversations = useConversations();
  const rows = (conversations.data ?? []).filter((row) => !row.is_group);
  const unread = rows.filter((row) => row.unread).length;
  const refreshing = conversations.isRefetching && !conversations.isLoading;

  function close() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/friends');
  }

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} className="pt-1">
      <View className="mb-3 flex-row items-start px-4">
        <View className="min-w-0 flex-1 pr-3">
          <AppText className="text-[22px] font-extrabold text-charcoal">Messages</AppText>
          <AppText className="mt-0.5 text-[13px] text-muted">
            {unread > 0
              ? `${unread} unread`
              : rows.length > 0
                ? 'Direct, simple, no group pile-on yet'
                : 'Say hi to someone you compete with'}
          </AppText>
        </View>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close messages"
          className="h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: THEME.surface, borderWidth: 1, borderColor: THEME.border }}>
          <AppText className="text-[18px] font-semibold text-muted">×</AppText>
        </Pressable>
      </View>

      {conversations.isLoading ? (
        <MascotState kind="loading" title={copy('messages.loading')} compact />
      ) : conversations.error ? (
        <MascotState
          kind="error"
          title={copy('messages.error')}
          body={conversations.error instanceof Error ? conversations.error.message : 'Try again in a moment.'}
          actionLabel="Retry"
          onAction={() => void conversations.refetch()}
          compact
        />
      ) : rows.length === 0 ? (
        <EmptyConversations onFindFriends={() => router.replace('/friends')} />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-2 px-4 pb-8"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void conversations.refetch()}
              tintColor={THEME.accent}
            />
          }>
          {rows.map((conversation) => (
            <ConversationListItem
              key={conversation.id}
              conversation={conversation}
              userId={user?.id}
              onPress={() => router.push(conversationHref(conversation.id))}
            />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
