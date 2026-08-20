import { Platform, View } from 'react-native';
import { type ErrorBoundaryProps } from 'expo-router';

import { MascotState } from '@/components/mascot/MascotState';
import { THEME } from '@/lib/theme';

function reloadApp(retry: () => Promise<void>) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.reload();
    return;
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
