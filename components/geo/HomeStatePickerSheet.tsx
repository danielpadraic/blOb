import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { GeoSheetCard } from '@/components/geo/GeoSheetCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import {
  parseUspsRegion,
  regionLabel,
  USPS_REGION_LABELS,
  USPS_REGIONS,
  type UspsRegion,
} from '@/lib/geo/regions';
import { THEME } from '@/lib/theme';

export function HomeStatePickerSheet({
  visible,
  value,
  saving,
  error,
  onSave,
  onClose,
}: {
  visible: boolean;
  value?: string | null;
  saving?: boolean;
  error?: string | null;
  onSave: (region: UspsRegion) => void;
  onClose: () => void;
}) {
  const selected = parseUspsRegion(value);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<UspsRegion | null>(selected);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setQuery('');
    setPicked(parseUspsRegion(value));
  }, [value, visible]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return USPS_REGIONS.filter((code) => {
      if (!needle) {
        return true;
      }
      const label = USPS_REGION_LABELS[code];
      return (
        code.toLowerCase().includes(needle) ||
        label.toLowerCase().includes(needle)
      );
    });
  }, [query]);

  if (!visible) {
    return null;
  }

  return (
    <GeoSheetCard align="end" onClose={saving ? undefined : onClose}>
      <AppText className="text-center text-[22px] font-extrabold text-charcoal">
        {copy('geo.homeState')}
      </AppText>
      <AppText className="mt-2 text-center text-[13px] leading-5 text-muted">
        {copy('geo.homeStateHelp')}
      </AppText>
          <View className="mt-4" style={{ maxHeight: 360 }}>
        <Input
          label={copy('geo.homeState')}
          placeholder="Search"
          autoCapitalize="none"
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
        />
        <ScrollView
          className="mt-2"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {rows.map((code) => {
            const active = (picked ?? selected) === code;
            return (
              <Pressable
                key={code}
                accessibilityRole="button"
                accessibilityLabel={`${USPS_REGION_LABELS[code]}, ${code}`}
                onPress={() => setPicked(code)}
                style={{
                  minHeight: 44,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  justifyContent: 'center',
                  backgroundColor: active ? THEME.accentSoft : 'transparent',
                }}>
                <AppText
                  className="text-[15px] font-semibold text-charcoal"
                  numberOfLines={1}>
                  {USPS_REGION_LABELS[code]}
                </AppText>
                <AppText className="text-[12px] text-muted">{code}</AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {error ? (
        <AppText className="mt-2 text-center text-[13px]" style={{ color: THEME.danger }}>
          {error}
        </AppText>
      ) : null}
      <View className="mt-3 gap-2 pb-2">
        <Button
          title="Save"
          size="lg"
          loading={saving}
          disabled={!picked}
          onPress={() => {
            if (picked) {
              onSave(picked);
            }
          }}
        />
        <Button title={copy('geo.notNow')} variant="ghost" disabled={saving} onPress={onClose} />
      </View>
    </GeoSheetCard>
  );
}

export function homeStateRowLabel(value: string | null | undefined): string {
  const label = regionLabel(value);
  const code = parseUspsRegion(value);
  if (label && code) {
    return `${label} · ${code}`;
  }
  return copy('geo.addState');
}
