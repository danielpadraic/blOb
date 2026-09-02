import { Pressable } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

type PlayerCloseButtonProps = {
  accessibilityLabel: string;
  onPress: () => void;
};

/** Shared Home / Wave / Round close. 44×44, top-leading, white × on a dark disc. */
export function PlayerCloseButton({ accessibilityLabel, onPress }: PlayerCloseButtonProps) {
  const size = THEME.playerCloseSize;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={onPress}
      style={{
        height: size,
        width: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: size / 2,
        backgroundColor: THEME.playerCloseDisc,
      }}>
      <AppText
        style={{
          color: THEME.playerCloseGlyph,
          fontSize: 28,
          fontWeight: '500',
          lineHeight: 30,
        }}>
        ×
      </AppText>
    </Pressable>
  );
}
