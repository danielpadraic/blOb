import { Platform, View } from 'react-native';
import { type ErrorBoundaryProps } from 'expo-router';

import { MascotState } from '@/components/mascot/MascotState';
import { THEME } from '@/lib/theme';

function reloadApp(retry: () => Promise<void>) {
  if (Platform.OS === 'web' && typeof globalThis !== 'undefined' && 'location' in globalThis) {
    const loc = (globalThis as { location?: { reload?: () => void } }).location;
    if (typeof loc?.reload === 'function') {
      loc.reload();
      return;
    }
  }
  void retry();
}

/** Root error UI. Cream background — never a black full-screen. Retry reloads the app. */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 justify-center" style={{ backgroundColor: THEME.background }}>
      <MascotState
        kind="error"
        title="Something went wrong"
        body={error?.message?.trim() || 'Try again in a moment.'}
        actionLabel="Retry"
        onAction={() => reloadApp(retry)}
      />
    </View>
  );
}
