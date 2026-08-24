import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

export const CHALLENGE_PAGE_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'board', label: 'Board' },
  { value: 'feed', label: 'Lobby Feed' },
] as const;

export type ChallengePageTab = (typeof CHALLENGE_PAGE_TABS)[number]['value'];

export function ChallengePageTabs({
  value,
  onChange,
}: {
  value: ChallengePageTab;
  onChange: (tab: ChallengePageTab) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Challenge sections"
      className="flex-row"
      style={{
        borderBottomWidth: 1,
        borderBottomColor: THEME.border,
      }}>
      {CHALLENGE_PAGE_TABS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className="min-h-[44px] flex-1 items-center justify-center"
            style={{ paddingHorizontal: 4 }}>
            <AppText
              className="text-center text-[13px] font-semibold"
              numberOfLines={1}
              style={{ color: selected ? THEME.accent : THEME.textMuted }}>
              {option.label}
            </AppText>
            <View
              style={{
                marginTop: 8,
                height: 2,
                width: '100%',
                borderRadius: 999,
                backgroundColor: selected ? THEME.accent : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
