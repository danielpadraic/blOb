import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DismissKeyboard } from '@/components/ui/DismissKeyboard';
import { THEME } from '@/lib/theme';
import { subscribeVisualViewport } from '@/lib/visualViewport';

type KeyboardFormApi = {
  scrollToTop: () => void;
  scrollFieldIntoView: (node: View) => void;
};

export const KeyboardFormContext = createContext<KeyboardFormApi | null>(null);

export function useKeyboardForm(): KeyboardFormApi | null {
  return useContext(KeyboardFormContext);
}

export function useKeyboardOverlap(): number {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    function apply(screenY: number) {
      const windowH = Dimensions.get('window').height;
      setOverlap(Math.max(0, windowH - screenY));
    }

    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => apply(event.endCoordinates.screenY),
    );
    const change = Keyboard.addListener('keyboardDidChangeFrame', (event) =>
      apply(event.endCoordinates.screenY),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setOverlap(0),
    );
    const unsubViewport =
      Platform.OS === 'web' ? subscribeVisualViewport((occlusion) => setOverlap(occlusion)) : () => undefined;
    return () => {
      show.remove();
      change.remove();
      hide.remove();
      unsubViewport();
    };
  }, []);

  return overlap;
}

type KeyboardFormShellProps = {
  children: ReactNode;
  footer?: ReactNode;
  scrollToTopKey?: string | number;
  backgroundColor?: string;
  padded?: boolean;
  paddingHorizontal?: number;
  contentContainerStyle?: ViewStyle;
  tone?: 'light' | 'dark';
};

export function KeyboardFormShell({
  children,
  footer,
  scrollToTopKey,
  backgroundColor = THEME.background,
  padded = true,
  paddingHorizontal,
  contentContainerStyle,
  tone = 'light',
}: KeyboardFormShellProps) {
  const insets = useSafeAreaInsets();
  const overlap = useKeyboardOverlap();
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const lastFieldNode = useRef<View | null>(null);
  const footerHeight = useRef(0);
  const overlapRef = useRef(0);
  overlapRef.current = overlap;
  const safeBottom = Math.max(insets.bottom, 12);
  const [footerH, setFooterH] = useState(footer ? 64 : 0);
  const extraPad = footerH + 16;
  const gutter = paddingHorizontal ?? (padded ? 16 : 0);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const scrollFieldIntoView = useCallback((node: View) => {
    lastFieldNode.current = node;
    const run = () => {
      node.measureInWindow((_x, y, _w, h) => {
        const windowH = Dimensions.get('window').height;
        const reserved = footerHeight.current + overlapRef.current + 24;
        const visibleBottom = windowH - reserved;
        const fieldBottom = y + h;
        const topGuard = 24;
        let delta = 0;
        if (fieldBottom > visibleBottom) {
          delta = fieldBottom - visibleBottom;
        } else if (y < topGuard) {
          delta = y - topGuard;
        }
        if (delta !== 0) {
          scrollRef.current?.scrollTo({
            y: Math.max(0, scrollY.current + delta),
            animated: true,
          });
        }
      });
    };
    requestAnimationFrame(() => {
      setTimeout(run, Platform.OS === 'android' ? 80 : 40);
    });
  }, []);

  useEffect(() => {
    if (overlap <= 0 || !lastFieldNode.current) {
      return;
    }
    scrollFieldIntoView(lastFieldNode.current);
  }, [overlap, scrollFieldIntoView]);

  useEffect(() => {
    scrollToTop();
  }, [scrollToTop, scrollToTopKey]);

  const api: KeyboardFormApi = { scrollToTop, scrollFieldIntoView };

  return (
    <KeyboardFormContext.Provider value={api}>
      <KeyboardAvoidingView
        style={{
          flex: 1,
          backgroundColor,
          marginBottom: Platform.OS === 'web' ? overlap : 0,
        }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, backgroundColor }}
          contentContainerStyle={[
            {
              flexGrow: 1,
              paddingHorizontal: gutter,
              paddingBottom: extraPad,
            },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
            scrollY.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}>
          <DismissKeyboard style={{ flexGrow: 1 }}>{children}</DismissKeyboard>
        </ScrollView>
        {footer ? (
          <View
            onLayout={(event: LayoutChangeEvent) => {
              const height = event.nativeEvent.layout.height;
              footerHeight.current = height;
              setFooterH(height);
            }}
            style={{
              paddingHorizontal: gutter,
              paddingTop: 10,
              paddingBottom: overlap > 0 ? 0 : safeBottom,
              backgroundColor,
              borderTopWidth: 1,
              borderTopColor:
                tone === 'dark' ? 'rgba(255,255,255,0.12)' : THEME.border,
            }}>
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </KeyboardFormContext.Provider>
  );
}

export function KeyboardField({ children }: { children: ReactNode }) {
  const form = useKeyboardForm();
  const ref = useRef<View>(null);

  return (
    <View
      ref={ref}
      collapsable={false}
      onTouchStart={() => {
        if (ref.current) {
          form?.scrollFieldIntoView(ref.current);
        }
      }}>
      {children}
    </View>
  );
}
