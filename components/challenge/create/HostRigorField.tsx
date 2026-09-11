import { View } from 'react-native';

import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import {
  HOST_RIGOR_OPTIONS,
  asHostRigor,
  hostRigorControlState,
  hostRigorHelp,
  type HostRigor,
} from '@/lib/hostRigor';
import { THEME } from '@/lib/theme';

export function HostRigorField({
  value,
  official,
  currency,
  challengeLane,
  onChange,
}: {
  value?: string | null;
  official?: boolean | null;
  currency?: string | null;
  challengeLane?: string | null;
  onChange: (next: HostRigor) => void;
}) {
  const state = hostRigorControlState({
    is_official: official,
    currency,
    challenge_lane: challengeLane,
    host_rigor: value,
  });
  const selected = state.disabled ? state.value : asHostRigor(value);
  const options = HOST_RIGOR_OPTIONS.filter((item) => state.options.includes(item.value));
  const helper = state.disabled ? state.helper : hostRigorHelp(selected);

  return (
    <View className="gap-2">
      <AppText className="text-[13px] font-semibold" style={{ color: THEME.textPrimary }}>
        {copy('create.rigor')}
      </AppText>
      <SegmentedControl
        accessibilityLabel={copy('create.rigor')}
        value={selected}
        options={options.map((item) => ({ value: item.value, label: item.label }))}
        disabled={state.disabled}
        onChange={(next) => {
          if (state.disabled) {
            return;
          }
          onChange(next);
        }}
      />
      <AppText className="text-[13px] leading-5 text-muted">{helper}</AppText>
    </View>
  );
}
