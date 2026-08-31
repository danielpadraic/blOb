import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image as RnImage,
  PanResponder,
  Platform,
  Pressable,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';

import { useMediaLightboxOptional, type LightboxItem } from '@/components/feed/MediaLightbox';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { useVideoPoster } from '@/hooks/useVideoPoster';
import {
  POST_MEDIA_CYCLE_MS,
  canAutoCyclePager,
  carouselClaimsHorizontal,
  isStillPostMedia,
  nextAutoCycleIndex,
  orientationFromSize,
  pagerFrameHeight,
  rememberPagerIndex,
  rememberedPagerIndex,
  snapCarouselIndex,
  stillCountInPager,
  type MediaSize,
} from '@/lib/postMediaCarousel';
import { FEED_COLUMN_MAX, THEME } from '@/lib/theme';
import { mediaKind } from '@/utils/media';

const LETTERBOX = 'rgba(16, 19, 18, 0.08)';

const VisiblePostsContext = createContext<ReadonlySet<string> | null>(null);

export function VisiblePostsProvider({
  ids,
  children,
}: {
  ids: ReadonlySet<string>;
  children: ReactNode;
}) {
  return <VisiblePostsContext.Provider value={ids}>{children}</VisiblePostsContext.Provider>;
}

const WEB_FEED_TOUCH =
  Platform.OS === 'web'
    ? ({ touchAction: 'pan-y pinch-zoom' } as object)
    : undefined;

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (live) {
        setReduce(value);
      }
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

function useInViewport(enabled: boolean, postId: string) {
  const visibleIds = useContext(VisiblePostsContext);
  const listed = visibleIds != null;
  const listedInView = Boolean(visibleIds?.has(postId));
  const ref = useRef<View>(null);
  const [measured, setMeasured] = useState(false);
  const { height: winH, width: winW } = useWindowDimensions();

  useEffect(() => {
    if (!enabled || listed) {
      return;
    }

    if (Platform.OS === 'web' && typeof IntersectionObserver !== 'undefined') {
      const node = ref.current as unknown as HTMLElement | null;
      if (node && typeof node.getBoundingClientRect === 'function') {
        const io = new IntersectionObserver(
          ([entry]) => {
            setMeasured(Boolean(entry?.isIntersecting && (entry.intersectionRatio ?? 0) >= 0.28));
          },
          { threshold: [0, 0.28, 0.5] },
        );
        io.observe(node);
        return () => io.disconnect();
      }
    }

    const tick = () => {
      ref.current?.measureInWindow((x, y, width, height) => {
        const visible = Math.min(y + height, winH) - Math.max(y, 0);
        const ratio = height > 0 ? visible / height : 0;
        const onScreen = y < winH && y + height > 0 && x < winW && x + width > 0;
        setMeasured(onScreen && ratio >= 0.28);
      });
    };
    tick();
    const id = setInterval(tick, 380);
    return () => clearInterval(id);
  }, [enabled, listed, winH, winW]);

  return { ref, inView: listed ? listedInView : measured };
}

