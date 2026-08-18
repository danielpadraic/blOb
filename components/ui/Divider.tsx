import { View } from 'react-native';

import { THEME } from '@/lib/theme';
import { cn } from '@/utils/cn';

export function Divider({ className }: { className?: string }) {
  return (
    <View className={cn('h-px', className)} style={{ backgroundColor: THEME.border }} />
  );
}
