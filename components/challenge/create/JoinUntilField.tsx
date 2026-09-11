import { View } from 'react-native';

import { DateTimeField } from '@/components/challenge/create/DateTimeField';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import {
  JOIN_UNTIL_CHIPS,
  asJoinUntilPreset,
  type JoinUntilPreset,
} from '@/lib/joinWindow';
import { THEME } from '@/lib/theme';

export function JoinUntilField({
  preset,
  customAt,
  startsAt,
  onPreset,
  onCustom,
}: {
  preset: JoinUntilPreset | string;
  customAt?: string | null;
  startsAt?: string | null;
  onPreset: (preset: JoinUntilPreset) => void;
  onCustom: (iso: string) => void;
}) {
  const selected = asJoinUntilPreset(preset);
  const customValue = customAt || startsAt || new Date().toISOString();
  const min = startsAt ? new Date(startsAt) : undefined;

  return (
    <View className="gap-2">
      <AppText className="text-[13px] font-semibold" style={{ color: THEME.textPrimary }}>
        {copy('create.joinUntil')}
      </AppText>
      <ChipRow>
        {JOIN_UNTIL_CHIPS.map((item) => (
          <Chip
            key={item.value}
            label={item.label}
            selected={selected === item.value}
            onPress={() => onPreset(item.value)}
          />
        ))}
      </ChipRow>
      {selected === 'custom' ? (
        <DateTimeField value={customValue} minimumDate={min} onChange={onCustom} />
      ) : null}
    </View>
  );
}
