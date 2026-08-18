import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

type ChromeOverlayProps = {
  visible: boolean;
  onClose?: () => void;
  children: ReactNode;
  align?: 'end' | 'center' | 'start';
  dim?: boolean;
};

/** Fills the parent (the gap between header and tab bar). Never use RN Modal for in-app sheets. */
export function ChromeOverlay({
  visible,
  onClose,
  children,
  align = 'end',
  dim = true,
}: ChromeOverlayProps) {
  if (!visible) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 40,
        elevation: 40,
      }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onClose}
        disabled={!onClose}
        style={{
          flex: 1,
          justifyContent: align === 'center' ? 'center' : align === 'start' ? 'flex-start' : 'flex-end',
          backgroundColor: dim ? 'rgba(16, 19, 18, 0.55)' : 'transparent',
        }}>
        <Pressable onPress={(event) => event.stopPropagation()} style={{ width: '100%', maxHeight: '100%' }}>
          {children}
        </Pressable>
      </Pressable>
    </View>
  );
}
