import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';

type FeedHeaderProps = {
  subtitle?: string;
};

export function FeedHeader({ subtitle = 'Friends, Challenges, and official posts' }: FeedHeaderProps) {
  return (
    <View className="mb-3">
      <AppText className="text-[22px] font-extrabold text-charcoal">{copy('home.header')}</AppText>
      <AppText className="mt-0.5 text-[13px] text-muted">{subtitle}</AppText>
    </View>
  );
}
