import { forwardRef, useRef, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { GrowingText } from '@/components/ui/GrowingText';
import { AppText } from '@/components/ui/AppText';
import { useKeyboardForm } from '@/components/ui/KeyboardFormShell';
import { COMPOSER_MAX_LINES, FORM_LINE_HEIGHT, FORM_MIN_HEIGHT } from '@/lib/composerField';
import { THEME } from '@/lib/theme';

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
  inverted?: boolean;
  /** Sentence fields wrap and grow. Search, handles, steppers, and amounts stay one line. */
  grow?: boolean;
  growMaxLines?: number;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    error,
    hint,
    className,
    inverted,
    grow,
    growMaxLines = COMPOSER_MAX_LINES,
    onFocus,
    onBlur,
    style,
    numberOfLines,
    multiline,
    textAlignVertical,
    ...props
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const boxRef = useRef<View>(null);
  const form = useKeyboardForm();
  const sentence = Boolean(grow || (multiline && numberOfLines !== 1));
  const boxStyle = [
    {
      minHeight: FORM_MIN_HEIGHT,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: THEME.textPrimary,
      backgroundColor: THEME.surface,
      borderWidth: 1,
      borderColor: error ? THEME.danger : focused ? THEME.accent : THEME.border,
      borderRadius: 12,
    },
    style,
  ];

  function handleFocus(event: Parameters<NonNullable<TextInputProps['onFocus']>>[0]) {
    setFocused(true);
    onFocus?.(event);
    if (boxRef.current) {
      form?.scrollFieldIntoView(boxRef.current);
    }
  }

  function handleBlur(event: Parameters<NonNullable<TextInputProps['onBlur']>>[0]) {
    setFocused(false);
    onBlur?.(event);
  }

  const shared = {
    placeholderTextColor: THEME.textMuted,
    keyboardAppearance: 'light' as const,
    selectionColor: THEME.accent,
    className,
    onFocus: handleFocus,
    onBlur: handleBlur,
    ...props,
  };

  return (
    <View ref={boxRef} collapsable={false} className="w-full gap-1.5">
      {label ? (
        <AppText
          className={inverted ? 'text-sm font-semibold' : 'text-sm font-semibold text-charcoal'}
          style={inverted ? { color: '#FFFFFF' } : undefined}>
          {label}
        </AppText>
      ) : null}
      {sentence ? (
        <GrowingText
          ref={ref}
          {...shared}
          minHeight={FORM_MIN_HEIGHT}
          lineHeight={FORM_LINE_HEIGHT}
          maxLines={growMaxLines}
          style={boxStyle}
        />
      ) : (
        <TextInput
          ref={ref}
          {...shared}
          multiline={multiline}
          numberOfLines={numberOfLines}
          textAlignVertical={textAlignVertical}
          style={boxStyle}
        />
      )}
      {error ? (
        <AppText className="text-xs text-coral-dark">{error}</AppText>
      ) : hint ? (
        <AppText className="text-xs text-muted">{hint}</AppText>
      ) : null}
    </View>
  );
});
