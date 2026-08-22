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
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
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
};

const MediaLightboxContext = createContext<MediaLightboxValue | null>(null);

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

export function MediaLightboxHost({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LightboxState | null>(null);

  const closeLightbox = useCallback(() => setState(null), []);
  const openLightbox = useCallback((items: LightboxItem[], index = 0) => {
    const next = items.filter((item) => item.uri);
    if (next.length === 0) {
      return;
    }
    setState({
      items: next,
      index: Math.min(Math.max(index, 0), next.length - 1),
    });
  }, []);

  useEffect(() => {
    closeLightboxFn = closeLightbox;
    return () => {
      if (closeLightboxFn === closeLightbox) {
        closeLightboxFn = null;
      }
    };
  }, [closeLightbox]);

  useEffect(() => {
    if (!state) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeLightbox();
      return true;
    });
    return () => sub.remove();
  }, [state, closeLightbox]);

  const value = useMemo(
    () => ({ openLightbox, closeLightbox }),
    [openLightbox, closeLightbox],
  );

  return (
    <MediaLightboxContext.Provider value={value}>
      {children}
      <MediaLightboxOverlay state={state} onClose={closeLightbox} />
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
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const pageWidth = Math.max(width, 1);

  useEffect(() => {
    if (!state) {
      return;
    }
    const x = state.index * pageWidth;
    requestAnimationFrame(() => {
      pager.current?.scrollTo({ x, animated: false });
    });
  }, [state, pageWidth]);

  if (!state) {
    return null;
  }

  return (
    <ChromeOverlay visible onClose={onClose} align="center" dim="heavy">
      <View
        style={{
          flex: 1,
          width: '100%',
          minHeight: '100%',
          justifyContent: 'center',
        }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
          onPress={onClose}
          style={{
            position: 'absolute',
            top: Math.max(insets.top, 12) + 4,
            right: 16,
            zIndex: 2,
            height: 40,
            width: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 20,
            backgroundColor: 'rgba(16, 19, 18, 0.45)',
          }}>
          <AppText className="text-[20px] font-extrabold" style={{ color: '#fff' }}>
            ×
          </AppText>
        </Pressable>

        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          nestedScrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          contentContainerStyle={{ alignItems: 'stretch' }}>
          {state.items.map((item) => (
            <LightboxPage key={item.uri} item={item} width={pageWidth} onClose={onClose} />
          ))}
        </ScrollView>
      </View>
    </ChromeOverlay>
  );
}

function LightboxPage({
  item,
  width,
  onClose,
}: {
  item: LightboxItem;
  width: number;
  onClose: () => void;
}) {
  const kind = mediaKind(item.uri);
  const zoomable = Platform.OS === 'ios';

  const media =
    kind === 'video' ? (
      <LightboxVideo uri={item.uri} />
    ) : (
      <Image
        source={{ uri: item.uri }}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        contentPosition="center"
        recyclingKey={item.uri}
      />
    );

  return (
    <View style={{ width, flex: 1, justifyContent: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close photo"
        onPress={onClose}
        style={{ flex: 1, justifyContent: 'center' }}>
        {zoomable && kind !== 'video' ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
            maximumZoomScale={4}
            minimumZoomScale={1}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            centerContent
            bouncesZoom>
            <View style={{ width, height: '100%' }} pointerEvents="none">
              {media}
            </View>
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }} pointerEvents={kind === 'video' ? 'auto' : 'none'}>
            {media}
          </View>
        )}
      </Pressable>
      {item.label ? (
        <AppText
          className="pb-8 text-center text-[13px] font-semibold"
          style={{ color: '#fff' }}>
          {item.label}
        </AppText>
      ) : null}
    </View>
  );
}

function LightboxVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.muted = false;
  });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
      contentFit="contain"
      nativeControls
    />
  );
}
