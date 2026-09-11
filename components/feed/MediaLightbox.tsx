import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { usePathname, useGlobalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { WorkoutProofCard } from '@/components/challenge/WorkoutProofCard';
import { PlayerCloseButton } from '@/components/ui/PlayerCloseButton';
import { useCheckinHealthSnapshot } from '@/hooks/useCheckinHealthSnapshot';
import { pushChallengeHref } from '@/lib/challengeNav';
import type { CheckinProofStats } from '@/lib/checkin/proofStats';
import { workoutCardForPost } from '@/lib/health/postWorkoutCard';
import { workoutCardFit, type WorkoutProofCardModel } from '@/lib/health/workoutProofCard';
import {
  lightboxNeedsRestore,
  lightboxReturnHref,
  type LightboxOrigin,
} from '@/lib/lightboxOrigin';
import { FEED_COLUMN_MAX, THEME } from '@/lib/theme';
import { videoPlaybackSrc } from '@/lib/videoPosterUrl';
import { applyWebVideoLock, preventWebVideoFullscreen } from '@/lib/webVideo';
import { snapLightboxIndex, lightboxEdgeStep, lightboxPopAction, rubberPagerOffset } from '@/lib/postMediaCarousel';
import type { HealthActivityType } from '@/services/health/types';
import { mediaKind } from '@/utils/media';

export type LightboxItem = {
  uri: string;
  /** Caption for this proof. Renders under the image, never over it. */
  label?: string;
  /** Small line above the caption: time, or slot name. */
  meta?: string;
  /**
   * Leftover virtual-slide overlay only. A stored recap JPEG at `uri` is shown as the image —
   * never replaced by a live-drawn card.
   */
  workout?: WorkoutSlide | null;
};

export type WorkoutSlide = {
  /** Drawable immediately, from the numbers on the post. Shown while nothing better has arrived. */
  card: WorkoutProofCardModel;
  activityType: HealthActivityType;
  /**
   * What the card is rebuilt from once the participant-only session summary loads, which is the only
   * source carrying the GPS track and the workout's real start and end.
   */
  checkinId?: string | null;
  stats?: CheckinProofStats | null;
  challengeTitle?: string | null;
  timeZone: string;
};

type LightboxState = {
  items: LightboxItem[];
  index: number;
  origin: LightboxOrigin | null;
};

type MediaLightboxValue = {
  openLightbox: (items: LightboxItem[], index?: number, origin?: LightboxOrigin | null) => void;
  closeLightbox: (opts?: { restore?: boolean }) => void;
  open: boolean;
};

const MediaLightboxContext = createContext<MediaLightboxValue | null>(null);

const DIM = 'rgba(16, 19, 18, 0.96)';

let closeLightboxFn: ((opts?: { restore?: boolean }) => void) | null = null;

/** Chrome / tab dismiss only. Does not send the reader back to Live. */
export function closeMediaLightbox() {
  closeLightboxFn?.({ restore: false });
}

export function useMediaLightboxOptional() {
  return useContext(MediaLightboxContext);
}

export function useMediaLightbox() {
  const value = useContext(MediaLightboxContext);
  if (!value) {
    throw new Error('useMediaLightbox must be used inside MediaLightboxHost');
  }
  return value;
}

export type { LightboxOrigin } from '@/lib/lightboxOrigin';

function lightboxItems(items: LightboxItem[]): LightboxItem[] {
  return items.filter((item) => Boolean(item.uri));
}

export function MediaLightboxHost({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LightboxState | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ tab?: string }>();
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const originRef = useRef<LightboxOrigin | null>(null);
  const pathRef = useRef(pathname);
  const tabRef = useRef(tabParam);
  pathRef.current = pathname;
  tabRef.current = tabParam;

  const closeLightbox = useCallback((opts?: { restore?: boolean }) => {
    const origin = originRef.current;
    setState(null);
    originRef.current = null;
    if (opts?.restore === false) {
      return;
    }
    if (!lightboxNeedsRestore(origin, pathRef.current, tabRef.current)) {
      return;
    }
    const href = lightboxReturnHref(origin);
    if (!href) {
      return;
    }
    if (origin?.kind === 'home') {
      router.replace('/feed');
      return;
    }
    pushChallengeHref(router, href, 'lightbox-close', origin?.challengeId ?? '', pathRef.current);
  }, [router]);
  const openLightbox = useCallback((items: LightboxItem[], index = 0, origin?: LightboxOrigin | null) => {
    const next = lightboxItems(items);
    if (next.length === 0) {
      return;
    }
    const start = Math.min(Math.max(index, 0), next.length - 1);
    originRef.current = origin ?? null;
    setState({ items: next, index: start, origin: origin ?? null });
  }, []);

  useEffect(() => {
    closeLightboxFn = closeLightbox;
    return () => {
      if (closeLightboxFn === closeLightbox) {
        closeLightboxFn = null;
      }
    };
  }, [closeLightbox]);

  const value = useMemo(
    () => ({ openLightbox, closeLightbox, open: Boolean(state) }),
    [closeLightbox, openLightbox, state],
  );

  return (
    <MediaLightboxContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        <MediaLightboxOverlay state={state} onClose={closeLightbox} />
      </View>
    </MediaLightboxContext.Provider>
  );
}

function MediaLightboxOverlay({
  state,
  onClose,
}: {
  state: LightboxState | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const pageRef = useRef(0);
  const dragOriginRef = useRef(0);
  const draggingRef = useRef(false);
  const pagedAtRef = useRef(0);
  const pointerRef = useRef<{ x: number; y: number; dx: number; dy: number; at: number } | null>(null);
  const goToRef = useRef<(index: number, animated?: boolean) => void>(() => {});
  const [page, setPage] = useState(0);
  const pageWidth = Math.max(width, 1);
  const pageHeight = Math.max(height, 1);
  const open = Boolean(state);
  pageRef.current = page;

  useEffect(() => {
    if (!state) {
      return;
    }
    draggingRef.current = false;
    setPage(state.index);
    const x = state.index * pageWidth;
    requestAnimationFrame(() => {
      pager.current?.scrollTo({ x, animated: false });
    });
  }, [state, pageWidth]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  useEffect(() => {
    if (!open || Platform.OS !== 'web') {
      return;
    }
    const onKey = (event: { key?: string }) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const win = globalThis as unknown as {
      addEventListener?: (type: string, listener: (event: { key?: string }) => void) => void;
      removeEventListener?: (type: string, listener: (event: { key?: string }) => void) => void;
    };
    win.addEventListener?.('keydown', onKey);
    return () => {
      win.removeEventListener?.('keydown', onKey);
    };
  }, [open, onClose]);

  function pageFromOffset(x: number) {
    const next = Math.round(x / pageWidth);
    if (!Number.isFinite(next)) {
      return;
    }
    setPage((current) => {
      const clamped = Math.min(Math.max(next, 0), (state?.items.length ?? 1) - 1);
      return current === clamped ? current : clamped;
    });
  }

  const goTo = useCallback((index: number, animated = true) => {
    pagedAtRef.current = Date.now();
    setPage(index);
    pager.current?.scrollTo({ x: index * pageWidth, animated });
  }, [pageWidth]);
  goToRef.current = goTo;

  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    const win = window;
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverscroll: html.style.overscrollBehavior,
      htmlOverscrollX: html.style.overscrollBehaviorX,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyOverscrollX: body.style.overscrollBehaviorX,
      htmlOverflow: html.style.overflow,
      restoration: win.history.scrollRestoration,
    };
    html.style.overscrollBehavior = 'none';
    html.style.overscrollBehaviorX = 'none';
    body.style.overscrollBehavior = 'none';
    body.style.overscrollBehaviorX = 'none';
    html.style.overflow = 'hidden';
    try {
      win.history.scrollRestoration = 'manual';
    } catch {
      // older webviews
    }
    win.history.pushState({ blobLightbox: true }, '', win.location.href);

    const trackPointer = (event: {
      type: string;
      cancelable: boolean;
      touches: ArrayLike<{ clientX: number; clientY: number }>;
      changedTouches: ArrayLike<{ clientX: number; clientY: number }>;
      preventDefault: () => void;
    }) => {
      const touch = event.touches[0] ?? event.changedTouches[0];
      if (!touch) {
        return;
      }
      const current = pointerRef.current;
      if (!current || event.type === 'touchstart') {
        pointerRef.current = { x: touch.clientX, y: touch.clientY, dx: 0, dy: 0, at: Date.now() };
        return;
      }
      current.dx = touch.clientX - current.x;
      current.dy = touch.clientY - current.y;
      current.at = Date.now();
      if (
        event.cancelable &&
        Math.abs(current.dx) > 8 &&
        Math.abs(current.dx) >= Math.abs(current.dy)
      ) {
        event.preventDefault();
      }
    };

    const onPop = () => {
      const pointer = pointerRef.current;
      const action = lightboxPopAction({
        page: pageRef.current,
        dragging: draggingRef.current,
        msSincePage: Date.now() - pagedAtRef.current,
        pointerDx: pointer?.dx,
        pointerDy: pointer?.dy,
        pointerAgoMs: pointer ? Date.now() - pointer.at : undefined,
      });
      if (action === 'close') {
        onClose();
        return;
      }
      if (action === 'previous') {
        goToRef.current(pageRef.current - 1, true);
      }
      win.history.pushState({ blobLightbox: true }, '', win.location.href);
    };

    win.addEventListener('popstate', onPop);
    win.addEventListener('touchstart', trackPointer as EventListener, { capture: true, passive: true });
    win.addEventListener('touchmove', trackPointer as EventListener, { capture: true, passive: false });
    win.addEventListener('touchend', trackPointer as EventListener, { capture: true, passive: true });
    return () => {
      win.removeEventListener('popstate', onPop);
      win.removeEventListener('touchstart', trackPointer as EventListener, true);
      win.removeEventListener('touchmove', trackPointer as EventListener, true);
      win.removeEventListener('touchend', trackPointer as EventListener, true);
      html.style.overscrollBehavior = prev.htmlOverscroll;
      html.style.overscrollBehaviorX = prev.htmlOverscrollX;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      body.style.overscrollBehaviorX = prev.bodyOverscrollX;
      html.style.overflow = prev.htmlOverflow;
      try {
        win.history.scrollRestoration = prev.restoration;
      } catch {
        // older webviews
      }
      if (win.history.state && (win.history.state as { blobLightbox?: boolean }).blobLightbox) {
        win.history.back();
      }
    };
  }, [open, onClose]);

  const stepPage = useCallback((dir: -1 | 0 | 1) => {
    if (!dir) {
      return;
    }
    const last = Math.max((state?.items.length ?? 1) - 1, 0);
    const next = Math.min(Math.max(pageRef.current + dir, 0), last);
    if (next === pageRef.current) {
      return;
    }
    goTo(next, true);
  }, [goTo, state?.items.length]);

  const onPageDragStart = useCallback(() => {
    draggingRef.current = true;
    pagedAtRef.current = Date.now();
    dragOriginRef.current = pageRef.current;
    pager.current?.scrollTo({ x: pageRef.current * pageWidth, animated: false });
  }, [pageWidth]);

  const onPageDrag = useCallback((dx: number) => {
    pager.current?.scrollTo({
      x: rubberPagerOffset(
        dragOriginRef.current * pageWidth - dx,
        pageWidth,
        state?.items.length ?? 1,
      ),
      animated: false,
    });
  }, [pageWidth, state?.items.length]);

  const onPageDragEnd = useCallback((dx: number, velocityX: number) => {
    draggingRef.current = false;
    pagedAtRef.current = Date.now();
    const next = snapLightboxIndex({
      from: dragOriginRef.current,
      dx,
      velocityX,
      pageWidth,
      length: state?.items.length ?? 1,
    });
    goTo(next, true);
  }, [goTo, pageWidth, state?.items.length]);

  const onPageDragCancel = useCallback(() => {
    if (!draggingRef.current) {
      return;
    }
    draggingRef.current = false;
    goTo(dragOriginRef.current, false);
  }, [goTo]);

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (draggingRef.current) {
      return;
    }
    pageFromOffset(event.nativeEvent.contentOffset.x);
  }

  const items = state?.items ?? [];
  const current = items[page];
  const columnW = Math.min(pageWidth, FEED_COLUMN_MAX);
  const bottomInset = Math.max(insets.bottom, 12);
  const captioned = items.some((item) => Boolean(item.label?.trim() || item.meta?.trim()));
  /* Proof stays full-bleed: the caption and dots get their own band under the image. */
  const band = (captioned ? 64 : 0) + (items.length > 1 ? 22 : 0);
  const mediaHeight = band > 0 ? Math.max(pageHeight - band - bottomInset, 160) : pageHeight;
  const pageEnabled = items.length > 1;

  if (!open || !state) {
    return null;
  }

  return (
        <View
          pointerEvents="auto"
          style={[
            styles.layer,
            { width: pageWidth, height: pageHeight },
            Platform.OS === 'web'
              ? ({
                  overscrollBehavior: 'none',
                  overscrollBehaviorX: 'none',
                  overscrollBehaviorY: 'none',
                  touchAction: 'none',
                } as object)
              : null,
          ]}>
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled={false}
            scrollEnabled={false}
            nestedScrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            decelerationRate="fast"
            style={{ width: pageWidth, height: pageHeight }}
            contentContainerStyle={{ height: pageHeight }}
            scrollEventThrottle={16}
            onScroll={onScroll}
            onMomentumScrollEnd={onScroll}>
            {items.map((item, itemIndex) => (
              <LightboxPage
                key={`${item.uri}-${itemIndex}`}
                item={item}
                width={pageWidth}
                mediaWidth={columnW}
                height={pageHeight}
                mediaHeight={mediaHeight}
                active={itemIndex === page}
                pageEnabled={pageEnabled}
                onClose={onClose}
                onPageDragStart={onPageDragStart}
                onPageDrag={onPageDrag}
                onPageDragEnd={onPageDragEnd}
                onPageDragCancel={onPageDragCancel}
                onEdgeStep={stepPage}
              />
            ))}
          </ScrollView>

          <View style={[styles.close, { top: Math.max(insets.top, 8) }]}>
            <PlayerCloseButton accessibilityLabel="Close" onPress={onClose} />
          </View>

          {items.length > 1 || captioned ? (
            <View pointerEvents="box-none" style={[styles.bottomBand, { bottom: bottomInset }]}>
              {items.length > 1 ? (
                <View pointerEvents="box-none" style={styles.dots}>
                  {items.map((item, index) => (
                    <Pressable
                      key={`${item.uri}-dot-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Photo ${index + 1} of ${items.length}`}
                      accessibilityState={{ selected: index === page }}
                      hitSlop={8}
                      onPress={() => goTo(index)}
                      style={[styles.dot, index === page ? styles.dotOn : null]}
                    />
                  ))}
                </View>
              ) : null}
              {current?.meta?.trim() ? (
                <AppText style={styles.captionMeta}>{current.meta}</AppText>
              ) : null}
              {current?.label?.trim() ? (
                <AppText style={styles.caption} numberOfLines={3}>
                  {current.label}
                </AppText>
              ) : null}
            </View>
          ) : null}
        </View>
  );
}

