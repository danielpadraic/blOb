import { type ReactNode, type Ref } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type ViewProps,
} from 'react-native';
import { useSegments } from 'expo-router';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { isInsideTabChrome } from '@/components/wallet/TabChrome';
import { TAB_BAR_PEEK, THEME } from '@/lib/theme';
import { cn } from '@/utils/cn';

const DEFAULT_EDGES: Edge[] = ['top', 'left', 'right'];
const SCREEN_BACKGROUND = { backgroundColor: THEME.background };

type ScreenProps = ViewProps & {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  className?: string;
  edges?: readonly Edge[];
  scrollRef?: Ref<ScrollView>;
};

export function Screen({
  children,
  scroll = false,
  padded = true,
  className,
  edges = DEFAULT_EDGES,
  scrollRef,
  ...props
}: ScreenProps) {
  const segments = useSegments();
  const insideChrome = isInsideTabChrome(segments as string[]);
  const resolvedEdges: readonly Edge[] = insideChrome
    ? edges.filter((edge) => edge !== 'top' && edge !== 'bottom')
    : edges.includes('bottom')
      ? edges
      : [...edges, 'bottom'];
  const body = (
    <View
      className={cn('flex-1', padded && 'px-4', className)}
      style={SCREEN_BACKGROUND}
      {...props}>
      {children}
    </View>
  );

  return (
    <SafeAreaView className="flex-1" style={SCREEN_BACKGROUND} edges={resolvedEdges}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            style={SCREEN_BACKGROUND}
            contentContainerClassName={cn('grow', padded && 'px-4')}
            contentContainerStyle={{ paddingBottom: insideChrome ? 24 + TAB_BAR_PEEK : 24 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        ) : (
          body
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
