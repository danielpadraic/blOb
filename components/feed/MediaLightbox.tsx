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
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { PlayerCloseButton } from '@/components/ui/PlayerCloseButton';
import { FEED_COLUMN_MAX, THEME } from '@/lib/theme';
import { videoPlaybackSrc } from '@/lib/videoPosterUrl';
import { applyWebVideoLock, preventWebVideoFullscreen } from '@/lib/webVideo';
import { mediaKind } from '@/utils/media';

export type LightboxItem = {
  uri: string;
  label?: string;
};

type LightboxState = {
  items: LightboxItem[];
  index: number;
};

type MediaLightboxValue = {
  openLightbox: (items: LightboxItem[], index?: number) => void;
  closeLightbox: () => void;
  open: boolean;
};

const MediaLightboxContext = createContext<MediaLightboxValue | null>(null);

const DIM = 'rgba(16, 19, 18, 0.96)';

let closeLightboxFn: (() => void) | null = null;

export function closeMediaLightbox() {
  closeLightboxFn?.();
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

function lightboxItems(items: LightboxItem[]): LightboxItem[] {
  return items.filter((item) => Boolean(item.uri));
}

export function MediaLightboxHost({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LightboxState | null>(null);

  const closeLightbox = useCallback(() => setState(null), []);
  const openLightbox = useCallback((items: LightboxItem[], index = 0) => {
    const next = lightboxItems(items);
    if (next.length === 0) {
      return;
    }
    const start = Math.min(Math.max(index, 0), next.length - 1);
    setState({ items: next, index: start });
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
  const pageWidth = Math.max(width, 1);
  const pageHeight = Math.max(height, 1);
  const open = Boolean(state);

  useEffect(() => {
    if (!state) {
      return;
    }
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
            pagingEnabled
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
                onClose={onClose}
              />
            ))}
          </ScrollView>

          <View style={[styles.close, { top: Math.max(insets.top, 8) }]}>
            <PlayerCloseButton accessibilityLabel="Close" onPress={onClose} />
          </View>

          {items.length > 1 ? (
            <View
              pointerEvents="box-none"
              style={[styles.dots, { bottom: Math.max(insets.bottom, 12) + (current?.label ? 28 : 8) }]}>
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

          {current?.label ? (
            <View
              pointerEvents="none"
              style={[styles.captionWrap, { bottom: Math.max(insets.bottom, 12) + 6 }]}>
              <AppText style={styles.caption}>{current.label}</AppText>
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
  onClose,
}: {
  item: LightboxItem;
  width: number;
  mediaWidth: number;
  height: number;
  onClose: () => void;
}) {
  const playUri = videoPlaybackSrc(item.uri) || item.uri;
  const kind = mediaKind(item.uri);
  const zoomable = Platform.OS === 'ios' && kind !== 'video';
  const mediaStyle = { width: mediaWidth, height };

  const media =
    kind === 'video' ? (
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
        style={[styles.mediaSlot, { width, height }]}>
        {zoomable ? (
          <ScrollView
            style={mediaStyle}
            contentContainerStyle={mediaStyle}
            maximumZoomScale={4}
            minimumZoomScale={1}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            centerContent
            bouncesZoom>
            <View style={mediaStyle} pointerEvents="none">
              {media}
            </View>
          </ScrollView>
        ) : (
          media
        )}
      </View>
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
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 2,
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
  captionWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  caption: {
    color: THEME.primaryForeground,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(16, 19, 18, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
