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
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { usePathname, useGlobalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
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
import type { HealthActivityType } from '@/services/health/types';
import { mediaKind } from '@/utils/media';

export type LightboxItem = {
  uri: string;
  /** Caption for this proof. Renders under the image, never over it. */
  label?: string;
  /** Small line above the caption: time, or slot name. */
  meta?: string;
  /**
   * A workout proof draws its card here rather than showing the flattened file at `uri`.
   *
   * The file is a JPEG of the same card, so it can only ever be as right as it was on the day it was
   * rasterized: cards drawn before the renderer was fixed are a quarter-size thumb in the corner of
   * an empty frame, and cards drawn before the miles were repaired print "0.00 mi". Drawing the card
   * from the stored numbers puts the current card on every post, old ones included. The file stays
   * the stored proof artifact and the fallback when there are no numbers to draw from.
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
  const [page, setPage] = useState(0);
  const [pageScale, setPageScale] = useState(1);
  const pageWidth = Math.max(width, 1);
  const pageHeight = Math.max(height, 1);
  const open = Boolean(state);
  const zoomed = pageScale > 1.01;

  useEffect(() => {
    if (!state) {
      return;
    }
    setPage(state.index);
    setPageScale(1);
    const x = state.index * pageWidth;
    requestAnimationFrame(() => {
      pager.current?.scrollTo({ x, animated: false });
    });
  }, [state, pageWidth]);

  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }
    const win = window;
    win.history.pushState({ blobLightbox: true }, '', win.location.href);
    const onPop = () => {
      onClose();
    };
    win.addEventListener('popstate', onPop);
    return () => {
      win.removeEventListener('popstate', onPop);
      if (win.history.state && (win.history.state as { blobLightbox?: boolean }).blobLightbox) {
        win.history.back();
      }
    };
  }, [open, onClose]);

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

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    pageFromOffset(event.nativeEvent.contentOffset.x);
  }

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    pageFromOffset(event.nativeEvent.contentOffset.x);
  }

  function goTo(index: number) {
    setPage(index);
    pager.current?.scrollTo({ x: index * pageWidth, animated: true });
  }

  const items = state?.items ?? [];
  const current = items[page];
  const columnW = Math.min(pageWidth, FEED_COLUMN_MAX);
  const bottomInset = Math.max(insets.bottom, 12);
  const captioned = items.some((item) => Boolean(item.label?.trim() || item.meta?.trim()));
  /* Proof stays full-bleed: the caption and dots get their own band under the image. */
  const band = (captioned ? 64 : 0) + (items.length > 1 ? 22 : 0);
  const mediaHeight = band > 0 ? Math.max(pageHeight - band - bottomInset, 160) : pageHeight;

  if (!open || !state) {
    return null;
  }

  return (
        <View
          pointerEvents="auto"
          style={[styles.layer, { width: pageWidth, height: pageHeight }]}>
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled={!zoomed}
            scrollEnabled={!zoomed}
            nestedScrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            decelerationRate="fast"
            style={{ width: pageWidth, height: pageHeight }}
            contentContainerStyle={{ height: pageHeight }}
            contentOffset={{ x: state.index * pageWidth, y: 0 }}
            scrollEventThrottle={16}
            onScroll={onScroll}
            onMomentumScrollEnd={onScrollEnd}
            onScrollEndDrag={onScrollEnd}>
            {items.map((item, itemIndex) => (
              <LightboxPage
                key={`${item.uri}-${itemIndex}`}
                item={item}
                width={pageWidth}
                mediaWidth={columnW}
                height={pageHeight}
                mediaHeight={mediaHeight}
                active={itemIndex === page}
                onClose={onClose}
                onScaleChange={itemIndex === page ? setPageScale : undefined}
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

function LightboxPage({
  item,
  width,
  mediaWidth,
  height,
  mediaHeight,
  active,
  onClose,
  onScaleChange,
}: {
  item: LightboxItem;
  width: number;
  mediaWidth: number;
  height: number;
  mediaHeight: number;
  active: boolean;
  onClose: () => void;
  onScaleChange?: (scale: number) => void;
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
        pointerEvents={kind === 'video' || zoomable ? 'auto' : 'none'}
        style={[styles.mediaSlot, { width, height: mediaHeight }]}>
        {zoomable ? (
          <ZoomableStill
            width={mediaWidth}
            height={mediaHeight}
            active={active}
            onClose={onClose}
            onScaleChange={onScaleChange}>
            {media}
          </ZoomableStill>
        ) : (
          media
        )}
      </View>
    </View>
  );
}

function ZoomableStill({
  width,
  height,
  active,
  onClose,
  onScaleChange,
  children,
}: {
  width: number;
  height: number;
  active: boolean;
  onClose: () => void;
  onScaleChange?: (scale: number) => void;
  children: ReactNode;
}) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);
  const report = onScaleChange;

  const reportScale = useCallback(
    (next: number) => {
      setZoomed(next > 1.01);
      report?.(next);
    },
    [report],
  );

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    reportScale(1);
  }, [reportScale, scale, translateX, translateY]);

  useEffect(() => {
    if (!active) {
      resetZoom();
    }
  }, [active, resetZoom]);

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      startScale.value = scale.value;
    })
    .onUpdate((event) => {
      const next = Math.min(4, Math.max(1, startScale.value * event.scale));
      scale.value = next;
      if (reportScale) {
        runOnJS(reportScale)(next);
      }
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        runOnJS(reportScale)(1);
      }
    });

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onBegin(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      translateX.value = startX.value + event.translationX;
      translateY.value = startY.value + event.translationY;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.01) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        runOnJS(reportScale)(1);
        return;
      }
      scale.value = withTiming(2.4);
      runOnJS(reportScale)(2.4);
    });

  const dismiss = Gesture.Pan()
    .enabled(active && !zoomed)
    .activeOffsetY(24)
    .failOffsetX([-28, 28])
    .onEnd((event) => {
      if (event.translationY > 72 && event.velocityY > 0) {
        runOnJS(onClose)();
      }
    });

  const composed = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, Gesture.Race(pan, dismiss)));

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
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
    left: 12,
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
