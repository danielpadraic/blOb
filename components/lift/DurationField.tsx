import { View } from 'react-native';

import { NumberField } from '@/components/lift/NumberField';
import { AppText } from '@/components/ui/AppText';
import { joinDuration, splitDuration } from '@/lib/lift/session';
import { THEME } from '@/lib/theme';

/**
 * Minutes and seconds for a cardio or rest row.
 *
 * Both fields edit one number underneath, so the steppers roll over the way a clock does: 0:55 plus
 * five seconds is 1:00, not 0:60. Typing either field is still exact.
 */

const SECONDS_STEP = 5;

type DurationFieldProps = {
  seconds: number | null | undefined;
  onChange: (seconds: number) => void;
  editable?: boolean;
  label?: string;
};

export function DurationField({
  seconds,
  onChange,
  editable = true,
  label = 'Time',
}: DurationFieldProps) {
  const parts = splitDuration(seconds);
  const total = joinDuration(parts.minutes, parts.seconds);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <NumberField
          value={parts.minutes}
          label={`${label} minutes`}
          placeholder="0"
          editable={editable}
          onCommit={(text) => {
            const typed = Number.parseInt(text.replace(/[^0-9]/g, ''), 10);
            onChange(joinDuration(Number.isFinite(typed) ? typed : 0, parts.seconds));
          }}
          onStep={(direction) => onChange(Math.max(total + direction * 60, 0))}
        />
        <AppText style={LABEL_STYLE}>MIN</AppText>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <NumberField
          value={parts.seconds}
          label={`${label} seconds`}
          placeholder="0"
          editable={editable}
          onCommit={(text) => {
            const typed = Number.parseInt(text.replace(/[^0-9]/g, ''), 10);
            onChange(joinDuration(parts.minutes, Number.isFinite(typed) ? typed : 0));
          }}
          onStep={(direction) => onChange(Math.max(total + direction * SECONDS_STEP, 0))}
        />
        <AppText style={LABEL_STYLE}>SEC</AppText>
      </View>
    </View>
  );
}

const LABEL_STYLE = {
  marginTop: 3,
  fontSize: 10,
  fontWeight: '800' as const,
  letterSpacing: 0.6,
  textAlign: 'center' as const,
  color: THEME.textMuted,
};
