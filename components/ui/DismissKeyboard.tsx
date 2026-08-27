import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { dismissKeyboard } from '@/utils/keyboard';

type DismissKeyboardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Tap blank / label chrome to hide the keyboard. Child buttons still receive the press. */
export function DismissKeyboard({ children, style }: DismissKeyboardProps) {
  return (
    <Pressable accessible={false} onPress={dismissKeyboard} style={style}>
      {children}
    </Pressable>
  );
}
