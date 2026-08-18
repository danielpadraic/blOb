import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';

type FeedHeaderProps = {
  subtitle?: string;
};

export function FeedHeader({ subtitle = 'What your crew is competing on' }: FeedHeaderProps) {
  return (
    <View className="mb-3">
      <AppText className="text-[22px] font-extrabold text-charcoal">Home</AppText>
      <AppText className="mt-0.5 text-[13px] text-muted">{subtitle}</AppText>
    </View>
  );
}
