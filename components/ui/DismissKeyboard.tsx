import type { ReactNode } from 'react';
import { Keyboard, Pressable, type StyleProp, type ViewStyle } from 'react-native';

type DismissKeyboardProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Tap empty canvas to hide keys. Does not clear the field or leave the screen. */
export function DismissKeyboard({ children, style }: DismissKeyboardProps) {
  return (
    <Pressable accessible={false} style={style} onPress={Keyboard.dismiss}>
      {children}
    </Pressable>
  );
}
