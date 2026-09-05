import { View } from 'react-native';

import { GeoSheetCard } from '@/components/geo/GeoSheetCard';
import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';

export function GeoUnavailableSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  if (!visible) {
    return null;
  }
  return (
    <GeoSheetCard onClose={onClose}>
      <AppText className="text-center text-[22px] font-extrabold text-charcoal">
        {copy('geo.unavailable')}
      </AppText>
      <AppText className="mt-3 text-center text-[15px] leading-6 text-muted">
        {copy('geo.unavailableSub')}
      </AppText>
      <View className="mt-4">
        <Button title="OK" size="lg" onPress={onClose} />
      </View>
    </GeoSheetCard>
  );
}
