import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { MascotState } from '@/components/mascot/MascotState';
import { reportAppError } from '@/lib/appErrors';
import { stopAllLiveMedia } from '@/lib/cameraSession';
import { THEME } from '@/lib/theme';

type Props = {
  children: ReactNode;
  onClose?: () => void;
};

type State = { failed: boolean };

/** A camera crash stops every stream and shows a soft retry. It never reaches AppErrorBoundary. */
export class CameraSafeBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    stopAllLiveMedia();
    reportAppError({
      route: 'camera',
      error,
      message: error.message,
      payload: { stack: [error.stack, info.componentStack].filter(Boolean).join('\n') || null },
    });
  }

  componentWillUnmount() {
    stopAllLiveMedia();
  }

  retry = () => {
    stopAllLiveMedia();
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }
    return (
      <View className="flex-1" style={{ backgroundColor: THEME.background }}>
        <MascotState
          kind="error"
          title="Camera isn’t available"
          body="Try again, or close and come back."
          actionLabel="Try again"
          onAction={this.retry}
        />
        {this.props.onClose ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={this.props.onClose}
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <AppText className="text-[15px] font-semibold" style={{ color: THEME.accent }}>
              Close
            </AppText>
          </Pressable>
        ) : null}
      </View>
    );
  }
}
