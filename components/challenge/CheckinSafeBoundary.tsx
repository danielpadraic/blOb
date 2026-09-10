import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { router, usePathname, type ErrorBoundaryProps, type Href } from 'expo-router';

import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { reportAppError } from '@/lib/appErrors';
import { stopAllLiveMedia } from '@/lib/cameraSession';
import { checkinSubmitHref, errorRetryHref } from '@/lib/routes';

function checkinIdFromHref(href?: string | null): string | null {
  const match = String(href ?? '').match(/\/challenges\/([^/?#]+)\/submit/);
  return match?.[1] ?? null;
}

function logCheckinOpenFailure(
  error: unknown,
  extra: { href?: string | null; id?: string | null; focused?: boolean | null; stack?: string | null },
) {
  const err = error instanceof Error ? error : new Error(String(error ?? 'checkin open failed'));
  const payload = {
    href: extra.href ?? null,
    id: extra.id ?? checkinIdFromHref(extra.href),
    focused: extra.focused ?? null,
    message: err.message,
    stack: extra.stack || err.stack || null,
  };
  if (__DEV__) {
    console.log('[blob:checkin]', {
      href: payload.href,
      id: payload.id,
      focused: payload.focused,
      message: payload.message,
    });
  }
  reportAppError({
    route: 'checkin_open',
    error: err,
    message: err.message,
    payload,
  });
}

function CheckinFail({ onBack }: { onBack: () => void }) {
  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES}>
      <MascotState
        kind="error"
        title="Couldn’t open that check-in"
        body="Try again in a moment."
        actionLabel="Try again"
        onAction={() => {
          stopAllLiveMedia();
          onBack();
        }}
      />
    </Screen>
  );
}

type Props = {
  children: ReactNode;
  onBack: () => void;
  href?: string | null;
  id?: string | null;
  focused?: boolean | null;
};

type State = { failed: boolean };

/** Keeps a check-in child crash off the tab ErrorBoundary and kills the Safari camera pip. */
export class CheckinSafeBoundary extends Component<Props, State> {
  state: State = { failed: false };

  remountSubmit = () => {
    stopAllLiveMedia();
    this.setState({ failed: false });
    const id = this.props.id || checkinIdFromHref(this.props.href);
    if (id) {
      router.replace(checkinSubmitHref(id) as Href);
    }
  };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    stopAllLiveMedia();
    logCheckinOpenFailure(error, {
      href: this.props.href,
      id: this.props.id,
      focused: this.props.focused,
      stack: [error.stack, info.componentStack].filter(Boolean).join('\n') || null,
    });
  }

  componentWillUnmount() {
    stopAllLiveMedia();
  }

  render() {
    if (this.state.failed) {
      return <CheckinFail onBack={this.remountSubmit} />;
    }
    return this.props.children;
  }
}

/** Expo Router route boundary for submit — not the tab “Something went wrong” Bob. */
export function CheckinRouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const pathname = usePathname();
  useEffect(() => {
    stopAllLiveMedia();
    logCheckinOpenFailure(error, { href: pathname, id: checkinIdFromHref(pathname), focused: null });
  }, [error, pathname]);
  return (
    <CheckinFail
      onBack={() => {
        stopAllLiveMedia();
        const id = checkinIdFromHref(pathname);
        if (id) {
          router.replace(checkinSubmitHref(id) as Href);
          void retry();
          return;
        }
        const live = errorRetryHref(pathname);
        if (!live || live.includes('/capture')) {
          router.replace('/challenges' as Href);
          return;
        }
        if (live !== pathname) {
          router.replace(live as Href);
          return;
        }
        void retry();
      }}
    />
  );
}
