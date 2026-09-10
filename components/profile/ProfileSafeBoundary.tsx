import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router, usePathname, useRouter, type ErrorBoundaryProps, type Href } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { profileRetryHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';

function goBackFromProfile() {
  const canGoBack = router.canGoBack;
  const back = router.back;
  if (typeof canGoBack === 'function' && canGoBack()) {
    if (typeof back === 'function') {
      back();
    }
    return;
  }
  const replace = router.replace;
  if (typeof replace === 'function') {
    replace('/feed');
  }
}

function ProfileFail({
  onRetry,
  onBack,
}: {
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <Screen>
      <View
        style={{
          marginTop: 24,
          marginHorizontal: 16,
          padding: 16,
          borderRadius: THEME.radius,
          borderWidth: 1,
          borderColor: THEME.border,
          backgroundColor: THEME.surface,
          gap: 12,
        }}>
        <AppText className="text-[17px] font-extrabold text-charcoal">Couldn’t open this profile</AppText>
        <AppText className="text-[14px] text-muted">Try again in a moment. Home is still there.</AppText>
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
            }}>
            <AppText className="text-[14px] font-bold" style={{ color: THEME.primaryForeground }}>
              Retry
            </AppText>
          </Pressable>
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
        </View>
      </View>
    </Screen>
  );
}

type Props = { children: ReactNode };

type State = { failed: boolean };

/** Keeps a profile throw off the tab AppErrorBoundary so Home / Live stay up. */
export class ProfileSafeBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Fail-soft: chrome Retry remounts this profile. Never /capture.
  }

  render() {
    if (this.state.failed) {
      return (
        <ProfileFail
          onRetry={() => this.setState({ failed: false })}
          onBack={goBackFromProfile}
        />
      );
    }
    return this.props.children;
  }
}

/** Posts / friends / challenges block. Chrome (avatar, name, Back) stays. */
export class ProfileSectionBoundary extends Component<
  { children: ReactNode; onRetry?: () => void; label?: string },
  State
> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <View style={{ paddingVertical: 12, gap: 8 }}>
          <AppText className="text-[13px] text-muted">
            {this.props.label ?? 'Couldn’t load this section.'}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry"
            onPress={() => {
              this.setState({ failed: false });
              const run = this.props.onRetry;
              if (typeof run === 'function') {
                run();
              }
            }}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
              Retry
            </AppText>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

/** Expo Router route boundary for /feed/u/{id} and friends/challenges/profile copies. */
export function ProfileRouteErrorBoundary({ retry }: ErrorBoundaryProps) {
  const pathname = usePathname();
  const nav = useRouter();
  const href = profileRetryHref(pathname);

  useEffect(() => {
    if (href.includes('/capture')) {
      const replace = nav.replace;
      if (typeof replace === 'function') {
        replace('/feed');
      }
    }
  }, [href, nav]);

  return (
    <ProfileFail
      onRetry={() => {
        if (!href) {
          goBackFromProfile();
          return;
        }
        const replace = nav.replace;
        if (typeof replace === 'function' && href !== pathname && !href.includes('/capture')) {
          replace(href as Href);
        }
        const run = retry;
        if (typeof run === 'function') {
          void run();
        }
      }}
      onBack={goBackFromProfile}
    />
  );
}
