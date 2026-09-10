import type { ReactNode } from 'react';
import { useWindowDimensions, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '@/components/ui/KeyboardFormShell';
import { liftShareSheetInset } from '@/lib/liftShareInset';

/**
 * Bottom sheet body that stays above the keyboard.
 *
 * ChromeOverlay is position-absolute, so wrapping it in KeyboardAvoidingView often cannot see
 * the keyboard. Inset is keyboardHeight when the keys are up (visualViewport on web, Keyboard
 * events on iOS/Android) — never keyboard + tabBarLift + 88.
 *
 * When the keyboard is up, the sheet fills the visible height so a flex:1 ScrollView inside
 * actually has a height to scroll. Home-indicator padding is dropped while the keyboard is open
 * (same lock as createStickyFooterPad).
 */
export function KeyboardSheet({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  const keyboardHeight = useKeyboardHeight();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const lifted = liftShareSheetInset(keyboardHeight, 0);
  const cap = Math.max(280, height - lifted - 8);
  const restPad = lifted > 0 ? 0 : Math.max(insets.bottom, 12);

  return (
    <View
      style={[
        {
          width: '100%',
          maxHeight: cap,
          height: lifted > 0 ? cap : undefined,
          marginBottom: lifted,
        },
        style,
      ]}>
      <View style={{ flex: lifted > 0 ? 1 : undefined, maxHeight: cap, minHeight: 0, paddingBottom: restPad }}>
        {children}
      </View>
    </View>
  );
}
