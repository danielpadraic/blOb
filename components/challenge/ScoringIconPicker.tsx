import { Pressable, View } from 'react-native';

import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { ScoringIcon } from '@/components/ui/ScoringIcon';
import { AppText } from '@/components/ui/AppText';
import { SCORING_ICON_REGISTRY, type ScoringIconKey } from '@/lib/scoringIcons';
import { THEME } from '@/lib/theme';

export function ScoringIconPicker({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected?: string | null;
  onSelect: (key: ScoringIconKey) => void;
  onClose: () => void;
}) {
  return (
    <ChromeOverlay visible={visible} onClose={onClose} align="end">
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: THEME.radius,
          borderTopRightRadius: THEME.radius,
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 28,
          gap: 12,
        }}>
        <AppText className="text-[15px] font-bold text-charcoal">Pick an icon</AppText>
        <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
          {SCORING_ICON_REGISTRY.map((item) => {
            const on = selected === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: on }}
                onPress={() => {
                  onSelect(item.key);
                  onClose();
                }}
                style={{
                  width: '20%',
                  minHeight: 56,
                  padding: 4,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: on ? THEME.accent : THEME.border,
                    backgroundColor: on ? THEME.accentSoft : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <ScoringIcon iconKey={item.key} size={28} label={item.label} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ChromeOverlay>
  );
}
