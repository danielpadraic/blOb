import { Pressable, Switch, View } from 'react-native';

import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import type { ComparablePointsForm } from '@/hooks/useComparablePointsForm';
import {
  LOG_CHOICE_FIELD_MAX,
  LOG_CHOICE_OPTION_MAX,
  LOG_TEXT_FIELD_MAX,
} from '@/lib/comparablePoints';
import { COLORS } from '@/lib/constants';
import { THEME } from '@/lib/theme';

export function LogExtrasEditor({ form }: { form: ComparablePointsForm }) {
  const textFields = form.draft.text_fields ?? [];
  const choiceFields = form.draft.choice_fields ?? [];

  return (
    <View className="gap-3">
      <View className="gap-1">
        <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Also ask on each log
        </AppText>
        <AppText className="text-[13px] leading-5 text-muted">
          Optional notes and choices. These are context, not points.
        </AppText>
      </View>

      {textFields.map((field, index) => (
        <View
          key={field.id}
          className="gap-2"
          style={{
            backgroundColor: THEME.surface,
            borderRadius: THEME.radius,
            borderWidth: 1,
            borderColor: THEME.border,
            padding: 14,
          }}>
          <View className="flex-row items-center justify-between">
            <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Text {index + 1}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove text field"
              onPress={() => form.removeTextField(field.id)}
              hitSlop={8}
              style={{ minHeight: 32, justifyContent: 'center' }}>
              <AppText className="text-sm font-semibold text-muted">Remove</AppText>
            </Pressable>
          </View>
          <Input
            label="Label"
            placeholder="e.g. what closed"
            value={field.label}
            onChangeText={(label) => form.patchTextField(field.id, { label })}
            maxLength={40}
          />
          <Input
            label="Placeholder"
            placeholder="Optional hint"
            value={field.placeholder ?? ''}
            onChangeText={(placeholder) => form.patchTextField(field.id, { placeholder })}
            maxLength={60}
          />
          <View className="flex-row items-center justify-between gap-3">
            <AppText className="font-semibold text-charcoal">Required</AppText>
            <Switch
              value={Boolean(field.required)}
              onValueChange={(required) => form.patchTextField(field.id, { required })}
              trackColor={{ true: COLORS.mintDark, false: COLORS.line }}
              thumbColor={COLORS.white}
              ios_backgroundColor={COLORS.line}
            />
          </View>
        </View>
      ))}

      <Pressable
        accessibilityRole="button"
        disabled={textFields.length >= LOG_TEXT_FIELD_MAX}
        onPress={form.addTextField}
        className="items-center self-start rounded-full px-3"
        style={{
          minHeight: 36,
          opacity: textFields.length >= LOG_TEXT_FIELD_MAX ? 0.45 : 1,
          borderWidth: 1,
          borderColor: THEME.border,
          backgroundColor: THEME.surface,
          justifyContent: 'center',
        }}>
        <AppText className="text-sm font-semibold text-charcoal">+ Add a text field</AppText>
      </Pressable>

      {choiceFields.map((field, index) => (
        <View
          key={field.id}
          className="gap-2"
          style={{
            backgroundColor: THEME.surface,
            borderRadius: THEME.radius,
            borderWidth: 1,
            borderColor: THEME.border,
            padding: 14,
          }}>
          <View className="flex-row items-center justify-between">
            <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Choice {index + 1}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove choice field"
              onPress={() => form.removeChoiceField(field.id)}
              hitSlop={8}
              style={{ minHeight: 32, justifyContent: 'center' }}>
              <AppText className="text-sm font-semibold text-muted">Remove</AppText>
            </Pressable>
          </View>
          <Input
            label="Label"
            placeholder="e.g. shift"
            value={field.label}
            onChangeText={(label) => form.patchChoiceField(field.id, { label })}
            maxLength={40}
          />
          {field.options.map((option, optionIndex) => (
            <View key={`${field.id}-${optionIndex}`} className="flex-row items-start gap-2">
              <View className="flex-1">
                <Input
                  label={optionIndex === 0 ? 'Options' : undefined}
                  placeholder={optionIndex === 0 ? 'e.g. morning' : 'Another option'}
                  value={option}
                  onChangeText={(next) => {
                    const options = [...field.options];
                    options[optionIndex] = next;
                    form.patchChoiceField(field.id, { options });
                  }}
                  maxLength={24}
                />
              </View>
              {field.options.length > 2 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove option"
                  onPress={() =>
                    form.patchChoiceField(field.id, {
                      options: field.options.filter((_, i) => i !== optionIndex),
                    })
                  }
                  className="h-[52px] w-[52px] items-center justify-center"
                  style={{
                    marginTop: optionIndex === 0 ? 22 : 0,
                    borderWidth: 1,
                    borderColor: THEME.border,
                    backgroundColor: THEME.surface,
                    borderRadius: 12,
                  }}>
                  <AppText className="text-[18px] font-semibold text-muted">×</AppText>
                </Pressable>
              ) : null}
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            disabled={field.options.length >= LOG_CHOICE_OPTION_MAX}
            onPress={() => form.patchChoiceField(field.id, { options: [...field.options, ''] })}
            className="items-center self-start rounded-full px-3"
            style={{
              minHeight: 36,
              opacity: field.options.length >= LOG_CHOICE_OPTION_MAX ? 0.45 : 1,
              borderWidth: 1,
              borderColor: THEME.border,
              backgroundColor: THEME.surface,
              justifyContent: 'center',
            }}>
            <AppText className="text-sm font-semibold text-charcoal">+ Add option</AppText>
          </Pressable>
        </View>
      ))}

      <Pressable
        accessibilityRole="button"
        disabled={choiceFields.length >= LOG_CHOICE_FIELD_MAX}
        onPress={form.addChoiceField}
        className="items-center self-start rounded-full px-3"
        style={{
          minHeight: 36,
          opacity: choiceFields.length >= LOG_CHOICE_FIELD_MAX ? 0.45 : 1,
          borderWidth: 1,
          borderColor: THEME.border,
          backgroundColor: THEME.surface,
          justifyContent: 'center',
        }}>
        <AppText className="text-sm font-semibold text-charcoal">+ Add a choice</AppText>
      </Pressable>
    </View>
  );
}