function useOneFingerPageGestures(input: {
  enabled: boolean;
  width: number;
  onClose: () => void;
  onPageDragStart?: () => void;
  onPageDrag?: (dx: number) => void;
  onPageDragEnd?: (dx: number, velocityX: number) => void;
  onPageDragCancel?: () => void;
  onEdgeStep?: (dir: -1 | 0 | 1) => void;
}) {
  const settled = useSharedValue(0);
  const start = input.onPageDragStart;
  const drag = input.onPageDrag;
  const end = input.onPageDragEnd;
  const cancel = input.onPageDragCancel;
  const close = input.onClose;
  const edge = input.onEdgeStep;
  const enabled = input.enabled;
  const width = input.width;

  return useMemo(() => {
    const pagePan = Gesture.Pan()
      .enabled(enabled)
      .minPointers(1)
      .maxPointers(1)
      .activeOffsetX([-12, 12])
      .failOffsetY([-36, 36])
      .onStart(() => {
        settled.value = 0;
        if (start) {
          runOnJS(start)();
        }
      })
      .onUpdate((event) => {
        if (drag) {
          runOnJS(drag)(event.translationX);
        }
      })
      .onEnd((event) => {
        settled.value = 1;
        if (end) {
          runOnJS(end)(event.translationX, event.velocityX);
        }
      })
      .onFinalize((_event, success) => {
        if (!success && settled.value === 0 && cancel) {
          settled.value = 1;
          runOnJS(cancel)();
        }
      });
    const dismiss = Gesture.Pan()
      .maxPointers(1)
      .activeOffsetY(24)
      .failOffsetX([-28, 28])
      .onEnd((event) => {
        if (event.translationY > 72 && event.velocityY > 0) {
          runOnJS(close)();
        }
      });
    const edgeTap = Gesture.Tap()
      .enabled(enabled)
      .maxDistance(12)
      .onEnd((event) => {
        if (!edge) {
          return;
        }
        runOnJS(edge)(lightboxEdgeStep(event.x, width));
      });
    return Gesture.Exclusive(Gesture.Race(pagePan, dismiss), edgeTap);
  }, [cancel, close, drag, edge, enabled, end, settled, start, width]);
}

