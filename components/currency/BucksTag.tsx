import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { isSponsoredBucks } from '@/lib/currency';
import type { Challenge } from '@/lib/types';

type BucksTagProps = {
  challenge?: Pick<Challenge, 'is_official' | 'buy_in_amount' | 'currency'> | null;
  compact?: boolean;
};

export function BucksTag({ challenge, compact }: BucksTagProps) {
  const sponsored = isSponsoredBucks(challenge);
  return (
    <View
      className="flex-row items-center self-start rounded-full px-2 py-0.5"
      style={{ backgroundColor: '#1B7A4A' }}>
      <AppText className="text-[11px] font-bold" style={{ color: '#F4FFF6' }}>
        {compact ? '$' : sponsored ? '$ Sponsored' : '$'}
      </AppText>
    </View>
  );
}
