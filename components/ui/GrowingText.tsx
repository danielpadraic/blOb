import { createElement, forwardRef, useEffect, useState } from 'react';
import { Platform, TextInput, type TextInputProps } from 'react-native';

import {
  COMPOSER_LINE_HEIGHT,
  COMPOSER_MAX_LINES,
  COMPOSER_MIN_HEIGHT,
  composerFieldHeight,
} from '@/lib/composerField';
import { THEME } from '@/lib/theme';
import { flattenWebInputStyle } from '@/lib/webInputStyle';

export type GrowingTextProps = Omit<TextInputProps, 'multiline' | 'numberOfLines'> & {
  collapsed?: boolean;
  maxLines?: number;
  minHeight?: number;
  lineHeight?: number;
  name?: string;
};

export const GrowingText = forwardRef<TextInput, GrowingTextProps>(function GrowingText(
  {
    collapsed,
    maxLines = COMPOSER_MAX_LINES,
    minHeight = COMPOSER_MIN_HEIGHT,
    lineHeight = COMPOSER_LINE_HEIGHT,
    value,
    onChangeText,
    onContentSizeChange,
    style,
    name,
    ...props
  },
  ref,
) {
  const [height, setHeight] = useState(() =>
    composerFieldHeight({ collapsed, text: String(value ?? ''), minHeight, maxLines, lineHeight }),
  );
  const pad = Math.max(0, minHeight - lineHeight);
  const maxHeight = lineHeight * maxLines + pad;

  function apply(text: string, contentHeight?: number) {
    const next = composerFieldHeight({
      collapsed,
      text,
      contentHeight,
      minHeight,
      maxLines,
      lineHeight,
    });
    setHeight((current) => (current === next ? current : next));
  }

  useEffect(() => {
    apply(String(value ?? ''));
    // Recalc when chrome collapses / expands so the full draft comes back on focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, value, minHeight, maxLines, lineHeight]);

  const box = [
    {
      minHeight,
      maxHeight: collapsed ? minHeight : maxHeight,
      textAlignVertical: 'top' as const,
    },
    Platform.OS === 'web'
      ? ({
          minHeight: collapsed ? minHeight : height,
          height: undefined,
          overflowY: 'auto',
          overflowAnchor: 'none',
          resize: 'none',
          fieldSizing: collapsed ? 'fixed' : 'content',
        } as object)
      : { height: collapsed ? minHeight : height },
    style,
  ];

  if (Platform.OS === 'web') {
    return createElement('textarea', {
      ref,
      name,
      value: value ?? '',
      rows: 1,
      maxLength: props.maxLength,
      placeholder: props.placeholder,
      disabled: props.editable === false,
      autoCapitalize: props.autoCapitalize === 'none' ? 'off' : props.autoCapitalize,
      autoCorrect: props.autoCorrect === false ? 'off' : undefined,
      spellCheck: props.autoCorrect !== false,
      onChange: (event: { currentTarget: { value: string } }) => {
        const next = event.currentTarget.value;
        apply(next);
        onChangeText?.(next);
      },
      onInput: (event: { currentTarget: { value: string } }) => {
        const next = event.currentTarget.value;
        apply(next);
        onChangeText?.(next);
      },
      onFocus: props.onFocus,
      onBlur: props.onBlur,
      style: {
        width: '100%',
        boxSizing: 'border-box',
        outline: 'none',
        borderStyle: 'solid',
        fontFamily: 'inherit',
        caretColor: THEME.accent,
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        ...flattenWebInputStyle(box),
      },
    });
  }

  return (
    <TextInput
      ref={ref}
      {...props}
      value={value}
      multiline
      scrollEnabled={!collapsed && height >= maxHeight - 2}
      textAlignVertical="top"
      onChangeText={(text) => {
        apply(text);
        onChangeText?.(text);
      }}
      onContentSizeChange={(event) => {
        apply(String(value ?? ''), event.nativeEvent.contentSize.height);
        onContentSizeChange?.(event);
      }}
      style={box}
    />
  );
});
