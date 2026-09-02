import { Pressable } from 'react-native';

import { Glyph, type GlyphId } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

export function CreateIconChip({
  icon,
  glyph,
  label,
  selected,
  onPress,
}: {
  icon?: string;
  glyph?: GlyphId;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const color = selected ? THEME.accent : THEME.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="flex-row items-center rounded-full px-3"
      style={{
        backgroundColor: selected ? THEME.accentSoft : THEME.surface,
        borderWidth: 1,
        borderColor: selected ? THEME.accent : THEME.border,
        minHeight: 44,
        gap: 6,
      }}>
      {glyph ? <Glyph name={glyph} color={color} size={14} /> : icon ? <AppText className="text-[14px]">{icon}</AppText> : null}
      <AppText className="text-sm font-semibold" style={{ color }}>
        {label}
      </AppText>
    </Pressable>
  );
}
