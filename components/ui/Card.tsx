import { View, type ViewProps } from 'react-native';

import { THEME, themeShadow } from '@/lib/theme';
import { cn } from '@/utils/cn';

type CardProps = ViewProps & {
  className?: string;
  padded?: boolean;
};

export function Card({ className, padded = true, style, ...props }: CardProps) {
  return (
    <View
      className={cn(className)}
      style={[
        {
          backgroundColor: THEME.surface,
          borderColor: THEME.border,
          borderWidth: 1,
          borderRadius: THEME.radius,
          padding: padded ? 16 : 0,
          ...themeShadow('card'),
        },
        style,
      ]}
      {...props}
    />
  );
}
