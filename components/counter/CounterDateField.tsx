import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { formatCounterDate, parseCounterDate } from '@/lib/counter/session';
import { THEME } from '@/lib/theme';
import { localDateStamp } from '@/utils/dates';

type Props = {
  value: string;
  readOnly?: boolean;
  onChange: (date: string) => void;
};

export function CounterDateField({ value, readOnly, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const date = parseCounterDate(value) ?? new Date();
  const label = formatCounterDate(value);

  function commit(next: Date) {
    onChange(localDateStamp(next));
  }

  function onNativeChange(event: DateTimePickerEvent, next?: Date) {
    if (Platform.OS === 'android') {
      setOpen(false);
      if (event.type !== 'set' || !next) {
        return;
      }
      commit(next);
      return;
    }
    if (next) {
      commit(next);
    }
  }

  if (Platform.OS === 'web') {
    return (
      <View style={{ marginTop: 8 }}>
        <AppText style={{ fontSize: 13, fontWeight: '700', color: THEME.textMuted }}>Date</AppText>
        {readOnly ? (
          <AppText style={{ marginTop: 6, fontSize: 16, fontWeight: '700', color: THEME.textPrimary }}>
            {label}
          </AppText>
        ) : (
          <input
            type="date"
            value={value}
            aria-label="Date"
            onChange={(event) => onChange(event.target.value)}
            style={{
              marginTop: 6,
              minHeight: 44,
              width: '100%',
              borderRadius: 14,
              border: `1px solid ${THEME.border}`,
              padding: '0 12px',
              color: THEME.textPrimary,
              background: THEME.surface,
              fontSize: 16,
              fontWeight: 700,
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={{ marginTop: 8 }}>
      <AppText style={{ fontSize: 13, fontWeight: '700', color: THEME.textMuted }}>Date</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Date"
        disabled={readOnly}
        onPress={() => {
          if (!readOnly) {
            setOpen(true);
          }
        }}
        style={{
          marginTop: 6,
          minHeight: 44,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: THEME.border,
          backgroundColor: THEME.surface,
          paddingHorizontal: 12,
          justifyContent: 'center',
        }}>
        <AppText style={{ fontSize: 16, fontWeight: '700', color: THEME.textPrimary }}>{label}</AppText>
      </Pressable>
      {open && !readOnly ? (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onNativeChange}
        />
      ) : null}
    </View>
  );
}
