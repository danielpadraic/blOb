import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

type MessageInputProps = {
  sending?: boolean;
  onSend: (body: string) => void;
};

export function MessageInput({ sending, onSend }: MessageInputProps) {
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const disabled = trimmed.length === 0;

  function submit() {
    if (disabled) {
      return;
    }
    onSend(trimmed);
    setValue('');
  }

  return (
    <View
      className="flex-row items-end gap-2 px-4 py-3"
      style={{ backgroundColor: THEME.background, borderTopWidth: 1, borderTopColor: THEME.border }}>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="Message"
        placeholderTextColor={THEME.textMuted}
        keyboardAppearance="light"
        selectionColor={THEME.accent}
        multiline
        maxLength={2000}
        editable={true}
        onSubmitEditing={submit}
        blurOnSubmit={false}
        className="max-h-[120px] min-h-[44px] flex-1 px-4 py-2.5 text-[15px]"
        style={{
          color: THEME.textPrimary,
          backgroundColor: THEME.surface,
          borderWidth: 1,
          borderColor: THEME.border,
          borderRadius: 18,
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ busy: Boolean(sending) }}
        disabled={disabled}
        onPress={submit}
        className="h-11 items-center justify-center px-4"
        style={{
          backgroundColor: THEME.primary,
          borderRadius: 18,
          opacity: disabled ? 0.38 : 1,
        }}>
        <AppText className="text-[14px] font-semibold" style={{ color: THEME.primaryForeground }}>
          Send
        </AppText>
      </Pressable>
    </View>
  );
}
