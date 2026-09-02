import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

export function HostRoundPromptChip({
  line,
  onPress,
  onDismiss,
}: {
  line: string;
  onPress: () => void;
  onDismiss: () => void;
}) {
  return (
    <View
      className="flex-row items-center"
      style={{
        minHeight: 36,
        paddingLeft: 12,
        paddingRight: 4,
        borderRadius: 18,
        backgroundColor: THEME.accentSoft,
        gap: 8,
      }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={line}
        onPress={onPress}
        style={{ flex: 1, minHeight: 36, justifyContent: 'center' }}>
        <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }} numberOfLines={2}>
          {line}
        </AppText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onDismiss}
        style={{ minHeight: 36, minWidth: 36, alignItems: 'center', justifyContent: 'center' }}>
        <AppText className="text-[16px] font-semibold" style={{ color: THEME.textMuted }}>
          ×
        </AppText>
      </Pressable>
    </View>
  );
}