function LightboxPage({
  item,
  width,
  mediaWidth,
  height,
  mediaHeight,
  active,
  pageEnabled,
  onClose,
  onPageDragStart,
  onPageDrag,
  onPageDragEnd,
  onPageDragCancel,
  onEdgeStep,
}: {
  item: LightboxItem;
  width: number;
  mediaWidth: number;
  height: number;
  mediaHeight: number;
  active: boolean;
  pageEnabled: boolean;
  onClose: () => void;
  onPageDragStart?: () => void;
  onPageDrag?: (dx: number) => void;
  onPageDragEnd?: (dx: number, velocityX: number) => void;
  onPageDragCancel?: () => void;
  onEdgeStep?: (dir: -1 | 0 | 1) => void;
}) {
  const playUri = videoPlaybackSrc(item.uri) || item.uri;
  const kind = mediaKind(item.uri);
  const workout = item.workout ?? null;
  // Live-rendered workout cards are already as sharp as they can be. A bitmap (selfie, proof
  // still, or a flattened card with no live model) pinch-zooms on every platform.
  const zoomable = kind !== 'video' && !workout;
  const mediaStyle = { width: mediaWidth, height: mediaHeight };

  const media = workout ? (
    <LightboxWorkoutCard slide={workout} width={mediaWidth} height={mediaHeight} />
  ) : kind === 'video' ? (
      <LightboxVideo uri={playUri} style={mediaStyle} />
    ) : (
      <Image
        source={{ uri: item.uri }}
        style={mediaStyle}
        contentFit="contain"
        contentPosition="center"
        cachePolicy="memory-disk"
        recyclingKey={item.uri}
        pointerEvents="none"
      />
    );

  return (
    <View style={{ width, height }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close photo"
        onPress={onClose}
        style={[styles.pageDim, { width, height }]}
      />
      <View
        pointerEvents="auto"
        style={[styles.mediaSlot, { width, height: mediaHeight }]}>
        {zoomable ? (
          <ZoomableStill
            width={mediaWidth}
            height={mediaHeight}
            active={active}
            pageEnabled={pageEnabled}
            onClose={onClose}
            onPageDragStart={onPageDragStart}
            onPageDrag={onPageDrag}
            onPageDragEnd={onPageDragEnd}
            onPageDragCancel={onPageDragCancel}
            onEdgeStep={onEdgeStep}>
            {media}
          </ZoomableStill>
        ) : (
          <PagerSwipe
            width={mediaWidth}
            height={mediaHeight}
            enabled={pageEnabled}
            onClose={onClose}
            onPageDragStart={onPageDragStart}
            onPageDrag={onPageDrag}
            onPageDragEnd={onPageDragEnd}
            onPageDragCancel={onPageDragCancel}
            onEdgeStep={onEdgeStep}>
            {media}
          </PagerSwipe>
        )}
      </View>
    </View>
  );
}

function PagerSwipe({
  width,
  height,
  enabled,
  onClose,
  onPageDragStart,
  onPageDrag,
  onPageDragEnd,
  onPageDragCancel,
  onEdgeStep,
  children,
}: {
  width: number;
  height: number;
  enabled: boolean;
  onClose: () => void;
  onPageDragStart?: () => void;
  onPageDrag?: (dx: number) => void;
  onPageDragEnd?: (dx: number, velocityX: number) => void;
  onPageDragCancel?: () => void;
  onEdgeStep?: (dir: -1 | 0 | 1) => void;
  children: ReactNode;
}) {
  const composed = useOneFingerPageGestures({
    enabled,
    width,
    onClose,
    onPageDragStart,
    onPageDrag,
    onPageDragEnd,
    onPageDragCancel,
    onEdgeStep,
  });
  return (
    <GestureDetector gesture={composed} touchAction="none">
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </GestureDetector>
  );
}

function ZoomableStill({
  width,
  height,
  active,
  pageEnabled,
  onClose,
  onPageDragStart,
  onPageDrag,
  onPageDragEnd,
  onPageDragCancel,
  onEdgeStep,
  children,
}: {
  width: number;
  height: number;
  active: boolean;
  pageEnabled: boolean;
  onClose: () => void;
  onPageDragStart?: () => void;
  onPageDrag?: (dx: number) => void;
  onPageDragEnd?: (dx: number, velocityX: number) => void;
  onPageDragCancel?: () => void;
  onEdgeStep?: (dir: -1 | 0 | 1) => void;
  children: ReactNode;
}) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const pageSettled = useSharedValue(1);
  const overflowDx = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    setZoomed(false);
  }, [scale, translateX, translateY]);

  useEffect(() => {
    if (!active) {
      resetZoom();
    }
  }, [active, resetZoom]);

  const start = onPageDragStart;
  const drag = onPageDrag;
  const end = onPageDragEnd;
  const cancel = onPageDragCancel;
  const edge = onEdgeStep;

  const composed = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onTouchesDown((event) => {
        if (event.numberOfTouches >= 2 && cancel) {
          runOnJS(cancel)();
        }
      })
      .onBegin(() => {
        startScale.value = scale.value;
        if (cancel) {
          runOnJS(cancel)();
        }
      })
      .onUpdate((event) => {
        scale.value = Math.min(4, Math.max(1, startScale.value * event.scale));
      })
      .onEnd(() => {
        if (scale.value <= 1.02) {
          scale.value = withTiming(1);
          translateX.value = withTiming(0);
          translateY.value = withTiming(0);
          runOnJS(setZoomed)(false);
          return;
        }
        runOnJS(setZoomed)(true);
      });

    const imagePan = Gesture.Pan()
      .enabled(zoomed)
      .maxPointers(1)
      .activeOffsetX([-16, 16])
      .activeOffsetY([-16, 16])
      .onBegin(() => {
        startX.value = translateX.value;
        startY.value = translateY.value;
        overflowDx.value = 0;
      })
      .onUpdate((event) => {
        const maxX = (width * (scale.value - 1)) / 2;
        const maxY = (height * (scale.value - 1)) / 2;
        const nextY = Math.min(maxY, Math.max(-maxY, startY.value + event.translationY));
        const rawX = startX.value + event.translationX;
        if (rawX > maxX) {
          translateX.value = maxX;
          overflowDx.value = rawX - maxX;
        } else if (rawX < -maxX) {
          translateX.value = -maxX;
          overflowDx.value = rawX + maxX;
        } else {
          translateX.value = rawX;
          overflowDx.value = 0;
        }
        translateY.value = nextY;
      })
      .onEnd((event) => {
        if (!pageEnabled || !end) {
          overflowDx.value = 0;
          return;
        }
        const extra = overflowDx.value;
        overflowDx.value = 0;
        if (Math.abs(extra) < 8) {
          return;
        }
        if (start) {
          runOnJS(start)();
        }
        runOnJS(end)(extra, event.velocityX);
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDistance(24)
      .onEnd(() => {
        if (scale.value > 1.01) {
          scale.value = withTiming(1);
          translateX.value = withTiming(0);
          translateY.value = withTiming(0);
          runOnJS(setZoomed)(false);
          return;
        }
        scale.value = withTiming(2.4);
        runOnJS(setZoomed)(true);
      });

    const edgeTap = Gesture.Tap()
      .enabled(pageEnabled)
      .maxDistance(12)
      .onEnd((event) => {
        if (!edge || scale.value > 1.01) {
          return;
        }
        runOnJS(edge)(lightboxEdgeStep(event.x, width));
      });

    const pagePan = Gesture.Pan()
      .enabled(pageEnabled && !zoomed)
      .minPointers(1)
      .maxPointers(1)
      .activeOffsetX([-12, 12])
      .failOffsetY([-36, 36])
      .onStart(() => {
        pageSettled.value = 0;
        if (start) {
          runOnJS(start)();
        }
      })
      .onUpdate((event) => {
        if (drag) {
          runOnJS(drag)(event.translationX);
        }
      })
      .onEnd((event) => {
        pageSettled.value = 1;
        if (end) {
          runOnJS(end)(event.translationX, event.velocityX);
        }
      })
      .onFinalize((_event, success) => {
        if (!success && pageSettled.value === 0 && cancel) {
          pageSettled.value = 1;
          runOnJS(cancel)();
        }
      });

    const dismiss = Gesture.Pan()
      .enabled(!zoomed)
      .maxPointers(1)
      .activeOffsetY(24)
      .failOffsetX([-28, 28])
      .onEnd((event) => {
        if (event.translationY > 72 && event.velocityY > 0) {
          runOnJS(onClose)();
        }
      });

    return Gesture.Simultaneous(
      pinch,
      Gesture.Exclusive(doubleTap, edgeTap),
      Gesture.Race(pagePan, dismiss, imagePan),
    );
  }, [
    cancel,
    drag,
    edge,
    end,
    height,
    onClose,
    overflowDx,
    pageEnabled,
    pageSettled,
    scale,
    start,
    startScale,
    startX,
    startY,
    translateX,
    translateY,
    width,
    zoomed,
  ]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed} touchAction="none">
      <Animated.View style={[{ width, height, alignItems: 'center', justifyContent: 'center' }, style]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * The workout card at slide size: full width on a phone, and as tall as 4:5 allows under the close
 * chrome. Nothing is cropped, so every stat that is on the card is on the screen.
 */
function LightboxWorkoutCard({
  slide,
  width,
  height,
}: {
  slide: WorkoutSlide;
  width: number;
  height: number;
}) {
  const snapshot = useCheckinHealthSnapshot(slide.checkinId);
  const card = useMemo(() => {
    if (!snapshot) {
      return slide.card;
    }
    return (
      workoutCardForPost({
        stats: slide.stats,
        health: snapshot,
        challengeTitle: slide.challengeTitle,
        timeZone: slide.timeZone,
      }) ?? slide.card
    );
  }, [slide.card, slide.challengeTitle, slide.stats, slide.timeZone, snapshot]);
  const fit = workoutCardFit(width, height);
  if (fit.width <= 0) {
    return null;
  }
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      <WorkoutProofCard
        card={card}
        activityType={slide.activityType}
        width={fit.width}
        height={fit.height}
      />
    </View>
  );
}

