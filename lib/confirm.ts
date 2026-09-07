import { Alert, Platform } from 'react-native';

export type ConfirmInput = {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
};

/**
 * One confirm for iOS, Android, and Web. React Native Web drops Alert buttons,
 * so a destructive tap there would go through unasked without this.
 */
export function confirmDestructive(input: ConfirmInput) {
  const cancelLabel = input.cancelLabel ?? 'Cancel';
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
      input.onConfirm();
      return;
    }
    const prompt = input.message ? `${input.title}\n\n${input.message}` : input.title;
    if (window.confirm(prompt)) {
      input.onConfirm();
    } else {
      input.onCancel?.();
    }
    return;
  }
  Alert.alert(input.title, input.message, [
    { text: cancelLabel, style: 'cancel', onPress: input.onCancel },
    { text: input.confirmLabel, style: 'destructive', onPress: input.onConfirm },
  ]);
}
