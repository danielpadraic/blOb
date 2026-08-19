import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

type MessageInputProps = {
  sending?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  onSend: (body: string) => void;
};

export function MessageInput({ sending, autoFocus = false, disabled = false, onSend }: MessageInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<TextInput>(null);
  const trimmed = value.trim();
  const blocked = disabled || Boolean(sending);
  const canSend = trimmed.length > 0 && !blocked;

  useEffect(() => {
    if (!autoFocus || disabled) {
      return;
    }
    const handle = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(handle);
  }, [autoFocus, disabled]);

  function submit() {
    if (!canSend) {
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
        ref={inputRef}
        value={value}
        onChangeText={setValue}
        placeholder="Message"
        placeholderTextColor={THEME.textMuted}
        keyboardAppearance="light"
        selectionColor={THEME.accent}
        multiline
        maxLength={2000}
        editable={!blocked}
        autoFocus={autoFocus}
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
        accessibilityState={{ busy: Boolean(sending), disabled: !canSend }}
        disabled={!canSend}
        onPress={submit}
        className="h-11 items-center justify-center px-4"
        style={{
          backgroundColor: THEME.primary,
          borderRadius: 18,
          opacity: canSend ? 1 : 0.38,
        }}>
        <AppText className="text-[14px] font-semibold" style={{ color: THEME.primaryForeground }}>
          Send
        </AppText>
      </Pressable>
    </View>
  );
}
