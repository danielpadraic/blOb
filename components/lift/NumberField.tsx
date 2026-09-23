import { useEffect, useRef, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';

import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { WebTapButton } from '@/components/ui/WebTapButton';
import { startHoldRepeat } from '@/lib/holdRepeat';
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
/**
 * Two digits' worth of floor under the value.
 *
 * The steppers have fixed widths and the value flexes between them, so a row that packs in more
 * fields than fit takes all of its missing width out of the numbers — silently, because the
 * buttons still look right. This turns that into visible crowding instead of a field that reads
 * as an empty box.
 */
const MIN_VALUE_WIDTH = 24;

type NumberFieldProps = {
  value: number | null;
  onCommit: (text: string) => void;
  onStep: (direction: 1 | -1) => void;
  label: string;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
};

export function NumberField({
  value,
  onCommit,
  onStep,
  label,
  placeholder = '0',
  editable = true,
  autoFocus = false,
}: NumberFieldProps) {
  const [text, setText] = useState(() => formatLiftNumber(value));
  const focused = useRef(false);
  const inputRef = useRef<TextInput>(null);

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
      }}>
      <StepButton
        direction={-1}
        label={`Decrease ${label}`}
        disabled={!editable}
        onPress={() => onStep(-1)}
      />
      <TextInput
        ref={inputRef}
        value={text}
        editable={editable}
        autoFocus={autoFocus}
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
          minWidth: MIN_VALUE_WIDTH,
          zIndex: 2,
          height: ROW_HEIGHT - 2,
          textAlign: 'center',
          fontSize: 16,
          fontWeight: '700',
          color: THEME.textPrimary,
          paddingHorizontal: 0,
          paddingVertical: 0,
          ...(Platform.OS === 'web'
            ? ({ outlineStyle: 'none', cursor: 'text', userSelect: 'text' } as object)
            : null),
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
  const stopRef = useRef<(() => void) | null>(null);
  function startHold() {
    if (disabled) {
      return;
    }
    onPress();
    stopRef.current?.();
    stopRef.current = startHoldRepeat(onPress);
  }
  function stopHold() {
    stopRef.current?.();
    stopRef.current = null;
  }
  useEffect(() => () => stopHold(), []);
  return (
    <WebTapButton
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => undefined}
      onPressIn={startHold}
      onPressOut={stopHold}
      style={{
        width: BUTTON_WIDTH,
        height: ROW_HEIGHT,
        zIndex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
        opacity: disabled ? 0.35 : 1,
      }}>
      <Glyph
        name={direction === 1 ? GLYPH.plus : GLYPH.minus}
        color={THEME.textPrimary}
        size={15}
      />
    </WebTapButton>
  );
}
