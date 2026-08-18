import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
import { cn } from '@/utils/cn';

const STEPS = ['You', 'Training', 'Body'];

type SetupProgressProps = {
  step: number;
};

export function SetupProgress({ step }: SetupProgressProps) {
  return (
    <View className="gap-3">
      <AppText className="text-center text-sm text-muted">
        Step {step + 1} of {STEPS.length}
      </AppText>
      <View className="flex-row gap-2">
        {STEPS.map((label, index) => {
          const complete = index < step;
          const current = index === step;
          return (
            <View key={label} className="flex-1 gap-1.5">
              <View
                className="h-1.5 rounded-full"
                style={{
                  backgroundColor:
                    current ? THEME.accent : complete ? THEME.primary : THEME.border,
                  opacity: current ? 1 : complete ? 0.7 : 1,
                }}
              />
              <AppText
                className={cn(
                  'text-center text-[11px] font-medium',
                  current ? 'text-charcoal' : 'text-muted',
                )}>
                {label}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}
