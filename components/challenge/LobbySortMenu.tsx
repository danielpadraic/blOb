import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { sortsForTab, type LobbySort, type LobbyTab } from '@/lib/lobbyChallenge';
import { THEME } from '@/lib/theme';

export function LobbySortMenu({
  visible,
  tab,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  tab: LobbyTab;
  value: LobbySort;
  onChange: (next: LobbySort) => void;
  onClose: () => void;
}) {
  return (
    <ChromeOverlay visible={visible} onClose={onClose}>
      <View
        style={{
          backgroundColor: THEME.background,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 20,
        }}>
        <View className="mb-3 items-center">
          <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
        </View>
        <AppText className="mb-2 text-xl font-bold" style={{ color: THEME.textPrimary }}>
          Sort
        </AppText>
        {sortsForTab(tab).map((option, index) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                onChange(option.value);
                onClose();
              }}
              style={{
                minHeight: 48,
                justifyContent: 'center',
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: THEME.border,
              }}>
              <AppText
                className="text-[16px] font-semibold"
                style={{ color: selected ? THEME.accent : THEME.textPrimary }}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </ChromeOverlay>
  );
}
