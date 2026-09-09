import { Platform, View } from 'react-native';
import { useEffect } from 'react';
import { router, usePathname, type ErrorBoundaryProps } from 'expo-router';

import { MascotState } from '@/components/mascot/MascotState';
import { stopAllLiveMedia } from '@/lib/cameraSession';
import { TABS_HREF, errorRetryHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import { reportAppError } from '@/lib/appErrors';

function webPathname(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return String(window.location?.pathname ?? '');
}

function reloadApp(retry: () => Promise<void>, pathname: string) {
  stopAllLiveMedia();
  const current = pathname || webPathname();
  const next = errorRetryHref(current);
  if (!next || next.includes('/capture')) {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.location?.replace === 'function') {
      window.location.replace('/feed');
      return;
    }
    router.replace(TABS_HREF);
    return;
  }
  if (next !== current) {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.location?.replace === 'function') {
      window.location.replace(next);
      return;
    }
    router.replace(next as never);
    return;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
    window.location.reload();
    return;
  }
  void retry();
}

/** Root error UI. Cream background — never a black full-screen. Retry never reopens a bad Wave. */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const pathname = usePathname();
  useEffect(() => {
    stopAllLiveMedia();
    const path = pathname || webPathname();
    const message = error?.message?.trim() || 'Something went wrong';
    if (path.includes('/challenges/') && !path.includes('/submit') && !path.includes('/capture')) {
      console.log('[blob:live]', {
        reason: 'app-boundary',
        message,
        stack: error?.stack ?? null,
        pathname: path,
      });
    }
    reportAppError({
      route: 'error_boundary',
      error,
      message,
      payload: { pathname: path || null },
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
        onAction={() => reloadApp(retry, pathname)}
      />
    </View>
  );
}
