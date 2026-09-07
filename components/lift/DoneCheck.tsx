import { Pressable, View } from 'react-native';

import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { THEME } from '@/lib/theme';

/** The same Done check strength sets use, so cardio rounds read as the same control. */
export function DoneCheck({
  done,
  label,
  disabled,
  onToggle,
}: {
  done: boolean;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={done ? `Undo ${label}` : `Complete ${label}`}
      accessibilityState={{ checked: done, disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={4}
      onPress={onToggle}
      style={{
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 9,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: done ? THEME.accent : THEME.surface,
          borderWidth: 1,
          borderColor: done ? THEME.accent : THEME.border,
        }}>
        <Glyph
          name={GLYPH.checkmark}
          color={done ? THEME.accentForeground : THEME.border}
          size={15}
        />
      </View>
    </Pressable>
  );
}
