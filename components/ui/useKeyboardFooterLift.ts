import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView, type View } from 'react-native';

import { CREATE_FOOTER_BODY, createStickyFooterPad } from '@/components/challenge/create/wizardUi';
import { useKeyboardOverlap } from '@/components/ui/KeyboardFormShell';
import { applyCreateFieldScroll, scheduleCreateFieldScroll } from '@/lib/createFieldScroll';

/**
 * The SimpleCreateForm footer lift for any form with a ScrollView and a sticky footer.
 *
 * Put `liftStyle` on the wrapper around the ScrollView and footer (the Screen runs with
 * `keyboardAvoiding={false}`), so the footer row sits on the keyboard on iOS, Android, and Web. The
 * focused field is scrolled above the footer through `formApi` (provide it as `KeyboardFormContext`).
 */
export function useKeyboardFooterLift(closedFooterPad: number) {
  const scrollRef = useRef<ScrollView>(null);
  const footerRef = useRef<View>(null);
  const scrollY = useRef(0);
  const lastFieldNode = useRef<View | null>(null);
  const keyboardOverlap = useKeyboardOverlap();
  const keyboardOpen = keyboardOverlap > 0;
  const [footerH, setFooterH] = useState(CREATE_FOOTER_BODY);
  const footerHRef = useRef(footerH);
  footerHRef.current = footerH;

  const scrollFieldIntoView = useCallback((node: View) => {
    lastFieldNode.current = node;
    scheduleCreateFieldScroll(() => {
      applyCreateFieldScroll({
        field: node,
        footer: footerRef.current,
        windowH: Dimensions.get('window').height,
        footerH: footerHRef.current,
        scrollY: scrollY.current,
        scrollTo: (y) => {
          scrollRef.current?.scrollTo({ y, animated: true });
        },
      });
    });
  }, []);

  useEffect(() => {
    if (keyboardOverlap <= 0 || !lastFieldNode.current) {
      return;
    }
    scrollFieldIntoView(lastFieldNode.current);
  }, [keyboardOverlap, scrollFieldIntoView]);

  const formApi = useMemo(
    () => ({
      scrollToTop: () => scrollRef.current?.scrollTo({ y: 0, animated: true }),
      scrollFieldIntoView,
    }),
    [scrollFieldIntoView],
  );

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
  }, []);

  const onFooterLayout = useCallback((event: LayoutChangeEvent) => {
    setFooterH(Math.max(CREATE_FOOTER_BODY, event.nativeEvent.layout.height));
  }, []);

  return {
    scrollRef,
    footerRef,
    formApi,
    onScroll,
    onFooterLayout,
    keyboardOpen,
    liftStyle: { flex: 1, marginBottom: keyboardOverlap } as const,
    footerPad: createStickyFooterPad(keyboardOpen, closedFooterPad),
  };
}
