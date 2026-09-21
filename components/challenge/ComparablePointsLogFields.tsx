import { View } from 'react-native';

import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import {
  comparableLogFields,
  inferInputKind,
  parseMoneyInput,
  type ComparablePointsConfig,
} from '@/lib/comparablePoints';
import { THEME } from '@/lib/theme';

export type ComparableLogDraft = {
  metrics: Record<string, string>;
  text: Record<string, string>;
  choices: Record<string, string>;
};

export function emptyComparableLogDraft(): ComparableLogDraft {
  return { metrics: {}, text: {}, choices: {} };
}

export function ComparablePointsLogFields({
  config,
  draft,
  disabled,
  onChange,
}: {
  config: ComparablePointsConfig;
  draft: ComparableLogDraft;
  disabled?: boolean;
  onChange: (next: ComparableLogDraft) => void;
}) {
  const fields = comparableLogFields(config);
  if (fields.length === 0) {
    return null;
  }

  return (
    <View className="gap-3">
      {fields.map((field) => {
        if (field.kind === 'text') {
          return (
            <Input
              key={field.id}
              label={field.label}
              placeholder={field.placeholder || 'Optional'}
              value={draft.text[field.id] ?? ''}
              onChangeText={(value) =>
                onChange({ ...draft, text: { ...draft.text, [field.id]: value } })
              }
              editable={!disabled}
              grow
              maxLength={240}
            />
          );
        }
        if (field.kind === 'choice') {
          const selected = draft.choices[field.id] ?? '';
          return (
            <View key={field.id} className="gap-2">
              <AppText className="text-sm font-semibold text-charcoal">{field.label}</AppText>
              <ChipRow>
                {field.options.filter(Boolean).map((option) => (
                  <Chip
                    key={option}
                    label={option}
                    selected={selected === option}
                    onPress={() =>
                      onChange({
                        ...draft,
                        choices: {
                          ...draft.choices,
                          [field.id]: selected === option ? '' : option,
                        },
                      })
                    }
                  />
                ))}
              </ChipRow>
            </View>
          );
        }
        const money = inferInputKind(field.unit, field.inputKind) === 'money';
        const unit = field.unit && !money ? ` (${field.unit})` : '';
        return (
          <Input
            key={field.key}
            label={`${field.label}${money ? ' ($)' : unit}`}
            placeholder="0"
            keyboardType={field.inputKind === 'count' ? 'number-pad' : 'decimal-pad'}
            value={draft.metrics[field.key] ?? ''}
            onChangeText={(raw) => {
              const next = money ? raw.replace(/[^0-9.]/g, '') : raw.replace(/[^\d.]/g, '');
              onChange({ ...draft, metrics: { ...draft.metrics, [field.key]: next } });
            }}
            editable={!disabled}
            hint={money && draft.metrics[field.key] ? `Stores ${parseMoneyInput(draft.metrics[field.key])}` : undefined}
          />
        );
      })}
      <AppText className="text-[12px] leading-4" style={{ color: THEME.textMuted }}>
        Zeros are fine. Send replaces this period’s log.
      </AppText>
    </View>
  );
}
