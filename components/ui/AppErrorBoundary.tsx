import { Platform, View } from 'react-native';
import { useEffect } from 'react';
import { router, usePathname, type ErrorBoundaryProps } from 'expo-router';

import { MascotState } from '@/components/mascot/MascotState';
import { stopAllLiveMedia } from '@/lib/cameraSession';
import { liveErrorFile } from '@/lib/liveThread';
import { TABS_HREF, errorBoundaryRetryHref } from '@/lib/routes';
import { logWaveFail } from '@/lib/wavePublish';
import { THEME } from '@/lib/theme';
import { reportAppError } from '@/lib/appErrors';

function webPathname(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return String(window.location?.pathname ?? '') + String(window.location?.search ?? '');
}

function leaveCameraForHome() {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.location?.replace === 'function') {
    window.location.replace('/feed');
    return;
  }
  router.replace(TABS_HREF);
}

/**
 * Remount the screen that threw. Never /capture, never Wave, never InAppCamera.
 * Home Retry stays on Home.
 */
function remountThrownScreen(retry: () => Promise<void>, pathname: string, error?: unknown) {
  stopAllLiveMedia();
  const current = pathname || webPathname();
  const next = errorBoundaryRetryHref(current);
  const waveish = /\/wave\/|\/story\/|\/capture/.test(current);
  if (waveish) {
    logWaveFail(current.includes('/capture') ? 'insert' : 'player', error);
  }
  console.log('[blob:live]', {
    error: error instanceof Error ? error.message : String(error ?? 'retry'),
    file: liveErrorFile(error),
  });
  if (current.includes('/capture') || next.includes('/capture')) {
    leaveCameraForHome();
    return;
  }
  void retry();
}

/** Root error UI. Cream background — never a black full-screen. Retry never reopens Wave. */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const pathname = usePathname();
  useEffect(() => {
    stopAllLiveMedia();
    const path = pathname || webPathname();
    const message = error?.message?.trim() || 'Something went wrong';
    if (path.includes('/challenges/') && !path.includes('/submit') && !path.includes('/capture')) {
      console.log('[blob:live]', {
        reason: 'app-boundary',
        error: message,
        file: liveErrorFile(error),
        stack: error?.stack ?? null,
        pathname: path,
      });
    }
    reportAppError({
      route: 'error_boundary',
      error,
      message,
      payload: { pathname: path || null, file: liveErrorFile(error) },
    });
  }, [error, pathname]);
  const detail = error?.message?.trim() || '';
  return (
    <View className="flex-1 justify-center" style={{ backgroundColor: THEME.background }}>
      <MascotState
        kind="error"
        title="Something went wrong"
        body={detail ? `Try again in a moment.\n${detail}` : 'Try again in a moment.'}
        actionLabel="Retry"
        onAction={() => remountThrownScreen(retry, pathname, error)}
      />
    </View>
  );
}
