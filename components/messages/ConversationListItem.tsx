import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { conversationTitle, messagePreview, type ConversationPreview } from '@/lib/social';
import { THEME } from '@/lib/theme';
import { formatFeedTime } from '@/utils/format';

type ConversationListItemProps = {
  conversation: ConversationPreview;
  userId?: string | null;
  compact?: boolean;
  onPress: () => void;
};

export function ConversationListItem({
  conversation,
  userId,
  compact = false,
  onPress,
}: ConversationListItemProps) {
  const name = conversationTitle(conversation);
  const stamp = conversation.last_message?.created_at ?? conversation.updated_at;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={conversation.unread ? `${name}, unread` : name}
      className="flex-row items-center"
      style={{
        paddingHorizontal: compact ? 8 : 16,
        paddingVertical: compact ? 8 : 12,
        backgroundColor: conversation.unread ? THEME.accentSoft : THEME.surface,
        borderRadius: compact ? 14 : THEME.radius,
        borderWidth: 1,
        borderColor: conversation.unread ? THEME.accent : THEME.border,
        minHeight: 44,
      }}>
      <Avatar uri={conversation.peer?.avatar_url} name={name} size={compact ? 36 : 48} />
      <View className="ml-3 min-w-0 flex-1">
        <View className="flex-row items-center">
          <AppText
            className="min-w-0 flex-1 font-bold text-charcoal"
            style={{ fontSize: compact ? 13 : 16 }}
            numberOfLines={1}>
            {name}
          </AppText>
          <AppText className="ml-2 text-[11px] text-muted">{formatFeedTime(stamp)}</AppText>
        </View>
        <AppText
          className={compact ? 'mt-0.5 text-[11px]' : 'mt-0.5 text-[13px]'}
          style={{ color: conversation.unread ? THEME.textPrimary : THEME.textMuted, fontWeight: conversation.unread ? '600' : '400' }}
          numberOfLines={1}>
          {messagePreview(conversation.last_message, userId)}
        </AppText>
      </View>
      {conversation.unread ? (
        <View
          className="ml-2 h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: THEME.accent }}
          accessibilityElementsHidden
        />
      ) : null}
    </Pressable>
  );
}
