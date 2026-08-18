import { Pressable, View } from 'react-native';

import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

type FriendsHeaderProps = {
  friendCount: number;
  requestCount: number;
  unreadMessages?: number;
  onPressSearch: () => void;
  onPressMessages: () => void;
};

export function FriendsHeader({
  friendCount,
  requestCount,
  unreadMessages = 0,
  onPressSearch,
  onPressMessages,
}: FriendsHeaderProps) {
  const subtitle =
    requestCount > 0
      ? `${friendCount} friend${friendCount === 1 ? '' : 's'} · ${requestCount} waiting`
      : friendCount > 0
        ? `${friendCount} friend${friendCount === 1 ? '' : 's'} to compete with`
        : 'Find people to challenge';

  return (
    <View className="mb-3 flex-row items-start">
      <View className="min-w-0 flex-1 pr-3">
        <AppText className="text-[22px] font-extrabold text-charcoal">Friends</AppText>
        <AppText className="mt-0.5 text-[13px] text-muted">{subtitle}</AppText>
      </View>
      <View className="flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : 'Messages'}
          onPress={onPressMessages}
          hitSlop={8}
          className="relative h-10 w-10 items-center justify-center"
          style={{
            borderRadius: 12,
            backgroundColor: THEME.surface,
            borderWidth: 1,
            borderColor: THEME.border,
          }}>
          <Glyph name={GLYPH.reply} color={THEME.textPrimary} size={18} />
          {unreadMessages > 0 ? (
            <View
              className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full"
              style={{ backgroundColor: THEME.accent }}
            />
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Find people"
          onPress={onPressSearch}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center"
          style={{
            borderRadius: 12,
            backgroundColor: THEME.surface,
            borderWidth: 1,
            borderColor: THEME.border,
          }}>
          <Glyph name={GLYPH.search} color={THEME.textPrimary} size={18} />
        </Pressable>
      </View>
    </View>
  );
}
