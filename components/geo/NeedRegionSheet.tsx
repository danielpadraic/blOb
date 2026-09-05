import { View } from 'react-native';

import { GeoSheetCard } from '@/components/geo/GeoSheetCard';
import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';

export function NeedRegionSheet({
  visible,
  onAddState,
  onNotNow,
}: {
  visible: boolean;
  onAddState: () => void;
  onNotNow: () => void;
}) {
  if (!visible) {
    return null;
  }
  return (
    <GeoSheetCard onClose={onNotNow}>
      <AppText className="text-center text-[22px] font-extrabold text-charcoal">
        {copy('geo.needRegion')}
      </AppText>
      <View className="mt-4 gap-2">
        <Button title={copy('geo.addState')} size="lg" onPress={onAddState} />
        <Button title={copy('geo.notNow')} variant="ghost" onPress={onNotNow} />
      </View>
    </GeoSheetCard>
  );
}
