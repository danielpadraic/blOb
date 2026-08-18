import { useEffect } from 'react';
import { BackHandler, View } from 'react-native';

import { AlertsPanel } from '@/components/notifications/AlertsPanel';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
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

  return (
    <ChromeOverlay visible={visible} onClose={onClose} align="start" dim>
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
    </ChromeOverlay>
  );
}
