import { forwardRef, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
import { cn } from '@/utils/cn';

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
  inverted?: boolean;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, hint, className, inverted, onFocus, onBlur, style, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <View className="w-full gap-1.5">
      {label ? (
        <AppText
          className={inverted ? 'text-sm font-semibold' : 'text-sm font-semibold text-charcoal'}
          style={inverted ? { color: '#FFFFFF' } : undefined}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={THEME.textMuted}
        keyboardAppearance="light"
        selectionColor={THEME.accent}
        className={cn('min-h-[52px] px-4 py-3.5 text-base', className)}
        style={[
          {
            color: THEME.textPrimary,
            backgroundColor: THEME.surface,
            borderWidth: 1,
            borderColor: error ? THEME.danger : focused ? THEME.accent : THEME.border,
            borderRadius: 12,
          },
          style,
        ]}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...props}
      />
      {error ? (
        <AppText className="text-xs text-coral-dark">{error}</AppText>
      ) : hint ? (
        <AppText className="text-xs text-muted">{hint}</AppText>
      ) : null}
    </View>
  );
});
