import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { shouldRunScrollToTop } from '@/lib/authScroll';
import { applyCreateFieldScroll, CREATE_SCROLL_OVERFLOW_ANCHOR, scheduleCreateFieldScroll } from '@/lib/createFieldScroll';
import { THEME } from '@/lib/theme';
import { subscribeVisualViewport } from '@/lib/visualViewport';

type KeyboardFormApi = {
  scrollToTop: () => void;
  scrollFieldIntoView: (node: View) => void;
  setFieldFocused?: (focused: boolean) => void;
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

/** Keyboard height only. Web uses visualViewport — never a guessed 300. */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => setHeight(Math.max(0, event.endCoordinates.height)),
    );
    const change = Keyboard.addListener('keyboardDidChangeFrame', (event) =>
      setHeight(Math.max(0, event.endCoordinates.height)),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setHeight(0),
    );
    const unsubViewport =
      Platform.OS === 'web' ? subscribeVisualViewport((occlusion) => setHeight(occlusion)) : () => undefined;
    return () => {
      show.remove();
      change.remove();
      hide.remove();
      unsubViewport();
    };
  }, []);

  return height;
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
  /** Auth email/password: do not wrap fields in a dismiss Pressable, and never scroll-to-top on keyboard / viewport. */
  protectFieldFocus?: boolean;
  /** When the keyboard is down, extra footer pad (tab bar). Keyboard up sits on the keys with no gap. */
  closedFooterPad?: number;
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
  protectFieldFocus = false,
  closedFooterPad,
}: KeyboardFormShellProps) {
  const insets = useSafeAreaInsets();
  const overlap = useKeyboardOverlap();
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const lastFieldNode = useRef<View | null>(null);
  const footerRef = useRef<View>(null);
  const footerHeight = useRef(0);
  const overlapRef = useRef(0);
  overlapRef.current = overlap;
  const fieldFocusedRef = useRef(false);
  const appliedScrollKey = useRef<string | number | undefined>(undefined);
  const safeBottom = Math.max(insets.bottom, 12);
  const [footerH, setFooterH] = useState(footer ? 64 : 0);
  const extraPad = footerH + 16;
  const keyboardHeight = useKeyboardHeight();
  const keyboardHeightRef = useRef(0);
  keyboardHeightRef.current = keyboardHeight;
  const androidKeyboardPad = Platform.OS === 'android' && keyboardHeight > 0 ? keyboardHeight : 0;
  const gutter = paddingHorizontal ?? (padded ? 16 : 0);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const setFieldFocused = useCallback((focused: boolean) => {
    fieldFocusedRef.current = focused;
  }, []);

  const scrollFieldIntoView = useCallback((node: View) => {
    lastFieldNode.current = node;
    scheduleCreateFieldScroll(() => {
      applyCreateFieldScroll({
        field: node,
        footer: footerRef.current,
        windowH: Dimensions.get('window').height,
        footerH: footerHeight.current,
        scrollY: scrollY.current,
        keyboardOverlap: Math.max(
          overlapRef.current,
          Platform.OS === 'android' ? keyboardHeightRef.current : 0,
        ),
        clampFooterToKeyboard: Platform.OS === 'android',
        scrollTo: (y) => {
          scrollRef.current?.scrollTo({ y, animated: true });
        },
      });
    });
  }, []);

  useEffect(() => {
    if (!fieldFocusedRef.current || !lastFieldNode.current) {
      return;
    }
    scrollFieldIntoView(lastFieldNode.current);
  }, [overlap, scrollFieldIntoView]);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', () => {
      if (!fieldFocusedRef.current || !lastFieldNode.current) {
        return;
      }
      scrollFieldIntoView(lastFieldNode.current);
    });
    return () => sub.remove();
  }, [scrollFieldIntoView]);

  useEffect(() => {
    if (
      !shouldRunScrollToTop({
        stepKey: scrollToTopKey,
        appliedKey: appliedScrollKey.current,
        fieldFocused: fieldFocusedRef.current,
      })
    ) {
      return;
    }
    appliedScrollKey.current = scrollToTopKey;
    scrollToTop();
  }, [scrollToTop, scrollToTopKey]);

  const api = useMemo<KeyboardFormApi>(
    () => ({ scrollToTop, scrollFieldIntoView, setFieldFocused }),
    [scrollToTop, scrollFieldIntoView, setFieldFocused],
  );

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
          style={[{ flex: 1, backgroundColor }, CREATE_SCROLL_OVERFLOW_ANCHOR]}
          contentContainerStyle={[
            {
              flexGrow: 1,
              paddingHorizontal: gutter,
              paddingBottom: extraPad + androidKeyboardPad,
            },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          keyboardDismissMode={
            protectFieldFocus ? 'none' : Platform.OS === 'ios' ? 'interactive' : 'on-drag'
          }
          showsVerticalScrollIndicator={false}
          onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
            scrollY.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}>
          {protectFieldFocus ? (
            <View style={{ flexGrow: 1 }}>{children}</View>
          ) : (
            <DismissKeyboard style={{ flexGrow: 1 }}>{children}</DismissKeyboard>
          )}
        </ScrollView>
        {footer ? (
          <View
            ref={footerRef}
            collapsable={false}
            onLayout={(event: LayoutChangeEvent) => {
              const height = event.nativeEvent.layout.height;
              footerHeight.current = height;
              setFooterH(height);
            }}
            style={{
              paddingHorizontal: gutter,
              paddingTop: 10,
              paddingBottom: overlap > 0 ? 0 : closedFooterPad ?? safeBottom,
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

const KeyboardFieldLiftContext = createContext<(() => void) | null>(null);

export function useKeyboardFieldLift(): (() => void) | null {
  return useContext(KeyboardFieldLiftContext);
}

export function KeyboardField({ children }: { children: ReactNode }) {
  const form = useKeyboardForm();
  const ref = useRef<View>(null);

  const lift = useCallback(() => {
    form?.setFieldFocused?.(true);
    if (ref.current) {
      form?.scrollFieldIntoView(ref.current);
    }
  }, [form]);

  return (
    <KeyboardFieldLiftContext.Provider value={lift}>
      <View ref={ref} collapsable={false} onTouchStart={lift}>
        {children}
      </View>
    </KeyboardFieldLiftContext.Provider>
  );
}
