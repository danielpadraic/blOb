import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { copy } from '@/lib/copy';
import { placeLabel, type LocationPlace } from '@/lib/locationProof';
import { THEME } from '@/lib/theme';

export function LocationVenueLine({
  place,
  compact,
}: {
  place?: Pick<LocationPlace, 'label'> | string | null;
  compact?: boolean;
}) {
  const label = typeof place === 'string' ? place.trim() : placeLabel(place, '');
  if (!label) {
    return null;
  }
  return (
    <View className="flex-row items-center" style={{ gap: 6 }}>
      <Glyph name={GLYPH.pin} color={THEME.accent} size={compact ? 12 : 14} />
      <AppText
        className={compact ? 'text-[12px] font-semibold' : 'text-[13px] font-semibold'}
        style={{ color: THEME.textMuted }}
        numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

export function LocationProofRow({
  place,
  ready,
  busy,
  onImHere,
}: {
  place?: LocationPlace | null;
  ready?: boolean;
  busy?: boolean;
  onImHere: () => void;
}) {
  const label = placeLabel(place);
  return (
    <View
      className="flex-row items-center px-3"
      style={{
        minHeight: 56,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: THEME.border,
        backgroundColor: THEME.surface,
        gap: 10,
      }}>
      <Glyph name={GLYPH.pin} color={THEME.accent} size={18} />
      <View className="flex-1">
        <AppText className="text-[14px] font-bold text-charcoal" numberOfLines={1}>
          {label}
        </AppText>
        <AppText className="text-[12px] text-muted">{ready ? 'You’re here.' : 'Check in at this place.'}</AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy('checkin.imHere')}
        disabled={busy || ready}
        onPress={onImHere}
        style={{
          minHeight: 36,
          paddingHorizontal: 12,
          borderRadius: 999,
          backgroundColor: ready ? THEME.accentSoft : THEME.primary,
          justifyContent: 'center',
        }}>
        <AppText
          className="text-[13px] font-semibold"
          style={{ color: ready ? THEME.accent : THEME.primaryForeground }}>
          {ready ? 'Here' : copy('checkin.imHere')}
        </AppText>
      </Pressable>
    </View>
  );
}
