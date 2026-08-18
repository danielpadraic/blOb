import { type ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
};

export function AppHeader({ title, subtitle, leading }: AppHeaderProps) {
  return (
    <View className="mb-2 flex-row items-start gap-2">
      {leading}
      <View className="min-w-0 flex-1">
        <AppText className="text-[18px] font-extrabold text-charcoal" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText className="mt-0.5 text-[13px] text-muted" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
