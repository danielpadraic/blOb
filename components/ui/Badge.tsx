import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
import { cn } from '@/utils/cn';

type BadgeTone = 'coral' | 'mint' | 'charcoal' | 'muted';

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  className?: string;
};

const toneStyle: Record<BadgeTone, { backgroundColor: string; color: string }> = {
  coral: { backgroundColor: THEME.accentSoft, color: THEME.accent },
  mint: { backgroundColor: THEME.accentSoft, color: THEME.accent },
  charcoal: { backgroundColor: THEME.primary, color: THEME.primaryForeground },
  muted: { backgroundColor: THEME.surface2, color: THEME.textMuted },
};

export function Badge({ label, tone = 'muted', className }: BadgeProps) {
  const colors = toneStyle[tone];
  return (
    <View
      className={cn('self-start rounded-full px-2.5 py-1', className)}
      style={{ backgroundColor: colors.backgroundColor }}>
      <AppText
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: colors.color }}>
        {label}
      </AppText>
    </View>
  );
}
