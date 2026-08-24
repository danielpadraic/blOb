import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { LIFECYCLE_PHASES, lifecyclePhase, type LifecyclePhase } from '@/lib/settlement/lifecycle';
import { THEME } from '@/lib/theme';

const LABELS: Record<LifecyclePhase, string> = {
  open: 'Open',
  live: 'Live',
  settling: 'Settling',
  settled: 'Settled',
};

type ChallengeLifecycleStatusProps = {
  status?: string | null;
  compact?: boolean;
};

export function ChallengeLifecycleStatus({ status, compact = false }: ChallengeLifecycleStatusProps) {
  const current = lifecyclePhase(status);
  const phases = compact ? ([current] as LifecyclePhase[]) : LIFECYCLE_PHASES;
  return (
    <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
      {phases.map((phase) => {
        const active = phase === current;
        return (
          <View
            key={phase}
            style={{
              minHeight: 44,
              paddingHorizontal: 14,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? THEME.accentSoft : THEME.surface,
              borderWidth: 1,
              borderColor: active ? THEME.accent : THEME.border,
            }}>
            <AppText
              className="text-[13px] font-bold"
              style={{ color: active ? THEME.accent : THEME.textMuted }}>
              {LABELS[phase]}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}
