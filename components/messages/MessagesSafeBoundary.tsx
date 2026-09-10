import { Component, Fragment, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { usePathname, useRouter, type ErrorBoundaryProps, type Href } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { errorBoundaryRetryHref, messagesRetryHref, MESSAGES_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';

function MessagesFail({
  onRetry,
  onBack,
  compact,
  variant = 'list',
}: {
  onRetry: () => void;
  onBack?: () => void;
  compact?: boolean;
  variant?: 'list' | 'thread';
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
        {variant === 'thread' ? 'Couldn’t open that chat' : 'Couldn’t load messages'}
      </AppText>
      <AppText className="text-muted" style={{ fontSize: compact ? 12 : 14 }}>
        Try again. Home is still there.
      </AppText>
      <View className="flex-row flex-wrap gap-2">
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
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            style={{
              minHeight: 44,
              paddingHorizontal: 16,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: THEME.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <AppText className="text-[14px] font-semibold text-charcoal">Back</AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

type Props = { children: ReactNode; compact?: boolean; variant?: 'list' | 'thread' };

type State = { failed: boolean; nonce: number };

/** Header inbox and /messages. A throw here must not kill Home / Live / Lifts. */
export class MessagesSafeBoundary extends Component<Props, State> {
  state: State = { failed: false, nonce: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  render() {
    if (this.state.failed) {
      return (
        <MessagesFail
          compact={this.props.compact}
          variant={this.props.variant}
          onRetry={() => this.setState((current) => ({ failed: false, nonce: current.nonce + 1 }))}
        />
      );
    }
    return <Fragment key={this.state.nonce}>{this.props.children}</Fragment>;
  }
}

export function MessagesRouteErrorBoundary({ retry }: ErrorBoundaryProps) {
  const pathname = usePathname();
  const nav = useRouter();
  const chat = messagesRetryHref(pathname);
  const href = chat || errorBoundaryRetryHref(pathname || MESSAGES_HREF);
  const variant = chat && chat !== '/messages' ? 'thread' : 'list';

  useEffect(() => {
    if (href.includes('/capture') || href.includes('/submit')) {
      const replace = nav.replace;
      if (typeof replace === 'function') {
        replace(MESSAGES_HREF);
      }
    }
  }, [href, nav]);

  return (
    <Screen>
      <MessagesFail
        variant={variant}
        onRetry={() => {
          if (!href || href.includes('/capture') || href.includes('/submit')) {
            const replace = nav.replace;
            if (typeof replace === 'function') {
              replace(MESSAGES_HREF);
            }
            return;
          }
          const replace = nav.replace;
          if (typeof replace === 'function' && href !== pathname) {
            replace(href as Href);
          }
          const run = retry;
          if (typeof run === 'function') {
            void run();
          }
        }}
        onBack={() => {
          const canGoBack = nav.canGoBack;
          const back = nav.back;
          if (typeof canGoBack === 'function' && canGoBack() && typeof back === 'function') {
            back();
            return;
          }
          const replace = nav.replace;
          if (typeof replace === 'function') {
            replace(MESSAGES_HREF);
          }
        }}
      />
    </Screen>
  );
}
