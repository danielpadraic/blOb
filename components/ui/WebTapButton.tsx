import { createElement, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

const TAP = 44;

type WebTapButtonProps = {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * iPhone Safari often never fires RN-web Pressable onPress.
 * Web uses a real <button type="button"> so the tap reaches JS.
 */
export function WebTapButton({
  onPress,
  accessibilityLabel,
  children,
  disabled,
  style,
}: WebTapButtonProps) {
  if (Platform.OS === 'web') {
    return createElement(
      'button',
      {
        type: 'button',
        'aria-label': accessibilityLabel,
        disabled: Boolean(disabled),
        onClick: (event: { stopPropagation: () => void; preventDefault: () => void }) => {
          event.preventDefault();
          event.stopPropagation();
          if (!disabled) {
            onPress();
          }
        },
        style: {
          appearance: 'none',
          WebkitAppearance: 'none',
          background: 'transparent',
          borderStyle: 'solid',
          borderWidth: 0,
          margin: 0,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled ? 'default' : 'pointer',
          minWidth: TAP,
          minHeight: TAP,
          boxSizing: 'border-box',
          ...cssFromRn(StyleSheet.flatten(style)),
        },
      },
      children,
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      hitSlop={12}
      style={style}>
      {children}
    </Pressable>
  );
}

function cssFromRn(style?: ViewStyle | null): Record<string, unknown> {
  if (!style) {
    return {};
  }
  const {
    paddingHorizontal,
    paddingVertical,
    marginHorizontal,
    marginVertical,
    ...rest
  } = style as ViewStyle & {
    paddingHorizontal?: number;
    paddingVertical?: number;
    marginHorizontal?: number;
    marginVertical?: number;
  };
  return {
    ...rest,
    ...(paddingHorizontal != null
      ? { paddingLeft: paddingHorizontal, paddingRight: paddingHorizontal }
      : null),
    ...(paddingVertical != null ? { paddingTop: paddingVertical, paddingBottom: paddingVertical } : null),
    ...(marginHorizontal != null ? { marginLeft: marginHorizontal, marginRight: marginHorizontal } : null),
    ...(marginVertical != null ? { marginTop: marginVertical, marginBottom: marginVertical } : null),
  };
}
