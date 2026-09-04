import { createElement, forwardRef, useRef, useState } from 'react';
import { Platform, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

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
  /** HTML name for web autofill. Stable across keystrokes. */
  name?: string;
  /** Sentence fields wrap and grow. Search, handles, steppers, and amounts stay one line. */
  grow?: boolean;
  growMaxLines?: number;
};

function cssFromInputStyle(style: InputProps['style']): Record<string, unknown> {
  const list = Array.isArray(style) ? style : [style];
  const flat = Object.assign(
    {},
    ...list.filter((item): item is object => Boolean(item) && typeof item === 'object'),
  ) as ViewStyle & { paddingHorizontal?: number; paddingVertical?: number };
  const { paddingHorizontal, paddingVertical, ...rest } = flat;
  return {
    ...rest,
    ...(paddingHorizontal != null
      ? { paddingLeft: paddingHorizontal, paddingRight: paddingHorizontal }
      : null),
    ...(paddingVertical != null
      ? { paddingTop: paddingVertical, paddingBottom: paddingVertical }
      : null),
  };
}

function htmlAutoComplete(autoComplete?: TextInputProps['autoComplete']): string | undefined {
  if (!autoComplete) {
    return undefined;
  }
  if (autoComplete === 'off') {
    return 'off';
  }
  if (autoComplete === 'password') {
    return 'current-password';
  }
  return String(autoComplete);
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    error,
    hint,
    className,
    inverted,
    name,
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
  const webAuthInput = Platform.OS === 'web' && Boolean(inverted) && !sentence;
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
    form?.setFieldFocused?.(true);
    onFocus?.(event);
    if (webAuthInput) {
      const target = (event as unknown as { target?: HTMLElement }).target;
      if (target?.scrollIntoView) {
        requestAnimationFrame(() => target.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
      }
      return;
    }
    if (Platform.OS !== 'web' && boxRef.current) {
      form?.scrollFieldIntoView(boxRef.current);
    }
  }

  function handleBlur(event: Parameters<NonNullable<TextInputProps['onBlur']>>[0]) {
    setFocused(false);
    form?.setFieldFocused?.(false);
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

  function assignRef(node: TextInput | HTMLInputElement | null) {
    if (typeof ref === 'function') {
      ref(node as TextInput);
    } else if (ref) {
      ref.current = node as TextInput;
    }
  }

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
      ) : webAuthInput ? (
        createElement('input', {
          ref: assignRef,
          type: props.secureTextEntry ? 'password' : props.keyboardType === 'email-address' ? 'email' : 'text',
          name,
          value: props.value ?? '',
          maxLength: props.maxLength,
          placeholder: props.placeholder,
          disabled: props.editable === false,
          autoComplete: htmlAutoComplete(props.autoComplete),
          autoCapitalize: props.autoCapitalize === 'none' ? 'off' : props.autoCapitalize,
          autoCorrect: props.autoCorrect === false ? 'off' : undefined,
          spellCheck: props.autoCorrect !== false,
          inputMode: props.keyboardType === 'email-address' ? 'email' : undefined,
          onChange: (event: { currentTarget: { value: string } }) => {
            props.onChangeText?.(event.currentTarget.value);
          },
          onInput: (event: { currentTarget: { value: string } }) => {
            props.onChangeText?.(event.currentTarget.value);
          },
          onFocus: handleFocus,
          onBlur: (event: { currentTarget: { value: string } }) => {
            const next = event.currentTarget.value;
            if (next !== (props.value ?? '')) {
              props.onChangeText?.(next);
            }
            handleBlur(event as never);
          },
          style: {
            width: '100%',
            boxSizing: 'border-box',
            outline: 'none',
            borderStyle: 'solid',
            fontFamily: 'inherit',
            caretColor: THEME.accent,
            ...cssFromInputStyle(boxStyle),
          },
        })
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
        <AppText className="text-xs text-coral-dark" numberOfLines={1}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText className="text-xs text-muted">{hint}</AppText>
      ) : null}
    </View>
  );
});
