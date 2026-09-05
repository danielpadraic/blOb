import { Pressable, View } from 'react-native';

import { useGeoCash } from '@/components/geo/GeoCashHost';
import { homeStateRowLabel } from '@/components/geo/HomeStatePickerSheet';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';

export function HomeStateField({
  value,
  onSaved,
}: {
  value?: string | null;
  onSaved?: () => void;
}) {
  const geo = useGeoCash();
  return (
    <View className="gap-2">
      <AppText className="text-sm font-semibold text-charcoal">{copy('geo.homeState')}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy('geo.homeState')}
        onPress={() => geo.openHomeState({ onSaved })}
        style={{ minHeight: 44, justifyContent: 'center' }}>
        <AppText className="text-sm leading-5 text-charcoal">{homeStateRowLabel(value)}</AppText>
      </Pressable>
      <AppText className="text-[12px] leading-5 text-muted">{copy('geo.homeStateHelp')}</AppText>
    </View>
  );
}
