import { Pressable } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

/** Permanent dismiss. Muted text link under Next / Done — not a second primary. */
export function TourDismissLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Don’t show again"
      onPress={onPress}
      style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText className="text-center text-[13px] leading-5" style={{ color: THEME.textMuted }}>
        Don’t show again
      </AppText>
    </Pressable>
  );
}