function useFirstMediaSize(uri?: string) {
  const [size, setSize] = useState<MediaSize | null>(null);
  useEffect(() => {
    setSize(null);
    if (!uri || !isStillPostMedia(uri)) {
      return;
    }
    let live = true;
    RnImage.getSize(
      uri,
      (width, height) => {
        if (live) {
          setSize({ width, height });
        }
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [uri]);
  return size;
}

export function PostMediaCarousel({
  postId,
  urls,
  labels,
  captions,
  pauseCycle = false,
}: {
  postId: string;
  urls: string[];
  labels?: string[];
  captions?: Array<string | null | undefined>;
  pauseCycle?: boolean;
}) {
  const lightbox = useMediaLightboxOptional();
  const { width: windowW, height: windowH } = useWindowDimensions();
  const [cardWidth, setCardWidth] = useState(() =>
    Platform.OS === 'web' ? Math.min(windowW, FEED_COLUMN_MAX) : windowW,
  );
  const firstSize = useFirstMediaSize(urls[0]);
  const orientation = orientationFromSize(firstSize);
  const frameH = pagerFrameHeight({
    viewportHeight: windowH,
    cardWidth,
    orientation,
  });
  const stillCount = stillCountInPager(urls);
  const reducedMotion = useReduceMotion();
  const { ref: inViewRef, inView } = useInViewport(stillCount >= 2 && !reducedMotion, postId);
  const pageWidth = Math.max(cardWidth, 1);
  const [index, setIndex] = useState(() => rememberedPagerIndex(postId, urls.length));
  const [userPaused, setUserPaused] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [hover, setHover] = useState(false);
  const dragging = useRef(false);
  const autoScrolling = useRef(false);
  const indexRef = useRef(index);
  const urlsRef = useRef(urls);
  const pageWidthRef = useRef(pageWidth);
  const shift = useRef(new Animated.Value(-rememberedPagerIndex(postId, urls.length) * pageWidth)).current;
  const shiftOffset = useRef(-rememberedPagerIndex(postId, urls.length) * pageWidth);
  const urlsKey = urls.join('\0');
  indexRef.current = index;
  urlsRef.current = urls;
  pageWidthRef.current = pageWidth;

  const lightboxItems: LightboxItem[] = urls.map((uri, itemIndex) => ({
    uri,
    label: captions?.[itemIndex] || labels?.[itemIndex],
  }));

  const settleAt = useCallback(
    (next: number, animated: boolean, fromUser: boolean) => {
      const clamped = Math.min(Math.max(next, 0), Math.max(urlsRef.current.length - 1, 0));
      setIndex(clamped);
      rememberPagerIndex(postId, clamped);
      if (fromUser) {
        setUserPaused(true);
      }
      const to = -clamped * pageWidthRef.current;
      shiftOffset.current = to;
      autoScrolling.current = true;
      if (!animated) {
        shift.setValue(to);
        autoScrolling.current = false;
        return;
      }
      Animated.timing(shift, {
        toValue: to,
        duration: 240,
        useNativeDriver: true,
      }).start(() => {
        autoScrolling.current = false;
      });
    },
    [postId, shift],
  );

  const goTo = useCallback(
    (next: number, animated: boolean) => {
      settleAt(next, animated, false);
    },
    [settleAt],
  );

  useEffect(() => {
    const start = rememberedPagerIndex(postId, urls.length);
    setIndex(start);
    settleAt(start, false, false);
  }, [pageWidth, postId, settleAt, urls.length]);

  const markUserPaused = useCallback(() => {
    setUserPaused(true);
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          carouselClaimsHorizontal(gesture.dx, gesture.dy),
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          carouselClaimsHorizontal(gesture.dx, gesture.dy),
        onPanResponderTerminationRequest: () => !dragging.current,
        onPanResponderGrant: () => {
          dragging.current = true;
          markUserPaused();
          shift.stopAnimation((value) => {
            shiftOffset.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          const width = pageWidthRef.current;
          const last = Math.max(urlsRef.current.length - 1, 0);
          const min = -last * width;
          shift.setValue(Math.min(0, Math.max(min, shiftOffset.current + gesture.dx)));
        },
        onPanResponderRelease: (_, gesture) => {
          const next = snapCarouselIndex({
            from: indexRef.current,
            dx: gesture.dx,
            vx: gesture.vx,
            pageWidth: pageWidthRef.current,
            length: urlsRef.current.length,
          });
          dragging.current = false;
          settleAt(next, true, true);
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
          settleAt(indexRef.current, true, false);
        },
      }),
    [markUserPaused, settleAt, shift],
  );

  const cycling = canAutoCyclePager({
    stillCount,
    reducedMotion,
    userPaused: userPaused || hover || pauseCycle || Boolean(lightbox?.open),
    inView,
    videoPlaying,
  });

  useEffect(() => {
    if (!cycling || urlsRef.current.length < 2) {
      return;
    }
    const handle = setTimeout(() => {
      goTo(nextAutoCycleIndex(urlsRef.current, indexRef.current), true);
    }, POST_MEDIA_CYCLE_MS);
    return () => clearTimeout(handle);
  }, [cycling, goTo, index, urlsKey]);

  function openAt(itemIndex: number) {
    if (dragging.current) {
      return;
    }
    markUserPaused();
    lightbox?.openLightbox(lightboxItems, itemIndex);
  }

  if (urls.length === 0) {
    return null;
  }

  const hoverProps =
    Platform.OS === 'web'
      ? {
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
        }
      : {};

  return (
    <View
      ref={inViewRef}
      collapsable={false}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        if (next > 0 && next !== cardWidth) {
          setCardWidth(next);
        }
      }}
      style={[{ overflow: 'hidden', width: '100%' }, WEB_FEED_TOUCH]}
      {...hoverProps}>
      {urls.length === 1 ? (
        <MediaSlide
          uri={urls[0]}
          width={pageWidth}
          height={frameH}
          active
          caption={captions?.[0]}
          onOpen={lightbox ? () => openAt(0) : undefined}
          onPlayingChange={setVideoPlaying}
        />
      ) : (
        <View>
          <View
            {...pan.panHandlers}
            style={[
              { width: pageWidth, height: frameH, overflow: 'hidden' },
              WEB_FEED_TOUCH,
            ]}>
            <Animated.View
              style={{
                flexDirection: 'row',
                width: pageWidth * urls.length,
                height: frameH,
                transform: [{ translateX: shift }],
              }}>
              {urls.map((uri, itemIndex) => (
                <View key={`${uri}-${itemIndex}`} style={{ width: pageWidth, height: frameH }}>
                  <MediaSlide
                    uri={uri}
                    width={pageWidth}
                    height={frameH}
                    active={itemIndex === index}
                    caption={captions?.[itemIndex]}
                    onOpen={lightbox && isStillPostMedia(uri) ? () => openAt(itemIndex) : undefined}
                    onPlayingChange={itemIndex === index ? setVideoPlaying : undefined}
                  />
                </View>
              ))}
            </Animated.View>
          </View>
          <View pointerEvents="box-none" style={dotBarStyle}>
            <View style={dotChipStyle}>
              {urls.map((uri, itemIndex) => (
                <Pressable
                  key={`${uri}-dot-${itemIndex}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Photo ${itemIndex + 1} of ${urls.length}`}
                  accessibilityState={{ selected: itemIndex === index }}
                  hitSlop={8}
                  onPress={() => {
                    markUserPaused();
                    goTo(itemIndex, true);
                  }}
                  style={[dotStyle, itemIndex === index ? dotOnStyle : dotOffStyle]}
                />
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function MediaSlide({
  uri,
  width,
  height,
  active,
  caption,
  onOpen,
  onPlayingChange,
}: {
  uri: string;
  width: number;
  height: number;
  active: boolean;
  caption?: string | null;
  onOpen?: () => void;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const tapStart = useRef<{ x: number; y: number; at: number } | null>(null);
  const kind = mediaKind(uri);
  const frameStyle = {
    width,
    height,
    overflow: 'hidden' as const,
    backgroundColor: LETTERBOX,
    borderRadius: 14,
  };
  const body =
    kind === 'video' ? (
      <PostVideo uri={uri} active={active} onPlayingChange={onPlayingChange} />
    ) : (
      <Image
        source={{ uri }}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        contentPosition="center"
        cachePolicy="memory-disk"
        recyclingKey={uri}
        pointerEvents="none"
      />
    );
  return (
    <View
      accessibilityRole={onOpen ? 'button' : undefined}
      accessibilityLabel={onOpen ? 'Open photo' : undefined}
      onAccessibilityTap={onOpen}
      onTouchStart={(event) => {
        tapStart.current = {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
          at: Date.now(),
        };
      }}
      onTouchEnd={(event) => {
        const start = tapStart.current;
        tapStart.current = null;
        if (!onOpen || !start) {
          return;
        }
        const dx = event.nativeEvent.pageX - start.x;
        const dy = event.nativeEvent.pageY - start.y;
        if (Date.now() - start.at > 450 || Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          return;
        }
        onOpen();
      }}
      style={[frameStyle, WEB_FEED_TOUCH]}>
      {body}
      {caption?.trim() ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 12,
          }}>
          <AppText
            className="text-[15px] leading-5"
            style={{ color: '#fff' }}
            numberOfLines={2}
            ellipsizeMode="tail">
            {caption}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function PostVideo({
  uri,
  active,
  onPlayingChange,
}: {
  uri: string;
  active: boolean;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const poster = useVideoPoster(uri);

  useEffect(() => {
    if (!active && playing) {
      setPlaying(false);
      onPlayingChange?.(false);
    }
  }, [active, onPlayingChange, playing]);

  if (!playing) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Play video"
        onPress={() => {
          setPlaying(true);
          onPlayingChange?.(true);
        }}
        style={{
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: LETTERBOX,
          overflow: 'hidden',
        }}>
        {poster ? (
          <Image
            source={{ uri: poster }}
            contentFit="contain"
            contentPosition="center"
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
        ) : null}
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(16,19,18,0.55)',
          }}>
          <Glyph name={GLYPH.play} color="#fff" size={18} />
        </View>
      </Pressable>
    );
  }
  return <PostVideoPlayer uri={uri} />;
}

function PostVideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.muted = false;
    instance.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%', backgroundColor: LETTERBOX, overflow: 'hidden' }}
      contentFit="contain"
      nativeControls
    />
  );
}

const dotBarStyle = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  bottom: 10,
  flexDirection: 'row' as const,
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
};

const dotChipStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 6,
  paddingHorizontal: 8,
  paddingVertical: 5,
  borderRadius: 999,
  backgroundColor: 'rgba(16, 19, 18, 0.42)',
};

const dotStyle = {
  width: 7,
  height: 7,
  borderRadius: 4,
};

const dotOnStyle = {
  backgroundColor: THEME.accent,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.85)',
};

const dotOffStyle = {
  backgroundColor: 'rgba(255,255,255,0.55)',
  borderWidth: 1,
  borderColor: 'rgba(16,19,18,0.35)',
};
