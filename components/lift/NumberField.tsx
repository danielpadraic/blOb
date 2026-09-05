import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { formatLiftNumber } from '@/lib/lift/session';
import { THEME } from '@/lib/theme';

/**
 * − / value / + for one number on a set row.
 *
 * The field keeps its own text while it is being typed in, so "135." is not thrown away mid-keystroke.
 * The committed value is only ever what the caller's clamp returns on blur.
 */

const BUTTON_WIDTH = 34;
const ROW_HEIGHT = 44;
/** Visual width is tight so two of these fit a phone row; the tap area is not. */
const HIT = { top: 4, bottom: 4, left: 5, right: 5 };

type NumberFieldProps = {
  value: number | null;
  onCommit: (text: string) => void;
  onStep: (direction: 1 | -1) => void;
  label: string;
  placeholder?: string;
  editable?: boolean;
};

export function NumberField({
  value,
  onCommit,
  onStep,
  label,
  placeholder = '0',
  editable = true,
}: NumberFieldProps) {
  const [text, setText] = useState(() => formatLiftNumber(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setText(formatLiftNumber(value));
    }
  }, [value]);

  function commit() {
    focused.current = false;
    onCommit(text);
  }

  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        height: ROW_HEIGHT,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: THEME.border,
        backgroundColor: editable ? THEME.surface : THEME.background,
        overflow: 'hidden',
      }}>
      <StepButton
        direction={-1}
        label={`Decrease ${label}`}
        disabled={!editable}
        onPress={() => onStep(-1)}
      />
      <TextInput
        value={text}
        editable={editable}
        onChangeText={setText}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={commit}
        onSubmitEditing={commit}
        placeholder={placeholder}
        placeholderTextColor={THEME.textMuted}
        selectTextOnFocus
        keyboardType="decimal-pad"
        inputMode="decimal"
        accessibilityLabel={label}
        selectionColor={THEME.accent}
        style={{
          flex: 1,
          minWidth: 0,
          height: ROW_HEIGHT - 2,
          textAlign: 'center',
          fontSize: 16,
          fontWeight: '700',
          color: THEME.textPrimary,
          paddingHorizontal: 0,
          paddingVertical: 0,
          ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null),
        }}
      />
      <StepButton
        direction={1}
        label={`Increase ${label}`}
        disabled={!editable}
        onPress={() => onStep(1)}
      />
    </View>
  );
}

function StepButton({
  direction,
  label,
  disabled,
  onPress,
}: {
  direction: 1 | -1;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={HIT}
      onPress={onPress}
      style={({ pressed }) => ({
        width: BUTTON_WIDTH,
        height: ROW_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? THEME.accentSoft : 'transparent',
        opacity: disabled ? 0.35 : 1,
      })}>
      <Glyph
        name={direction === 1 ? GLYPH.plus : GLYPH.minus}
        color={THEME.textPrimary}
        size={15}
      />
    </Pressable>
  );
}
