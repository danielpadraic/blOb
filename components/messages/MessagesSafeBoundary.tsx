import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { usePathname, useRouter, type ErrorBoundaryProps } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { errorBoundaryRetryHref, MESSAGES_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';

function MessagesFail({
  onRetry,
  compact,
}: {
  onRetry: () => void;
  compact?: boolean;
}) {
  return (
    <View
      style={{
        paddingHorizontal: compact ? 14 : 16,
        paddingVertical: compact ? 12 : 20,
        gap: 10,
      }}>
      <AppText
        className="font-extrabold text-charcoal"
        style={{ fontSize: compact ? 14 : 17 }}>
        Couldn’t load messages
      </AppText>
      <AppText className="text-muted" style={{ fontSize: compact ? 12 : 14 }}>
        Try again. Home is still there.
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry"
        onPress={onRetry}
        style={{
          minHeight: 44,
          paddingHorizontal: 16,
          borderRadius: 14,
          backgroundColor: THEME.primary,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'flex-start',
        }}>
        <AppText className="text-[14px] font-bold" style={{ color: THEME.primaryForeground }}>
          Retry
        </AppText>
      </Pressable>
    </View>
  );
}

type Props = { children: ReactNode; compact?: boolean };

type State = { failed: boolean };

/** Header inbox and /messages. A throw here must not kill Home / Live / Lifts. */
export class MessagesSafeBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  render() {
    if (this.state.failed) {
      return (
        <MessagesFail
          compact={this.props.compact}
          onRetry={() => this.setState({ failed: false })}
        />
      );
    }
    return this.props.children;
  }
}

export function MessagesRouteErrorBoundary({ retry }: ErrorBoundaryProps) {
  const pathname = usePathname();
  const nav = useRouter();
  const href = errorBoundaryRetryHref(pathname || MESSAGES_HREF);

  useEffect(() => {
    if (href.includes('/capture')) {
      const replace = nav.replace;
      if (typeof replace === 'function') {
        replace(MESSAGES_HREF);
      }
    }
  }, [href, nav]);

  return (
    <Screen>
      <MessagesFail
        onRetry={() => {
          const run = retry;
          if (typeof run === 'function') {
            void run();
          }
        }}
      />
    </Screen>
  );
}
