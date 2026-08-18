import { Image } from 'expo-image';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
import { cn } from '@/utils/cn';
import { initials } from '@/utils/format';

type AvatarProps = {
  uri?: string | null;
  name?: string | null;
  size?: number;
  radius?: number;
  className?: string;
};

export function Avatar({ uri, name, size = 44, radius, className }: AvatarProps) {
  return (
    <View
      className={cn('items-center justify-center overflow-hidden', className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? size / 2,
        backgroundColor: THEME.primary,
      }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <AppText
          className="font-bold"
          style={{ fontSize: size * 0.36, color: THEME.primaryForeground }}>
          {initials(name)}
        </AppText>
      )}
    </View>
  );
}
