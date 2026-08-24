import { Platform } from 'react-native';

export async function successHaptic(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12);
      }
      return;
    }
    const Haptics = await import('expo-haptics');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Haptics are optional. Never block submit.
  }
}
