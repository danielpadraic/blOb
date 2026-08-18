import { Text, type TextProps } from 'react-native';

import { cn } from '@/utils/cn';

type AppTextProps = TextProps & {
  className?: string;
};

export function AppText({ className, style, ...props }: AppTextProps) {
  return (
    <Text
      className={cn('text-base text-ink', className)}
      style={[{ includeFontPadding: false }, style]}
      {...props}
    />
  );
}
