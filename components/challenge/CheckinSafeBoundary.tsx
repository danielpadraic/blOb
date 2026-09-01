import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { router, usePathname, type ErrorBoundaryProps, type Href } from 'expo-router';

import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { stopAllLiveMedia } from '@/lib/cameraSession';
import { errorRetryHref } from '@/lib/routes';

function CheckinFail({ onBack }: { onBack: () => void }) {
  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES}>
      <MascotState
        kind="error"
        title="Couldn’t open that check-in"
        body="Try again in a moment."
        actionLabel="Back"
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
};

type State = { failed: boolean };

/** Keeps a check-in child crash off the tab ErrorBoundary and kills the Safari camera pip. */
export class CheckinSafeBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    stopAllLiveMedia();
  }

  componentWillUnmount() {
    stopAllLiveMedia();
  }

  render() {
    if (this.state.failed) {
      return <CheckinFail onBack={this.props.onBack} />;
    }
    return this.props.children;
  }
}

/** Expo Router route boundary for submit — not the tab “Something went wrong” Bob. */
export function CheckinRouteErrorBoundary({ retry }: ErrorBoundaryProps) {
  const pathname = usePathname();
  useEffect(() => {
    stopAllLiveMedia();
  }, []);
  return (
    <CheckinFail
      onBack={() => {
        stopAllLiveMedia();
        const next = errorRetryHref(pathname);
        if (!next || next.includes('/capture')) {
          router.replace('/feed' as Href);
          return;
        }
        if (next !== pathname) {
          router.replace(next as Href);
          return;
        }
        void retry();
      }}
    />
  );
}
