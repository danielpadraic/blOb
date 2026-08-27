import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

type DismissKeyboardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Layout wrapper only. A parent Pressable blurs web TextInputs on tap (iOS Safari). */
export function DismissKeyboard({ children, style }: DismissKeyboardProps) {
  return <View style={style}>{children}</View>;
}
