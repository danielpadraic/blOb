import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { LobbyFilterChip } from '@/lib/lobbyChallenge';
import { THEME } from '@/lib/theme';

export function LobbyFilterChips({
  chips,
  onDismiss,
}: {
  chips: LobbyFilterChip[];
  onDismiss: (id: string) => void;
}) {
  if (chips.length === 0) {
    return null;
  }
  return (
    <View className="flex-row flex-wrap" style={{ gap: 8, marginTop: 8 }}>
      {chips.map((chip) => (
        <Pressable
          key={chip.id}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${chip.label}`}
          onPress={() => onDismiss(chip.id)}
          style={{
            minHeight: 32,
            paddingHorizontal: 10,
            borderRadius: 999,
            backgroundColor: THEME.accentSoft,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}>
          <AppText className="text-[12px] font-semibold" style={{ color: THEME.accent }}>
            {chip.label}
          </AppText>
          <AppText className="text-[12px] font-extrabold" style={{ color: THEME.accent }}>
            ×
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}
