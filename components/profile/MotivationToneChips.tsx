import { View } from 'react-native';

import { Chip, ChipRow } from '@/components/ui/Chip';
import { AppText } from '@/components/ui/AppText';
import {
  COPY_TONE_OPTIONS,
  asCopyTone,
  copy,
  type CopyTone,
} from '@/lib/copy';

export function MotivationToneChips({
  value,
  onChange,
  label,
}: {
  value?: string | null;
  onChange: (tone: CopyTone) => void;
  label?: string;
}) {
  const selected = asCopyTone(value);
  return (
    <View className="gap-2">
      <AppText className="text-sm font-semibold text-charcoal">
        {label ?? copy('profile.toneLabel')}
      </AppText>
      <ChipRow>
        {COPY_TONE_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={copy(option.key)}
            selected={selected === option.value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </ChipRow>
    </View>
  );
}

export function BfpSliderCopy({ tone }: { tone?: string | null }) {
  return (
    <AppText className="text-[13px] leading-5 text-muted">
      {copy('bfp.sliderHint', asCopyTone(tone))}
    </AppText>
  );
}
