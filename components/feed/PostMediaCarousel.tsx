import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Image as RnImage,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';

import { useMediaLightboxOptional, type LightboxItem } from '@/components/feed/MediaLightbox';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { useVideoPoster } from '@/hooks/useVideoPoster';
import {
  POST_MEDIA_CYCLE_MS,
  canAutoCyclePager,
  isStillPostMedia,
  nextAutoCycleIndex,
  orientationFromSize,
  pagerFrameHeight,
  rememberPagerIndex,
  rememberedPagerIndex,
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

const WEB_PAGER =
  Platform.OS === 'web'
    ? ({
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollSnapType: 'x mandatory',
        overscrollBehaviorX: 'contain',
        touchAction: 'pan-x',
      } as object)
    : undefined;

const WEB_PAGE =
  Platform.OS === 'web'
    ? ({ scrollSnapAlign: 'start', scrollSnapStop: 'always', flexShrink: 0 } as object)
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
  pauseCycle = false,
}: {
  postId: string;
  urls: string[];
  labels?: string[];
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
  const pager = useRef<ScrollView>(null);
  const pageWidth = Math.max(cardWidth, 1);
  const [index, setIndex] = useState(() => rememberedPagerIndex(postId, urls.length));
  const [userPaused, setUserPaused] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [hover, setHover] = useState(false);
  const dragging = useRef(false);
  const autoScrolling = useRef(false);
  const indexRef = useRef(index);
  const urlsRef = useRef(urls);
  const urlsKey = urls.join('\0');
  indexRef.current = index;
  urlsRef.current = urls;

  const lightboxItems: LightboxItem[] = urls.map((uri, itemIndex) => ({
    uri,
    label: labels?.[itemIndex],
  }));

  const goTo = useCallback(
    (next: number, animated: boolean) => {
      const clamped = Math.min(Math.max(next, 0), Math.max(urls.length - 1, 0));
      setIndex(clamped);
      rememberPagerIndex(postId, clamped);
      autoScrolling.current = true;
      pager.current?.scrollTo({ x: clamped * pageWidth, animated });
      requestAnimationFrame(() => {
        autoScrolling.current = false;
      });
    },
    [pageWidth, postId, urls.length],
  );

  useEffect(() => {
    const start = rememberedPagerIndex(postId, urls.length);
    setIndex(start);
    requestAnimationFrame(() => {
      pager.current?.scrollTo({ x: start * pageWidth, animated: false });
    });
  }, [pageWidth, postId, urls.length]);

  const markUserPaused = useCallback(() => {
    setUserPaused(true);
  }, []);

  function pageFromOffset(x: number) {
    const next = Math.round(x / pageWidth);
    if (!Number.isFinite(next)) {
      return;
    }
    const clamped = Math.min(Math.max(next, 0), Math.max(urls.length - 1, 0));
    setIndex((current) => {
      if (current === clamped) {
        return current;
      }
      rememberPagerIndex(postId, clamped);
      if (!autoScrolling.current) {
        setUserPaused(true);
      }
      return clamped;
    });
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    pageFromOffset(event.nativeEvent.contentOffset.x);
  }

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    pageFromOffset(event.nativeEvent.contentOffset.x);
    dragging.current = false;
  }

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
      style={{ overflow: 'hidden', width: '100%' }}
      {...hoverProps}>
      {urls.length === 1 ? (
        <MediaSlide
          uri={urls[0]}
          width={pageWidth}
          height={frameH}
          active
          onOpen={lightbox ? () => openAt(0) : undefined}
          onPlayingChange={setVideoPlaying}
        />
      ) : (
        <View>
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            directionalLockEnabled
            disableIntervalMomentum
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            keyboardShouldPersistTaps="handled"
            style={[{ width: pageWidth, height: frameH }, WEB_PAGER]}
            contentContainerStyle={{ height: frameH }}
            contentOffset={{ x: index * pageWidth, y: 0 }}
            scrollEventThrottle={16}
            onScroll={onScroll}
            onScrollBeginDrag={() => {
              dragging.current = true;
              markUserPaused();
            }}
            onMomentumScrollEnd={onScrollEnd}
            onScrollEndDrag={onScrollEnd}
            onTouchStart={markUserPaused}>
            {urls.map((uri, itemIndex) => (
              <View key={`${uri}-${itemIndex}`} style={[{ width: pageWidth, height: frameH }, WEB_PAGE]}>
                <MediaSlide
                  uri={uri}
                  width={pageWidth}
                  height={frameH}
                  active={itemIndex === index}
                  onOpen={lightbox && isStillPostMedia(uri) ? () => openAt(itemIndex) : undefined}
                  onPlayingChange={itemIndex === index ? setVideoPlaying : undefined}
                />
              </View>
            ))}
          </ScrollView>
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
  onOpen,
  onPlayingChange,
}: {
  uri: string;
  width: number;
  height: number;
  active: boolean;
  onOpen?: () => void;
  onPlayingChange?: (playing: boolean) => void;
}) {
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
  if (!onOpen) {
    return <View style={frameStyle}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open photo"
      onPress={onOpen}
      style={frameStyle}>
      {body}
    </Pressable>
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
