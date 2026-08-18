import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import {
  defaultChallengeStart,
  formatScheduleDateTime,
  fromLocalInputValue,
  parseScheduleDate,
  toLocalInputValue,
} from '@/lib/challengeSchedule';
import { THEME } from '@/lib/theme';

type DateTimeFieldProps = {
  label?: string;
  value: string;
  error?: string;
  minimumDate?: Date;
  onChange: (iso: string) => void;
};

export function DateTimeField({ label, value, error, minimumDate, onChange }: DateTimeFieldProps) {
  const [mode, setMode] = useState<'date' | 'time' | null>(null);
  const date = parseScheduleDate(value) ?? defaultChallengeStart();

  function commit(next: Date) {
    const resolved = new Date(next);
    if (minimumDate && resolved.getTime() <= minimumDate.getTime()) {
      resolved.setTime(minimumDate.getTime() + 60 * 60 * 1000);
    }
    onChange(resolved.toISOString());
  }

  function onNativeChange(event: DateTimePickerEvent, next?: Date) {
    if (Platform.OS === 'android') {
      const current = mode;
      setMode(null);
      if (event.type !== 'set' || !next) {
        return;
      }
      const merged = new Date(date);
      if (current === 'date') {
        merged.setFullYear(next.getFullYear(), next.getMonth(), next.getDate());
        commit(merged);
        setMode('time');
        return;
      }
      merged.setHours(next.getHours(), next.getMinutes(), 0, 0);
      commit(merged);
      return;
    }
    if (next) {
      commit(next);
    }
  }

  if (Platform.OS === 'web') {
    return (
      <View className="gap-1.5">
        {label ? <AppText className="text-sm font-semibold text-charcoal">{label}</AppText> : null}
        <View
          className="min-h-[52px] justify-center px-4"
          style={{
            backgroundColor: THEME.surface,
            borderWidth: 1,
            borderColor: error ? THEME.danger : THEME.border,
            borderRadius: THEME.radiusSm,
          }}>
          <input
            type="datetime-local"
            value={toLocalInputValue(value)}
            min={minimumDate ? toLocalInputValue(minimumDate.toISOString()) : undefined}
            onChange={(event) => {
              const iso = fromLocalInputValue(event.target.value);
              if (iso) {
                onChange(iso);
              }
            }}
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              color: THEME.textPrimary,
              fontSize: 16,
              outline: 'none',
            }}
          />
        </View>
        {error ? <AppText className="text-sm text-coral-dark">{error}</AppText> : null}
      </View>
    );
  }

  return (
    <View className="gap-1.5">
      {label ? <AppText className="text-sm font-semibold text-charcoal">{label}</AppText> : null}
      <View className="flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label ? `${label} date` : 'Date and time'}
          onPress={() => setMode('date')}
          className="min-h-[52px] flex-1 justify-center px-4"
          style={{
            backgroundColor: THEME.surface,
            borderWidth: 1,
            borderColor: error ? THEME.danger : mode === 'date' ? THEME.accent : THEME.border,
            borderRadius: THEME.radiusSm,
          }}>
          <AppText className="text-[15px] font-medium text-charcoal">
            {formatScheduleDateTime(value)}
          </AppText>
        </Pressable>
      </View>
      {mode ? (
        <DateTimePicker
          value={date}
          mode={mode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={minimumDate}
          onChange={onNativeChange}
        />
      ) : null}
      {Platform.OS === 'ios' && mode ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setMode(mode === 'date' ? 'time' : null)}
          className="self-end px-2 py-1">
          <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
            {mode === 'date' ? 'Set time' : 'Done'}
          </AppText>
        </Pressable>
      ) : null}
      {error ? <AppText className="text-sm text-coral-dark">{error}</AppText> : null}
    </View>
  );
}
