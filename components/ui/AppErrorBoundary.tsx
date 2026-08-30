import { Platform, View } from 'react-native';
import { useEffect } from 'react';
import { type ErrorBoundaryProps } from 'expo-router';

import { MascotState } from '@/components/mascot/MascotState';
import { stopAllLiveMedia } from '@/lib/cameraSession';
import { errorRetryHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import { reportAppError } from '@/lib/appErrors';

function webPathname(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return String(window.location?.pathname ?? '');
}

function reloadApp(retry: () => Promise<void>) {
  stopAllLiveMedia();
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const next = errorRetryHref(webPathname());
    if (next && typeof window.location.replace === 'function') {
      window.location.replace(next);
      return;
    }
    if (typeof window.location.reload === 'function' && !webPathname().includes('/capture')) {
      window.location.reload();
      return;
    }
  }
  void retry();
}

/** Root error UI. Cream background — never a black full-screen. Retry never reopens Wave. */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    stopAllLiveMedia();
    reportAppError({
      route: 'error_boundary',
      error,
      message: error?.message?.trim() || 'Something went wrong',
    });
  }, [error]);
  return (
    <View className="flex-1 justify-center" style={{ backgroundColor: THEME.background }}>
      <MascotState
        kind="error"
        title="Something went wrong"
        body="Try again in a moment."
        actionLabel="Retry"
        onAction={() => reloadApp(retry)}
      />
    </View>
  );
}
