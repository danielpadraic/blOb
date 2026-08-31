import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { missesAllowedCap, missesAllowedCopy, missesUsedCopy } from '@/lib/missDuty';
import { THEME } from '@/lib/theme';
import type { Challenge } from '@/lib/types';

export function MissBudgetLines({
  challenge,
  used = 0,
}: {
  challenge: Challenge;
  used?: number;
}) {
  const allowed = missesAllowedCap(challenge);
  if (allowed == null) {
    return null;
  }
  return (
    <View className="gap-0.5">
      <AppText className="text-[14px] leading-6" style={{ color: THEME.textPrimary }}>
        {missesAllowedCopy(allowed)}
      </AppText>
      <AppText className="text-[14px] leading-6" style={{ color: THEME.textPrimary }}>
        {missesUsedCopy(used)}
      </AppText>
    </View>
  );
}
