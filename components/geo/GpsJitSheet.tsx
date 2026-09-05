import { View } from 'react-native';

import { GeoSheetCard } from '@/components/geo/GeoSheetCard';
import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';

export function GpsJitSheet({
  visible,
  loading,
  onUseLocation,
  onUseHomeState,
  onClose,
}: {
  visible: boolean;
  loading?: boolean;
  onUseLocation: () => void;
  onUseHomeState: () => void;
  onClose: () => void;
}) {
  if (!visible) {
    return null;
  }
  return (
    <GeoSheetCard onClose={loading ? undefined : onClose}>
      <AppText className="text-center text-[22px] font-extrabold text-charcoal">
        {copy('geo.gpsTitle')}
      </AppText>
      <AppText className="mt-3 text-center text-[15px] leading-6 text-muted">
        {copy('geo.gpsBody')}
      </AppText>
      <View className="mt-4 gap-2">
        <Button
          title={copy('geo.useLocation')}
          size="lg"
          loading={loading}
          onPress={onUseLocation}
        />
        <Button
          title={copy('geo.useHomeState')}
          variant="ghost"
          disabled={loading}
          onPress={onUseHomeState}
        />
      </View>
    </GeoSheetCard>
  );
}