function LightboxVideo({
  uri,
  style,
}: {
  uri: string;
  style: { width: number; height: number };
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.muted = false;
    instance.play();
  });

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return undefined;
    }
    const node = ref.current;
    if (!node) {
      return undefined;
    }
    applyWebVideoLock(node);
    node.muted = false;
    node.playsInline = true;
    const play = () => {
      void node.play().catch(() => undefined);
    };
    node.addEventListener('webkitbeginfullscreen', preventWebVideoFullscreen);
    node.addEventListener('webkitendfullscreen', preventWebVideoFullscreen);
    play();
    return () => {
      node.removeEventListener('webkitbeginfullscreen', preventWebVideoFullscreen);
      node.removeEventListener('webkitendfullscreen', preventWebVideoFullscreen);
      node.pause();
    };
  }, [uri]);

  if (Platform.OS === 'web') {
    return createElement('video', {
      ref,
      src: uri,
      playsInline: true,
      controls: false,
      style: {
        width: style.width,
        height: style.height,
        maxWidth: FEED_COLUMN_MAX,
        objectFit: 'contain',
        backgroundColor: 'transparent',
      },
    });
  }

  return (
    <VideoView
      player={player}
      style={[style, { backgroundColor: 'transparent', overflow: 'hidden' }]}
      contentFit="contain"
      nativeControls={false}
    />
  );
}

const styles = StyleSheet.create({
  pageDim: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'transparent',
  },
  mediaSlot: {
    position: 'absolute',
    top: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 80,
    elevation: 80,
    backgroundColor: DIM,
    overflow: 'hidden',
  },
  close: {
    position: 'absolute',
    right: 12,
    zIndex: 4,
  },
  bottomBand: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 2,
    alignItems: 'center',
    gap: 6,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(247, 247, 245, 0.35)',
  },
  dotOn: {
    backgroundColor: THEME.accent,
  },
  captionMeta: {
    color: 'rgba(247, 247, 245, 0.62)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  caption: {
    color: THEME.primaryForeground,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'center',
  },
});
