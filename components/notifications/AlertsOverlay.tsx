import { useEffect } from 'react';
import { BackHandler, Pressable, View } from 'react-native';

import { AlertsPanel } from '@/components/notifications/AlertsPanel';
import { THEME, themeShadow } from '@/lib/theme';

type AlertsOverlayProps = {
  visible: boolean;
  onClose: () => void;
};

export function AlertsOverlay({ visible, onClose }: AlertsOverlayProps) {
  useEffect(() => {
    if (!visible) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) {
    return null;
  }

  return (
    <View
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
        accessibilityLabel="Dismiss alerts"
        onPress={onClose}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(16, 19, 18, 0.28)',
        }}
      />
      <View
        style={{
          marginTop: 8,
          marginHorizontal: 12,
          maxHeight: 420,
          backgroundColor: THEME.surface,
          borderColor: THEME.border,
          borderWidth: 1,
          borderRadius: 22,
          overflow: 'hidden',
          ...themeShadow('card'),
        }}>
        <AlertsPanel compact onClose={onClose} />
      </View>
    </View>
  );
}
