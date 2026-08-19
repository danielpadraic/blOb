import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

type ChromeOverlayProps = {
  visible: boolean;
  onClose?: () => void;
  children: ReactNode;
  align?: 'end' | 'center' | 'start';
  dim?: boolean | 'heavy';
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

  const justifyContent = align === 'center' ? 'center' : align === 'start' ? 'flex-start' : 'flex-end';
  const scrim =
    dim === 'heavy' ? 'rgba(16, 19, 18, 0.88)' : dim ? 'rgba(16, 19, 18, 0.55)' : 'transparent';

  return (
    <View pointerEvents="auto" style={styles.host}>
      <View
        accessibilityRole="none"
        accessibilityLabel={onClose ? 'Dismiss' : undefined}
        accessible={Boolean(onClose)}
        style={[styles.backdrop, { backgroundColor: scrim }]}
        onStartShouldSetResponder={() => Boolean(onClose)}
        onResponderRelease={() => onClose?.()}
        {...(Platform.OS === 'web' && onClose ? ({ onClick: onClose } as object) : null)}
      />
      <View pointerEvents="box-none" style={[styles.slot, { justifyContent }]}>
        <View pointerEvents="auto" style={styles.sheet}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
    elevation: 40,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  slot: {
    flex: 1,
    maxHeight: '100%',
  },
  sheet: {
    width: '100%',
    maxHeight: '100%',
  },
});
