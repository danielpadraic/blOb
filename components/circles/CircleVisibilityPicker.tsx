import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import type { CircleVisibility } from '@/lib/circles';
import { THEME } from '@/lib/theme';

const OPTIONS: { value: CircleVisibility; title: string; body: string }[] = [
  {
    value: 'friends',
    title: copy('circles.visibilityFriends'),
    body: copy('circles.visibilityFriendsHelp'),
  },
  {
    value: 'friends_of_friends',
    title: copy('circles.visibilityFof'),
    body: copy('circles.visibilityFofHelp'),
  },
  {
    value: 'public',
    title: copy('circles.visibilityPublic'),
    body: copy('circles.visibilityPublicHelp'),
  },
];

export function CircleVisibilityPicker({
  value,
  onChange,
}: {
  value: CircleVisibility;
  onChange: (next: CircleVisibility) => void;
}) {
  return (
    <View className="gap-2">
      <AppText className="text-[13px] font-semibold text-muted">{copy('circles.visibility')}</AppText>
      {OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={{
              minHeight: 44,
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: THEME.radius,
              borderWidth: 1.5,
              borderColor: selected ? THEME.circle : THEME.border,
              backgroundColor: selected ? THEME.circleSoft : THEME.surface,
            }}>
            <AppText className="font-semibold text-charcoal">{option.title}</AppText>
            <AppText className="mt-1 text-[13px] leading-5 text-muted">{option.body}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
