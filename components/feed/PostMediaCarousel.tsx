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
  AccessibilityInfo,
  ActivityIndicator,
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
  canAutoplayHomeVideo,
  canOpenHomeVideoPlayer,
  homeInlineVideoMuted,
  homeVideoPreload,
  logHomeVideoIfGrey,
} from '@/lib/homeFeedVideo';
import { videoPlaybackSrc } from '@/lib/videoPosterUrl';
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
import { applyWebVideoLock, preventWebVideoFullscreen } from '@/lib/webVideo';
import { mediaKind } from '@/utils/media';

const LETTERBOX = 'rgba(16, 19, 18, 0.08)';

const VisiblePostsContext = createContext<ReadonlySet<string> | null>(null);

const VideoSlotContext = createContext<{
  playingId: string | null;
  primedId: string | null;
  unmutedId: string | null;
  play: (id: string) => void;
  stop: (id: string) => void;
  unmute: (id: string) => void;
  mute: () => void;
} | null>(null);

export function VisiblePostsProvider({
  ids,
  children,
}: {
  ids: ReadonlySet<string>;
  children: ReactNode;
}) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [unmutedId, setUnmutedId] = useState<string | null>(null);
  const primedId = useMemo(() => {
    for (const id of ids) {
      if (id && id !== playingId) {
        return id;
      }
    }
    return null;
  }, [ids, playingId]);
  const play = useCallback((id: string) => {
    setPlayingId((current) => {
      if (current && current !== id) {
        return current;
      }
      if (current !== id) {
        setUnmutedId(null);
      }
      return id;
    });
  }, []);
  const stop = useCallback((id: string) => {
    setPlayingId((current) => (current === id ? null : current));
    setUnmutedId((current) => (current === id ? null : current));
  }, []);
  const unmute = useCallback((id: string) => {
    setPlayingId(id);
    setUnmutedId(id);
  }, []);
  const mute = useCallback(() => setUnmutedId(null), []);
  const slot = useMemo(
    () => ({
      playingId,
      primedId,
      unmutedId,
      play,
      stop,
      unmute,
      mute,
    }),
    [mute, play, playingId, primedId, stop, unmute, unmutedId],
  );
  return (
    <VisiblePostsContext.Provider value={ids}>
      <VideoSlotContext.Provider value={slot}>{children}</VideoSlotContext.Provider>
    </VisiblePostsContext.Provider>
  );
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

