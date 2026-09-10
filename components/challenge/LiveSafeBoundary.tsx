import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import { liveErrorFile } from '@/lib/liveThread';
import { reportAppError } from '@/lib/appErrors';
import { THEME } from '@/lib/theme';

export function liveThrowMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  const text = String(error ?? '').trim();
  return text || 'Something went wrong';
}

/** Real throw + stack. Do not hide this behind Bob. */
export function logLiveThrow(
  reason: string,
  error: unknown,
  extra?: { componentStack?: string | null; postId?: string | null },
): string {
  const message = liveThrowMessage(error);
  const err = error instanceof Error ? error : null;
  if (__DEV__) {
    console.log('[blob:live]', {
      reason,
      error: message,
      file: liveErrorFile(error),
      postId: extra?.postId ?? null,
    });
  }
  reportAppError({
    route: 'challenge/live-boundary',
    error: err ?? new Error(message),
    message,
    payload: { reason, postId: extra?.postId ?? null },
  });
  return message;
}

export function LiveFailBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: THEME.border,
        backgroundColor: THEME.surface,
        gap: 6,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 }}>
        <AppText className="text-[13px]" style={{ flex: 1, minWidth: 0, color: THEME.textPrimary }}>
          {copy('live.loadFailed')}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry"
          onPress={onRetry}
          style={{ minHeight: 36, justifyContent: 'center' }}>
          <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
            Retry
          </AppText>
        </Pressable>
      </View>
      {message ? (
        <AppText className="text-[12px]" style={{ color: THEME.textMuted }}>
          {message}
        </AppText>
      ) : null}
    </View>
  );
}

type BoundaryProps = {
  children: ReactNode;
  /** When set, a throw keeps this chrome and only remounts children. */
  fallback?: ReactNode;
};

type BoundaryState = {
  error: Error | null;
  nonce: number;
};

/**
 * Catches a Live list throw so Overview / Board / tabs / composer stay up.
 * Retry remounts the list only — never Check In camera, never Home.
 */
export class LiveSafeBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, nonce: 0 };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logLiveThrow('list', error, { componentStack: info.componentStack ?? null });
  }

  retry = () => {
    console.log('[blob:live]', {
      error: liveThrowMessage(this.state.error),
      file: liveErrorFile(this.state.error),
    });
    this.setState((current) => ({ error: null, nonce: current.nonce + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <LiveFailBanner message={liveThrowMessage(this.state.error)} onRetry={this.retry} />
        )
      );
    }
    return <View key={this.state.nonce} style={{ flex: 1, minHeight: 0 }}>{this.props.children}</View>;
  }
}

type RowProps = {
  children: ReactNode;
  postId?: string | null;
  onError?: (message: string) => void;
};

type RowState = { failed: boolean };

/** One bad bubble is skipped. The rest of the thread stays. */
export class LiveRowBoundary extends Component<RowProps, RowState> {
  state: RowState = { failed: false };

  static getDerivedStateFromError(): RowState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const message = logLiveThrow('row', error, {
      componentStack: info.componentStack ?? null,
      postId: this.props.postId ?? null,
    });
    this.props.onError?.(message);
  }

  render() {
    if (this.state.failed) {
      return null;
    }
    return this.props.children;
  }
}