function useInViewport(enabled: boolean, postId: string, minRatio = 0.28) {
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
            setMeasured(Boolean(entry?.isIntersecting && (entry.intersectionRatio ?? 0) >= minRatio));
          },
          { threshold: [0, minRatio, 0.5, 1] },
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
        setMeasured(onScreen && ratio >= minRatio);
      });
    };
    tick();
    const id = setInterval(tick, 380);
    return () => clearInterval(id);
  }, [enabled, listed, minRatio, winH, winW]);

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
  homeInline = false,
}: {
  postId: string;
  urls: string[];
  labels?: string[];
  captions?: Array<string | null | undefined>;
  pauseCycle?: boolean;
  /** Home list only: muted autoplay, speaker, phone-width player with X. */
  homeInline?: boolean;
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
  const { ref: inViewRef, inView } = useInViewport(
    (stillCount >= 2 && !reducedMotion) || homeInline,
    postId,
    homeInline ? 0.5 : 0.28,
  );
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
          postId={postId}
          uri={urls[0]}
          width={pageWidth}
          height={frameH}
          active
          inView={inView}
          homeInline={homeInline}
          lightboxOpen={Boolean(lightbox?.open)}
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
                    postId={postId}
                    uri={uri}
                    width={pageWidth}
                    height={frameH}
                    active={itemIndex === index}
                    inView={inView}
                    homeInline={homeInline}
                    lightboxOpen={Boolean(lightbox?.open)}
                    caption={captions?.[itemIndex]}
                    onOpen={
                      lightbox && (homeInline || isStillPostMedia(uri))
                        ? () => openAt(itemIndex)
                        : undefined
                    }
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
  postId,
  uri,
  width,
  height,
  active,
  inView,
  homeInline,
  lightboxOpen,
  caption,
  onOpen,
  onPlayingChange,
}: {
  postId: string;
  uri: string;
  width: number;
  height: number;
  active: boolean;
  inView: boolean;
  homeInline?: boolean;
  lightboxOpen?: boolean;
  caption?: string | null;
  onOpen?: () => void;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const tapStart = useRef<{ x: number; y: number; at: number } | null>(null);
  const kind = mediaKind(uri);
  const stillOpen = kind !== 'video' ? onOpen : undefined;
  const frameStyle = {
    width,
    height,
    overflow: 'hidden' as const,
    backgroundColor: kind === 'video' ? THEME.surface2 : LETTERBOX,
    borderRadius: 14,
  };
  const body =
    kind === 'video' ? (
      <PostVideo
        postId={postId}
        uri={uri}
        active={active}
        inView={inView}
        homeInline={homeInline}
        lightboxOpen={lightboxOpen}
        onOpen={homeInline ? onOpen : undefined}
        onPlayingChange={onPlayingChange}
      />
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
      accessibilityRole={stillOpen ? 'button' : undefined}
      accessibilityLabel={stillOpen ? 'Open photo' : undefined}
      onAccessibilityTap={stillOpen}
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
        if (!stillOpen || !start) {
          return;
        }
        const dx = event.nativeEvent.pageX - start.x;
        const dy = event.nativeEvent.pageY - start.y;
        if (Date.now() - start.at > 450 || Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          return;
        }
        stillOpen();
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
  postId,
  uri,
  active,
  inView,
  homeInline,
  lightboxOpen,
  onOpen,
  onPlayingChange,
}: {
  postId: string;
  uri: string;
  active: boolean;
  inView: boolean;
  homeInline?: boolean;
  lightboxOpen?: boolean;
  onOpen?: () => void;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const poster = useVideoPoster(uri);
  const src = videoPlaybackSrc(uri);

  useEffect(() => {
    setFrameReady(false);
  }, [src]);
  const hasSrc = Boolean(src);
  const slot = useContext(VideoSlotContext);
  const reduceMotion = useReduceMotion();
  const canPlay = homeInline
    ? canAutoplayHomeVideo({
        inView: inView && !lightboxOpen,
        active,
        poster,
        hasSrc,
        reduceMotion,
      })
    : false;
  const isSlot = !slot || slot.playingId === postId;
  const muted = homeInline
    ? homeInlineVideoMuted({
        playingId: slot?.playingId ?? postId,
        postId,
        unmutedId: slot?.unmutedId ?? null,
      })
    : false;
  const primed =
    homeInline &&
    homeVideoPreload({ inView: false, primed: slot?.primedId === postId }) === 'metadata' &&
    slot?.primedId === postId &&
    !canPlay;

  useEffect(() => {
    if (!homeInline) {
      return;
    }
    logHomeVideoIfGrey({
      postId,
      hasPoster: Boolean(poster),
      hasSrc,
      inView,
    });
  }, [hasSrc, homeInline, inView, postId, poster]);

  useEffect(() => {
    if (!homeInline) {
      return;
    }
    if (canPlay) {
      slot?.play(postId);
      onPlayingChange?.(true);
      return;
    }
    slot?.stop(postId);
    onPlayingChange?.(false);
  }, [canPlay, homeInline, onPlayingChange, postId, slot, slot?.playingId]);

  useEffect(() => {
    if (homeInline) {
      return;
    }
    if (!active && playing) {
      setPlaying(false);
      slot?.stop(postId);
      onPlayingChange?.(false);
    }
  }, [active, homeInline, onPlayingChange, playing, postId, slot]);

  useEffect(() => {
    if (homeInline) {
      return;
    }
    if (slot?.playingId && slot.playingId !== postId && playing) {
      setPlaying(false);
      onPlayingChange?.(false);
    }
  }, [homeInline, onPlayingChange, playing, postId, slot?.playingId]);

  if (homeInline) {
    const live = Boolean(canPlay && isSlot && hasSrc);
    const showSpinner = (inView && !hasSrc) || (!poster && !frameReady);
    return (
      <View style={{ width: '100%', height: '100%', backgroundColor: THEME.surface2, overflow: 'hidden' }}>
        {poster ? (
          <Image
            source={{ uri: poster }}
            contentFit="contain"
            contentPosition="center"
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
        ) : null}
        {primed ? <PrimeFeedVideo uri={src} /> : null}
        {live ? (
          <HomeFeedVideo uri={src} poster={poster} muted={muted} onReady={() => setFrameReady(true)} />
        ) : null}
        {showSpinner ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <ActivityIndicator color={THEME.accent} />
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={onOpen ? 'Open video' : muted ? 'Unmute video' : 'Mute video'}
          onPress={() => {
            if (onOpen && canOpenHomeVideoPlayer({ hasSrc, src })) {
              slot?.mute();
              onOpen();
              return;
            }
            if (muted) {
              slot?.unmute(postId);
            } else {
              slot?.mute();
            }
          }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Unmute' : 'Mute'}
          onPress={() => {
            if (muted) {
              slot?.unmute(postId);
            } else {
              slot?.mute();
            }
          }}
          hitSlop={6}
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(16,19,18,0.55)',
          }}>
          <Glyph name={muted ? GLYPH.mute : GLYPH.unmute} color="#fff" size={18} />
        </Pressable>
      </View>
    );
  }

  const allowed = !slot || slot.playingId === postId;
  if (!playing || !allowed) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Play video"
        onPress={() => {
          slot?.play(postId);
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
        {slot?.primedId === postId ? <PrimeFeedVideo uri={uri} /> : null}
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

function PrimeFeedVideo({ uri }: { uri: string }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !uri) {
      return undefined;
    }
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = uri;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }, [uri]);
  return null;
}

function HomeFeedVideo({
  uri,
  poster,
  muted,
  onReady,
}: {
  uri: string;
  poster: string | null;
  muted: boolean;
  onReady?: () => void;
}) {
  if (Platform.OS === 'web') {
    return <WebHomeFeedVideo uri={uri} poster={poster} muted={muted} onReady={onReady} />;
  }
  return <NativeHomeFeedVideo uri={uri} muted={muted} onReady={onReady} />;
}

function WebHomeFeedVideo({
  uri,
  poster,
  muted,
  onReady,
}: {
  uri: string;
  poster: string | null;
  muted: boolean;
  onReady?: () => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return undefined;
    }
    applyWebVideoLock(node, poster);
    node.muted = muted;
    node.defaultMuted = muted;
    node.loop = true;
    node.preload = 'auto';
    const markReady = () => onReady?.();
    const play = () => {
      void node.play().catch(() => undefined);
    };
    node.addEventListener('loadeddata', markReady);
    node.addEventListener('playing', markReady);
    node.addEventListener('webkitbeginfullscreen', preventWebVideoFullscreen);
    node.addEventListener('webkitendfullscreen', preventWebVideoFullscreen);
    play();
    return () => {
      node.removeEventListener('loadeddata', markReady);
      node.removeEventListener('playing', markReady);
      node.removeEventListener('webkitbeginfullscreen', preventWebVideoFullscreen);
      node.removeEventListener('webkitendfullscreen', preventWebVideoFullscreen);
      node.pause();
    };
  }, [muted, onReady, poster, uri]);

  return createElement('video', {
    ref,
    src: uri,
    poster: poster ?? undefined,
    muted,
    playsInline: true,
    loop: true,
    preload: 'auto',
    controls: false,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      backgroundColor: 'transparent',
    },
  });
}

function NativeHomeFeedVideo({
  uri,
  muted,
  onReady,
}: {
  uri: string;
  muted: boolean;
  onReady?: () => void;
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = muted;
    instance.play();
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    const timer = setTimeout(() => onReady?.(), 240);
    const sub =
      typeof player.addListener === 'function'
        ? player.addListener('statusChange', (status: { status?: string; playing?: boolean }) => {
            if (status.status === 'readyToPlay' || status.playing) {
              onReady?.();
            }
          })
        : null;
    return () => {
      clearTimeout(timer);
      sub?.remove?.();
      player.pause();
    };
  }, [onReady, player]);

  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%', backgroundColor: 'transparent', overflow: 'hidden' }}
      contentFit="contain"
      nativeControls={false}
    />
  );
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
