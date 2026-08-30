import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated as RNAnimated,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useEventListener } from 'expo';
import * as Clipboard from 'expo-clipboard';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WaveRoundCommentsFeed } from '@/components/clips/WaveRoundCommentsFeed';
import { WatchSurface, useWatchSurface } from '@/components/clips/WatchSurface';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { Input } from '@/components/ui/Input';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { useClipSocial } from '@/hooks/useClipSocial';
import { useReportPost } from '@/hooks/usePostModeration';
import { useFriends, useShareStory, useViewStory } from '@/hooks/useSocial';
import { registerNativeCameraStop, stopAllLiveMedia, stopMedia, unwatchLiveMedia, watchLiveMedia } from '@/lib/cameraSession';
import { RoundShareComposer } from '@/components/clips/RoundShareComposer';
import { startClipRepostCapture } from '@/lib/clipAttach';
import { downloadClipMedia } from '@/lib/clipDownload';
import {
  CLIP_REACTIONS,
  DEFAULT_CLIP_REACTION,
  asClipReactionType,
  clipReactionEmoji,
  commentsDrawerHeight,
  commentsDrawerKeyboardLift,
  loadLastClipReaction,
  shouldAdvanceAfterCommentsClose,
  shouldHoldClipPlayback,
  saveLastClipReaction,
  type ClipReactionType,
} from '@/lib/clipReactions';
import {
  authorRanges,
  nextAuthorEntryIndex,
  nextStoryIndex,
  preloadStoryIndex,
  prevAuthorEntryIndex,
  prevStoryIndex,
  rangeAt,
  setPostHiddenFromRail,
} from '@/lib/clipRail';
import { clipSocialCounts } from '@/lib/clipPost';
import { copy } from '@/lib/copy';
import { canOfferShareToFeed } from '@/lib/roundShare';
import { userReaction } from '@/lib/reactions';
import { personDisplayName, type FeedChallengePreview } from '@/lib/social';
import { THEME } from '@/lib/theme';
import { startFreshWaveCapture } from '@/lib/waveCapture';
import { WAVE_CLIP_MS } from '@/lib/waveClips';
import { subscribeVisualViewport } from '@/lib/visualViewport';
import { applyWebVideoLock, preventWebVideoFullscreen, WEB_VIDEO_LOCK } from '@/lib/webVideo';
import { roundShareUrl, storyShareUrl } from '@/lib/waveShare';
import { getErrorMessage } from '@/utils/errors';
import { formatFeedTime } from '@/utils/format';

export type ClipPlayItem = {
  id: string;
  kind: 'wave' | 'round';
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption?: string | null;
  durationMs: number;
  startMs?: number;
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  createdAt: string;
  postId?: string | null;
  challengeId?: string | null;
  isOwn?: boolean;
  audience?: string | null;
  audienceUserIds?: string[];
  coverUrl?: string | null;
  username?: string | null;
  privacyMode?: string | null;
};

const RAIL_HIT = 52;
const RAIL_IDLE = 0.55;

type ClipSheet = 'share' | 'shareRepost' | 'shareMessage' | 'shareFeed' | 'more' | 'caption' | 'delete' | null;

const COMMENT_REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'other', label: 'Other' },
] as const;

type ClipPlayerProps = {
  clips: ClipPlayItem[];
  startIndex?: number;
  autoAdvance?: boolean;
  openComments?: boolean;
  challenges?: Map<string, FeedChallengePreview>;
  sharePrompt?: boolean;
  viewedIds?: Set<string>;
  onClose: () => void;
  onAddWave?: () => void;
};

export function ClipPlayer({
  clips,
  startIndex = 0,
  autoAdvance = true,
  openComments = false,
  challenges,
  sharePrompt = false,
  viewedIds,
  onClose,
  onAddWave,
}: ClipPlayerProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const watch = useWatchSurface();
  const topPad = Platform.OS === 'web' ? 8 : insets.top + 8;
  const bottomPad = Platform.OS === 'web' ? 8 : Math.max(insets.bottom, 8);
  const watchHeight = watch.height || Dimensions.get('window').height;
  const viewStory = useViewStory();
  const [index, setIndex] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const [sheet, setSheet] = useState<ClipSheet>(null);
  const [commentsMode, setCommentsMode] = useState(openComments);
  const [promptShare, setPromptShare] = useState(sharePrompt);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lastReaction, setLastReaction] = useState<ClipReactionType>(DEFAULT_CLIP_REACTION);
  const [float, setFloat] = useState<{ emoji: string; key: number } | null>(null);
  const [captionDraft, setCaptionDraft] = useState('');
  const [captionOpen, setCaptionOpen] = useState(false);
  const [captionOverflow, setCaptionOverflow] = useState(false);
  const [muted, setMuted] = useState(false);
  const [railHot, setRailHot] = useState(false);
  const paused = useRef(false);
  const sheetRef = useRef(sheet);
  const commentsRef = useRef(commentsMode);
  const persistReact = useRef<(type: ClipReactionType) => void>(() => undefined);
  const marked = useRef(new Set<string>());
  const clipsRef = useRef(clips);
  const indexRef = useRef(index);
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const captionOpenRef = useRef(false);
  const holdingRef = useRef(false);
  const lastTap = useRef(0);
  const viewedIdsRef = useRef(viewedIds ?? new Set<string>());
  const atStartX = useSharedValue(false);
  const atEndX = useSharedValue(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardPad, setKeyboardPad] = useState(0);
  const [roundPaused, setRoundPaused] = useState(false);
  const [pauseFlash, setPauseFlash] = useState<'play' | 'pause' | null>(null);
  const endedWhileOpen = useRef(false);
  const commentsScrollY = useRef(0);
  const keyboardRef = useRef(false);

  clipsRef.current = clips;
  indexRef.current = index;
  sheetRef.current = sheet;
  commentsRef.current = commentsMode;
  captionOpenRef.current = captionOpen;
  viewedIdsRef.current = viewedIds ?? new Set<string>();
  keyboardRef.current = keyboardVisible;

  useEffect(() => {
    void loadLastClipReaction().then(setLastReaction);
  }, []);

  useEffect(() => {
    if (!pauseFlash) {
      return undefined;
    }
    const id = setTimeout(() => setPauseFlash(null), 700);
    return () => clearTimeout(id);
  }, [pauseFlash]);

  const clip = clips[index];
  const kind = clip?.kind ?? clips[0]?.kind ?? 'wave';
  const holdPlayback = shouldHoldClipPlayback({ commentsOpen: commentsMode, keyboardVisible });
  paused.current = pickerOpen || (kind === 'wave' && holdingRef.current) || (kind === 'round' && roundPaused);
  const ranges = useMemo(() => authorRanges(clips), [clips]);
  const authorRange = rangeAt(ranges, index);
  const storyProgressIndex = authorRange ? index - authorRange.start : 0;
  const storyCount = authorRange ? authorRange.end - authorRange.start + 1 : 1;

  useEffect(() => {
    if (kind === 'wave') {
      atStartX.value = Boolean(ranges[0] && authorRange && authorRange.authorId === ranges[0].authorId);
      atEndX.value = Boolean(
        ranges.length &&
          authorRange &&
          authorRange.authorId === ranges[ranges.length - 1]?.authorId,
      );
      return;
    }
    atStartX.value = index === 0;
    atEndX.value = index >= clips.length - 1;
  }, [authorRange, atEndX, atStartX, clips.length, index, kind, ranges]);

  const applyIndex = useCallback((next: number | 'close' | null) => {
    if (next === 'close' || next == null) {
      if (next === 'close') {
        stopAllLiveMedia();
        onClose();
      }
      return;
    }
    setIndex(next);
  }, [onClose]);

  const goNextClip = useCallback(() => {
    const current = clipsRef.current;
    const at = indexRef.current;
    if ((current[at]?.kind ?? kind) === 'round') {
      if (at + 1 < current.length) {
        setIndex(at + 1);
      }
      return;
    }
    applyIndex(nextStoryIndex(authorRanges(current), at));
  }, [applyIndex, kind]);

  const goPrevClip = useCallback(() => {
    const current = clipsRef.current;
    const at = indexRef.current;
    if ((current[at]?.kind ?? kind) === 'round') {
      if (at > 0) {
        setIndex(at - 1);
      }
      return;
    }
    applyIndex(prevStoryIndex(authorRanges(current), at));
  }, [applyIndex, kind]);

  const goSwipeLeft = useCallback(() => {
    const current = clipsRef.current;
    const at = indexRef.current;
    if ((current[at]?.kind ?? kind) === 'round') {
      if (at + 1 < current.length) {
        setIndex(at + 1);
      }
      return;
    }
    const next = nextAuthorEntryIndex(current, authorRanges(current), at, viewedIdsRef.current);
    if (next != null) {
      setIndex(next);
    }
  }, [kind]);

  const goSwipeRight = useCallback(() => {
    const current = clipsRef.current;
    const at = indexRef.current;
    if ((current[at]?.kind ?? kind) === 'round') {
      if (at > 0) {
        setIndex(at - 1);
      }
      return;
    }
    const prev = prevAuthorEntryIndex(current, authorRanges(current), at, viewedIdsRef.current);
    if (prev != null) {
      setIndex(prev);
    }
  }, [kind]);

  const applyReaction = useCallback((type: ClipReactionType) => {
    setLastReaction(type);
    void saveLastClipReaction(type);
    setFloat({ emoji: clipReactionEmoji(type), key: Date.now() });
    setPickerOpen(false);
    persistReact.current(type);
  }, []);

  function closeComments() {
    setCommentsMode(false);
    if (shouldAdvanceAfterCommentsClose({ kind, endedWhileOpen: endedWhileOpen.current })) {
      endedWhileOpen.current = false;
      setTimeout(() => goNextClip(), 300);
      return;
    }
    endedWhileOpen.current = false;
  }

  function requestClose() {
    if (captionOpenRef.current) {
      setCaptionOpen(false);
      return;
    }
    if (commentsRef.current) {
      closeComments();
      return;
    }
    stopAllLiveMedia();
    onClose();
  }

  function openCommentsMode() {
    setCaptionOpen(false);
    setPickerOpen(false);
    setCommentsMode(true);
  }

  const handleEnded = useCallback(() => {
    if (commentsRef.current || keyboardRef.current) {
      endedWhileOpen.current = true;
      return;
    }
    if (kind === 'wave' && autoAdvance) {
      goNextClip();
    }
  }, [autoAdvance, goNextClip, kind]);

  useEffect(() => {
    if (holdPlayback && progress >= 0.97) {
      endedWhileOpen.current = true;
    }
  }, [holdPlayback, progress]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return subscribeVisualViewport((occlusion) => {
        setKeyboardPad(occlusion);
        setKeyboardVisible(occlusion > 80);
      });
    }
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardVisible(true);
      setKeyboardPad(event.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      setKeyboardPad(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    const keepId = clips[indexRef.current]?.id ?? clips[startIndex]?.id;
    const keep = clips.findIndex((row) => row.id === keepId);
    if (keep >= 0 && keep !== indexRef.current) {
      setIndex(keep);
    }
  }, [clips, startIndex]);

  useEffect(() => {
    setProgress(0);
    setFloat(null);
    setPickerOpen(false);
    setCommentsMode(openComments && index === startIndex);
    setSheet(null);
    setCaptionDraft(clip?.caption ?? '');
    setCaptionOpen(false);
    setCaptionOverflow(false);
    setRoundPaused(false);
    setPauseFlash(null);
    endedWhileOpen.current = false;
    commentsScrollY.current = 0;
  }, [clip?.id, index, openComments, startIndex]);

  useEffect(() => {
    if (!clip || clip.mediaType !== 'image' || !autoAdvance || holdPlayback || kind !== 'wave') {
      return undefined;
    }
    let acc = 0;
    let last = Date.now();
    const span = Math.max(clip.durationMs, 400);
    const id = setInterval(() => {
      const now = Date.now();
      if (!paused.current) {
        acc += now - last;
      }
      last = now;
      setProgress(Math.max(0, Math.min(1, acc / span)));
      if (acc >= span) {
        goNextClip();
      }
    }, 80);
    return () => clearInterval(id);
  }, [autoAdvance, clip?.durationMs, clip?.id, clip?.mediaType, goNextClip, holdPlayback, kind]);

  useEffect(() => {
    if (!clip || clip.isOwn || clip.kind !== 'wave') {
      return;
    }
    if (marked.current.has(clip.id)) {
      return;
    }
    marked.current.add(clip.id);
    viewStory.mutate(clip.id);
  }, [clip, viewStory]);

  useEffect(() => {
    return () => {
      stopAllLiveMedia();
    };
  }, []);

  const pan = useMemo(() => {
    const vertical = Gesture.Pan()
      .activeOffsetY([-28, 28])
      .failOffsetX([-36, 36])
      .onUpdate((event) => {
        if (event.translationY > 0) {
          translateY.value = event.translationY;
        }
      })
      .onEnd((event) => {
        if (sheetRef.current) {
          translateY.value = withTiming(0);
          return;
        }
        if (event.translationY < -80 && !commentsRef.current) {
          translateY.value = withTiming(0);
          runOnJS(openCommentsMode)();
          return;
        }
        if (event.translationY > 110) {
          runOnJS(requestClose)();
          return;
        }
        translateY.value = withTiming(0);
      });
    const horizontal = Gesture.Pan()
      .activeOffsetX([-28, 28])
      .failOffsetY([-36, 36])
      .onUpdate((event) => {
        const pullingStart = atStartX.value && event.translationX > 0;
        const pullingEnd = atEndX.value && event.translationX < 0;
        translateX.value = pullingStart || pullingEnd ? event.translationX * 0.32 : event.translationX;
      })
      .onEnd((event) => {
        if (sheetRef.current) {
          translateX.value = withTiming(0);
          return;
        }
        if (commentsRef.current) {
          translateX.value = withTiming(0);
          return;
        }
        if (event.translationX > 80 && !atStartX.value) {
          runOnJS(goSwipeRight)();
        } else if (event.translationX < -80 && !atEndX.value) {
          runOnJS(goSwipeLeft)();
        }
        translateX.value = withTiming(0);
      });
    return Gesture.Race(horizontal, vertical);
  }, [atEndX, atStartX, goSwipeLeft, goSwipeRight, translateX, translateY]);

  const commentsPan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(24)
        .onEnd((event) => {
          if (event.translationY > 56) {
            runOnJS(closeComments)();
          }
        }),
    [],
  );

  const dismissStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (!clip) {
    return null;
  }

  const origin = clip.challengeId ? challenges?.get(clip.challengeId) : undefined;
  const drawerH = commentsMode ? commentsDrawerHeight(watchHeight, keyboardVisible) : 0;
  const layoutHeight =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.innerHeight
      : Dimensions.get('window').height;
  const drawerLift = commentsMode
    ? commentsDrawerKeyboardLift({
        watchHeight,
        layoutHeight,
        occlusion: keyboardPad,
      })
    : 0;
  const railPad = commentsMode ? drawerH + drawerLift : bottomPad;
  const loopCurrent = kind === 'round' || holdPlayback;
  const nextAt =
    kind === 'wave' ? preloadStoryIndex(ranges, index) : index + 1 < clips.length ? index + 1 : null;
  const nextClip = nextAt != null ? clips[nextAt] : null;

  return (
    <WatchSurface>
      <StatusBar style="light" />
    <Animated.View style={[{ flex: 1, backgroundColor: '#101312', overflow: 'hidden' }, dismissStyle]}>
      <View style={{ flex: 1 }}>
      <GestureDetector gesture={pan}>
          <Animated.View
            style={[{ flex: 1, overflow: 'hidden', backgroundColor: '#101312' }, swipeStyle]}>
          {clip.mediaType === 'video' ? (
            <>
              {clip.coverUrl ? (
                <Image
                  source={{ uri: clip.coverUrl }}
                  style={{ position: 'absolute', width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              ) : null}
              <ClipVideo
                key={clip.id}
                uri={clip.mediaUrl}
                poster={clip.coverUrl}
                startMs={clip.startMs ?? 0}
                durationMs={clip.durationMs}
                loop={loopCurrent}
                muted={muted}
                pausedRef={paused}
                onEnded={handleEnded}
                onProgress={setProgress}
              />
              {nextClip?.mediaType === 'video' ? (
                <PreloadClip key={`preload-${nextClip.id}`} uri={nextClip.mediaUrl} startMs={nextClip.startMs ?? 0} />
              ) : null}
            </>
          ) : (
            <Image
              source={{ uri: clip.mediaUrl }}
              style={{ width: '100%', height: '100%', backgroundColor: '#101312' }}
              contentFit="cover"
            />
          )}

          {commentsMode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close comments"
              onPress={closeComments}
              style={{ position: 'absolute', top: 0, right: RAIL_HIT + 16, bottom: drawerH, left: 0 }}
            />
          ) : kind === 'wave' ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy('wave.prev')}
                delayLongPress={180}
                onLongPress={() => {
                  holdingRef.current = true;
                  paused.current = true;
                }}
                onPressOut={() => {
                  holdingRef.current = false;
                  paused.current = pickerOpen;
                }}
                onPress={goPrevClip}
                style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '33%' }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="React"
                delayLongPress={180}
                onLongPress={() => {
                  holdingRef.current = true;
                  paused.current = true;
                }}
                onPressOut={() => {
                  holdingRef.current = false;
                  paused.current = pickerOpen;
                }}
                onPress={() => {
                  const now = Date.now();
                  if (now - lastTap.current < 280) {
                    applyReaction(lastReaction);
                  }
                  lastTap.current = now;
                }}
                style={{ position: 'absolute', top: 0, bottom: 0, left: '33%', width: '34%' }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy('wave.next')}
                delayLongPress={180}
                onLongPress={() => {
                  holdingRef.current = true;
                  paused.current = true;
                }}
                onPressOut={() => {
                  holdingRef.current = false;
                  paused.current = pickerOpen;
                }}
                onPress={goNextClip}
                style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '33%' }}
              />
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pause or play"
              onPress={() => {
                setRoundPaused((value) => {
                  const next = !value;
                  setPauseFlash(next ? 'pause' : 'play');
                  return next;
                });
              }}
              style={{ position: 'absolute', top: 0, right: RAIL_HIT + 16, bottom: 0, left: 0 }}
            />
          )}

          {kind === 'wave' ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: topPad,
                right: 0,
                left: 0,
                height: 3,
                paddingHorizontal: 8,
                flexDirection: 'row',
                gap: 3,
                zIndex: 3,
              }}>
              {Array.from({ length: storyCount }).map((_, storyAt) => (
                <View
                  key={`${clip.authorId}-${storyAt}`}
                  style={{
                    flex: 1,
                    height: 2,
                    borderRadius: 1,
                    backgroundColor: 'rgba(255,255,255,0.28)',
                    overflow: 'hidden',
                  }}>
                  <View
                    style={{
                      width: `${storyAt < storyProgressIndex ? 100 : storyAt === storyProgressIndex ? Math.round(progress * 100) : 0}%`,
                      height: '100%',
                      backgroundColor: '#fff',
                    }}
                  />
                </View>
              ))}
            </View>
          ) : null}

          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              left: 0,
              paddingTop: commentsMode ? 8 : topPad + (kind === 'wave' ? 10 : 0),
              paddingHorizontal: 12,
            }}>
            <View className="flex-row items-center">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={commentsMode ? 'Close comments' : clip.kind === 'wave' ? copy('wave.close') : 'Close'}
                onPress={requestClose}
                hitSlop={8}
                style={{ minWidth: RAIL_HIT, minHeight: RAIL_HIT, justifyContent: 'center' }}>
                <AppText className="text-[22px] font-bold" style={{ color: '#fff' }}>
                  ×
                </AppText>
              </Pressable>
              <Avatar uri={clip.authorAvatar} name={clip.authorName} size={36} />
              <View className="ml-2 min-w-0 flex-1">
                <AppText className="text-[14px] font-bold" style={{ color: '#fff' }} numberOfLines={1}>
                  {clip.authorName}
                </AppText>
                <AppText className="text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {formatFeedTime(clip.createdAt)}
                </AppText>
              </View>
              {origin ? (
                <View className="mr-1 rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(16,19,18,0.55)' }}>
                  <AppText className="text-[11px] font-bold" style={{ color: '#fff' }} numberOfLines={1}>
                    {origin.title}
                  </AppText>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More"
                onPress={() => setSheet('more')}
                style={{ minWidth: RAIL_HIT, minHeight: RAIL_HIT, alignItems: 'center', justifyContent: 'center' }}>
                <Glyph name={GLYPH.more} color="#fff" size={22} />
              </Pressable>
            </View>
          </View>

          <ClipSocialRail
            key={clip.id}
            clip={clip}
            currentUserId={user?.id}
            lastReaction={lastReaction}
            pickerOpen={pickerOpen}
            float={float}
            insetsBottom={railPad}
            persistReact={persistReact}
            onComments={openCommentsMode}
            onLongReact={() => setPickerOpen(true)}
            onPickReact={applyReaction}
            onClosePicker={() => setPickerOpen(false)}
            muted={muted}
            onMute={() => setMuted((value) => !value)}
            onShare={() => setSheet('share')}
            railHot={railHot}
            onRailHot={setRailHot}
          />

          {captionOpen ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Collapse caption"
              onPress={() => setCaptionOpen(false)}
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                backgroundColor: 'rgba(16,19,18,0.35)',
              }}
            />
          ) : null}

          {clip.caption ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={captionOpen ? 'Collapse caption' : 'Caption'}
              onPress={() => {
                if (captionOverflow || captionOpen) {
                  setCaptionOpen((open) => !open);
                }
              }}
              style={{
                position: 'absolute',
                left: 16,
                right: 12 + RAIL_HIT * 2 + 16,
                bottom: railPad + 12,
              }}>
              <AppText
                className="text-[15px] leading-5"
                style={{ position: 'absolute', opacity: 0, left: 0, right: 0 }}
                onTextLayout={(event) => {
                  setCaptionOverflow(event.nativeEvent.lines.length > 2);
                }}>
                {clip.caption}
              </AppText>
              <AppText
                className="text-[15px] leading-5"
                style={{ color: '#fff' }}
                numberOfLines={captionOpen ? undefined : 2}
                ellipsizeMode="tail">
                {clip.caption}
              </AppText>
              {captionOverflow && !captionOpen ? (
                <AppText className="mt-0.5 text-[13px] font-bold" style={{ color: '#fff' }}>
                  {copy('clip.seeMore')}
                </AppText>
              ) : null}
            </Pressable>
          ) : null}

          {pauseFlash ? (
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
              <Glyph name={pauseFlash === 'pause' ? GLYPH.pause : GLYPH.play} color="#fff" size={72} />
            </View>
          ) : null}

          {clip.isOwn && kind === 'wave' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy('wave.add')}
              onPress={() => (onAddWave ? onAddWave() : startFreshWaveCapture(router))}
              style={{
                position: 'absolute',
                left: 16,
                bottom: railPad + RAIL_HIT + 20,
                minHeight: 44,
                paddingHorizontal: 14,
                borderRadius: 22,
                backgroundColor: 'rgba(16,19,18,0.55)',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                zIndex: 5,
              }}>
              <Glyph name={GLYPH.camera} color="#fff" size={18} />
              <AppText className="text-[14px] font-bold" style={{ color: '#fff' }}>
                {copy('wave.add')}
              </AppText>
            </Pressable>
          ) : null}

          {kind === 'round' && !commentsMode ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: 12,
              left: 12,
              bottom: railPad,
              height: 3,
              borderRadius: 2,
              backgroundColor: 'rgba(255,255,255,0.28)',
              overflow: 'hidden',
            }}>
            <View
              style={{
                width: `${Math.round((clip.mediaType === 'video' ? progress : 1) * 100)}%`,
                height: '100%',
                backgroundColor: '#fff',
              }}
            />
          </View>
          ) : null}
          {promptShare && canOfferShareToFeed(clip) && !commentsMode ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPromptShare(false);
                setSheet('shareFeed');
              }}
              style={{
                position: 'absolute',
                left: 16,
                right: 16,
                bottom: railPad + 32,
                minHeight: 44,
                borderRadius: 18,
                backgroundColor: 'rgba(16,19,18,0.88)',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 14,
              }}>
              <AppText className="text-[14px] font-bold" style={{ color: '#fff' }}>
                {copy('round.sharePrompt')}
              </AppText>
            </Pressable>
          ) : null}
          {commentsMode ? (
            <GestureDetector gesture={commentsPan}>
              <View
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: drawerLift,
                  left: 0,
                  height: drawerH,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  overflow: 'hidden',
                  backgroundColor: 'rgba(16,19,18,0.58)',
                  ...(Platform.OS === 'web'
                    ? { backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }
                    : null),
                  zIndex: 6,
                }}>
                <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 2 }}>
                  <View
                    style={{
                      width: 36,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: 'rgba(255,255,255,0.45)',
                    }}
                  />
                </View>
                <ClipCommentsPane
                  clip={clip}
                  currentUserId={user?.id}
                  avatarUrl={profile?.avatar_url}
                  displayName={profile?.display_name ?? profile?.username}
                  keyboardInset={Math.max(0, keyboardPad - drawerLift)}
                  onClose={closeComments}
                  onScrollOffset={(offset) => {
                    commentsScrollY.current = offset;
                  }}
                  onCloseFromTop={closeComments}
                />
              </View>
            </GestureDetector>
          ) : null}
          </Animated.View>
      </GestureDetector>
      </View>

      <ClipSheets
        key={`${clip.id}-sheets`}
        clip={clip}
        sheet={sheet}
        captionDraft={captionDraft}
        onCaptionDraft={setCaptionDraft}
        onOpenSheet={setSheet}
        onCloseSheet={() => setSheet(null)}
        onClosePlayer={onClose}
        onCreateWave={() =>
          startClipRepostCapture({ push: (href) => router.push(href) }, 'wave', {
            uri: clip.mediaUrl,
            mediaType: clip.mediaType,
          })
        }
        onCreateRound={() =>
          startClipRepostCapture({ push: (href) => router.push(href) }, 'round', {
            uri: clip.mediaUrl,
            mediaType: clip.mediaType,
          })
        }
      />
    </Animated.View>
    </WatchSurface>
  );
}

function ClipSocialRail({
  clip,
  currentUserId,
  lastReaction,
  pickerOpen,
  float,
  insetsBottom,
  persistReact,
  onComments,
  onLongReact,
  onPickReact,
  onClosePicker,
  muted,
  onMute,
  onShare,
  railHot,
  onRailHot,
}: {
  clip: ClipPlayItem;
  currentUserId?: string;
  lastReaction: ClipReactionType;
  pickerOpen: boolean;
  float: { emoji: string; key: number } | null;
  insetsBottom: number;
  persistReact: { current: (type: ClipReactionType) => void };
  onComments: () => void;
  onLongReact: () => void;
  onPickReact: (type: ClipReactionType) => void;
  onClosePicker: () => void;
  muted: boolean;
  onMute: () => void;
  onShare: () => void;
  railHot: boolean;
  onRailHot: (hot: boolean) => void;
}) {
  const social = useClipSocial({
    kind: clip.kind === 'round' ? 'reel' : 'story',
    clipId: clip.id,
    postId: clip.postId,
    mediaUrl: clip.mediaUrl,
    caption: clip.caption,
    challengeId: clip.challengeId,
    type: clip.kind,
  });
  const counts = clipSocialCounts(social.post);
  const mine = userReaction(social.post?.reactions, currentUserId);
  const mineType = mine ? asClipReactionType(mine.reaction_type) : null;
  const iCommented = Boolean(
    currentUserId && social.post?.comments?.some((row) => row.author_id === currentUserId),
  );
  const iShared = Boolean(currentUserId && social.shares.some((row) => row.author_id === currentUserId));
  persistReact.current = (type) => {
    void social.onReact(type);
  };
  const lit = railHot || pickerOpen ? 1 : RAIL_IDLE;
  const fill = THEME.accentBright;

  function fire(type: ClipReactionType) {
    onPickReact(type);
  }

  return (
    <View
      pointerEvents="box-none"
      {...(Platform.OS === 'web'
        ? {
            onPointerEnter: () => onRailHot(true),
            onPointerLeave: () => onRailHot(false),
          }
        : null)}
      style={{
        position: 'absolute',
        right: 12,
        bottom: insetsBottom + 12,
        alignItems: 'flex-end',
        gap: 6,
        opacity: lit,
        zIndex: 8,
      }}>
      <View style={{ minWidth: RAIL_HIT, minHeight: RAIL_HIT, alignItems: 'center', justifyContent: 'center' }}>
        {pickerOpen ? (
          <View
            pointerEvents="auto"
            style={{
              position: 'absolute',
              right: 0,
              bottom: RAIL_HIT + 6,
              backgroundColor: 'rgba(16,19,18,0.28)',
              borderRadius: 18,
              paddingVertical: 4,
              zIndex: 4,
            }}>
            {CLIP_REACTIONS.map((row) => (
              <Pressable
                key={row.type}
                accessibilityRole="button"
                accessibilityLabel={row.label}
                onPress={() => fire(row.type)}
                style={{
                  minWidth: RAIL_HIT,
                  minHeight: RAIL_HIT,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <AppText className="text-[22px]">{row.emoji}</AppText>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close reactions"
              onPress={onClosePicker}
              style={{ minHeight: 36, alignItems: 'center', justifyContent: 'center' }}>
              <AppText className="text-[11px] font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>
                ×
              </AppText>
            </Pressable>
          </View>
        ) : null}
        {float ? <FloatEmoji emoji={float.emoji} token={float.key} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reaction"
          onPress={() => fire(mineType ?? lastReaction)}
          onPressIn={() => onRailHot(true)}
          onPressOut={() => onRailHot(false)}
          onLongPress={onLongReact}
          delayLongPress={280}
          style={{ minWidth: RAIL_HIT, minHeight: RAIL_HIT, alignItems: 'center', justifyContent: 'center' }}>
          <AppText className="text-[28px]">{mineType ? clipReactionEmoji(mineType) : '♡'}</AppText>
          <AppText
            className="text-[11px] font-bold"
            style={{ color: mineType ? fill : '#fff' }}>
            {counts.reactions}
          </AppText>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Comment"
        onPress={onComments}
        onPressIn={() => onRailHot(true)}
        onPressOut={() => onRailHot(false)}
        style={{ minWidth: RAIL_HIT, minHeight: RAIL_HIT, alignItems: 'center', justifyContent: 'center' }}>
        <Glyph name={GLYPH.reply} color={iCommented ? fill : '#fff'} size={26} />
        <AppText className="text-[11px] font-bold" style={{ color: iCommented ? fill : '#fff' }}>
          {counts.comments}
        </AppText>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Unmute' : 'Mute'}
          onPress={onMute}
          onPressIn={() => onRailHot(true)}
          onPressOut={() => onRailHot(false)}
          style={{ minWidth: RAIL_HIT, minHeight: RAIL_HIT, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name={muted ? GLYPH.mute : GLYPH.unmute} color="#fff" size={24} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share"
          onPress={onShare}
          onPressIn={() => onRailHot(true)}
          onPressOut={() => onRailHot(false)}
          style={{ minWidth: RAIL_HIT, minHeight: RAIL_HIT, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name={GLYPH.share} color={iShared ? fill : '#fff'} size={26} />
          <AppText className="text-[11px] font-bold" style={{ color: iShared ? fill : '#fff' }}>
            {social.shareCount}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function FloatEmoji({ emoji, token }: { emoji: string; token: number }) {
  const y = useRef(new RNAnimated.Value(0)).current;
  const opacity = useRef(new RNAnimated.Value(1)).current;
  useEffect(() => {
    y.setValue(0);
    opacity.setValue(1);
    RNAnimated.parallel([
      RNAnimated.timing(y, { toValue: -56, duration: 1200, useNativeDriver: true }),
      RNAnimated.timing(opacity, { toValue: 0, duration: 1200, useNativeDriver: true }),
    ]).start();
  }, [opacity, token, y]);
  return (
    <RNAnimated.View
      pointerEvents="none"
      style={{ position: 'absolute', transform: [{ translateY: y }], opacity }}>
      <AppText className="text-[32px]">{emoji}</AppText>
    </RNAnimated.View>
  );
}

function ClipCommentsPane({
  clip,
  currentUserId,
  avatarUrl,
  displayName,
  keyboardInset = 0,
  onClose,
  onScrollOffset,
  onCloseFromTop,
}: {
  clip: ClipPlayItem;
  currentUserId?: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  keyboardInset?: number;
  onClose?: () => void;
  onScrollOffset?: (offset: number) => void;
  onCloseFromTop?: () => void;
}) {
  const social = useClipSocial({
    kind: clip.kind === 'round' ? 'reel' : 'story',
    clipId: clip.id,
    postId: clip.postId,
    mediaUrl: clip.mediaUrl,
    caption: clip.caption,
    challengeId: clip.challengeId,
    type: clip.kind,
  });
  const report = useReportPost();
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  return (
    <>
    <WaveRoundCommentsFeed
      comments={social.post?.comments ?? []}
      currentUserId={currentUserId}
      avatarUrl={avatarUrl}
      displayName={displayName}
      submitting={social.commenting}
      audience={clip.audience ?? 'public'}
      audienceUserIds={clip.audienceUserIds ?? []}
      keyboardInset={keyboardInset}
      onSend={(content, parentId, mentionedUserIds) =>
        social.onComment(content, parentId, mentionedUserIds)
      }
      onReact={(commentId, type) => void social.onReact(type, commentId)}
      onReport={(commentId) => {
        setReportCommentId(commentId);
      }}
      onClose={onClose}
      onScrollOffset={onScrollOffset}
      onCloseFromTop={onCloseFromTop}
    />
    <ChromeOverlay visible={Boolean(reportCommentId)} onClose={() => setReportCommentId(null)} dim zIndex={50}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 20,
        }}>
        <AppText className="text-[15px] font-extrabold text-charcoal">Report comment</AppText>
        {COMMENT_REPORT_REASONS.map((row) => (
          <MoreRow
            key={row.value}
            label={row.label}
            onPress={() => {
              const postId = social.post?.id ?? clip.postId;
              if (!postId) {
                setReportCommentId(null);
                return;
              }
              void report
                .mutateAsync({ postId, reason: row.value })
                .then(() => setReportCommentId(null))
                .catch((error) => Alert.alert('Couldn’t report that', getErrorMessage(error)));
            }}
          />
        ))}
      </View>
    </ChromeOverlay>
    </>
  );
}

function PreloadClip({ uri, startMs }: { uri: string; startMs: number }) {
  useVideoPlayer(uri, (instance) => {
    instance.muted = true;
    instance.currentTime = Math.max(startMs, 0) / 1000;
    instance.pause();
  });
  return null;
}

function ClipSheets({
  clip,
  sheet,
  captionDraft,
  onCaptionDraft,
  onOpenSheet,
  onCloseSheet,
  onClosePlayer,
  onCreateWave,
  onCreateRound,
}: {
  clip: ClipPlayItem;
  sheet: ClipSheet;
  captionDraft: string;
  onCaptionDraft: (value: string) => void;
  onOpenSheet: (next: NonNullable<ClipSheet>) => void;
  onCloseSheet: () => void;
  onClosePlayer: () => void;
  onCreateWave: () => void;
  onCreateRound: () => void;
}) {
  const social = useClipSocial({
    kind: clip.kind === 'round' ? 'reel' : 'story',
    clipId: clip.id,
    postId: clip.postId,
    mediaUrl: clip.mediaUrl,
    caption: clip.caption,
    challengeId: clip.challengeId,
    type: clip.kind,
  });
  const queryClient = useQueryClient();
  const friends = useFriends();
  const share = useShareStory();
  const report = useReportPost();
  const [dmNote, setDmNote] = useState('');
  const [dmFriendId, setDmFriendId] = useState<string | null>(null);
  const url = clip.kind === 'round' ? roundShareUrl(clip.id) : storyShareUrl(clip.id);
  const shareMax = Math.round(Dimensions.get('window').height * 0.5);

  return (
    <>
      <ChromeOverlay visible={sheet === 'share'} onClose={onCloseSheet} dim zIndex={40}>
        <View
          style={{
            backgroundColor: THEME.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 20,
            maxHeight: shareMax,
          }}>
          <AppText className="text-[15px] font-extrabold text-charcoal">Share</AppText>
          <MoreRow label={copy('clip.repost')} onPress={() => onOpenSheet('shareRepost')} />
          <MoreRow
            label={copy('clip.copyLink')}
            onPress={() => {
              void Clipboard.setStringAsync(url);
              onCloseSheet();
            }}
          />
          <MoreRow
            label={copy('clip.message')}
            onPress={() => {
              setDmFriendId(null);
              setDmNote('');
              onOpenSheet('shareMessage');
            }}
          />
        </View>
      </ChromeOverlay>

      <ChromeOverlay visible={sheet === 'shareRepost'} onClose={onCloseSheet} dim zIndex={40}>
        <View
          style={{
            backgroundColor: THEME.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 20,
            maxHeight: shareMax,
          }}>
          <AppText className="text-[15px] font-extrabold text-charcoal">{copy('clip.repost')}</AppText>
          {canOfferShareToFeed(clip) ? (
            <MoreRow label={copy('clip.repostFeed')} onPress={() => onOpenSheet('shareFeed')} />
          ) : null}
          <MoreRow
            label={copy('clip.repostWave')}
            onPress={() => {
              onCloseSheet();
              onCreateWave();
            }}
          />
          <MoreRow
            label={copy('clip.repostRound')}
            onPress={() => {
              onCloseSheet();
              onCreateRound();
            }}
          />
        </View>
      </ChromeOverlay>

      <ChromeOverlay visible={sheet === 'shareMessage'} onClose={onCloseSheet} dim zIndex={40}>
        <View
          style={{
            backgroundColor: THEME.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 20,
            maxHeight: shareMax,
          }}>
          <AppText className="text-[15px] font-extrabold text-charcoal">{copy('clip.message')}</AppText>
          <ScrollView style={{ maxHeight: Math.max(120, shareMax - 180) }} keyboardShouldPersistTaps="handled">
            {(friends.data ?? []).length === 0 ? (
              <AppText className="mt-2 text-[13px] text-muted">Add friends first.</AppText>
            ) : (
              (friends.data ?? []).map((row) => {
                const id = row.profile?.id;
                if (!id) {
                  return null;
                }
                const name = personDisplayName(row.profile);
                const selected = dmFriendId === id;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    onPress={() => setDmFriendId(id)}
                    style={{ minHeight: 40, justifyContent: 'center' }}>
                    <AppText
                      className="text-[15px] font-semibold"
                      style={{ color: selected ? THEME.accent : THEME.ink }}>
                      {name}
                    </AppText>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
          <TextInput
            value={dmNote}
            onChangeText={setDmNote}
            placeholder={copy('clip.shareNote')}
            placeholderTextColor={THEME.muted}
            accessibilityLabel={copy('clip.shareNote')}
            style={{
              minHeight: 40,
              marginTop: 8,
              borderRadius: 14,
              paddingHorizontal: 12,
              color: THEME.ink,
              backgroundColor: THEME.bg,
              fontSize: 14,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy('clip.commentSend')}
            disabled={!dmFriendId || share.isPending}
            onPress={() => {
              if (!dmFriendId) {
                return;
              }
              share.mutate(
                { storyId: clip.id, friendId: dmFriendId, url, note: dmNote },
                {
                  onSuccess: onCloseSheet,
                  onError: (error) => Alert.alert('Couldn’t send that', getErrorMessage(error)),
                },
              );
            }}
            style={{
              minHeight: 44,
              marginTop: 8,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: THEME.primary,
              opacity: dmFriendId && !share.isPending ? 1 : 0.4,
            }}>
            <AppText className="text-[15px] font-extrabold" style={{ color: '#fff' }}>
              {copy('clip.commentSend')}
            </AppText>
          </Pressable>
        </View>
      </ChromeOverlay>

      <ChromeOverlay visible={sheet === 'more'} onClose={onCloseSheet} dim zIndex={40}>
        <View
          style={{
            backgroundColor: THEME.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 20,
          }}>
          {clip.isOwn ? (
            <>
              <MoreRow
                label="Edit"
                onPress={() => {
                  onCaptionDraft(clip.caption ?? '');
                  onOpenSheet('caption');
                }}
              />
              <MoreRow
                label="Download"
                onPress={() => {
                  void downloadClipMedia(clip.mediaUrl)
                    .then(onCloseSheet)
                    .catch((error) => Alert.alert('Couldn’t save that', getErrorMessage(error)));
                }}
              />
              <MoreRow label="Delete" onPress={() => onOpenSheet('delete')} />
            </>
          ) : null}
          <MoreRow
            label="Report"
            onPress={() => {
              const postId = social.post?.id ?? clip.postId;
              if (!postId) {
                onCloseSheet();
                return;
              }
              void report
                .mutateAsync({ postId, reason: 'clip' })
                .then(onCloseSheet)
                .catch((error) => Alert.alert('Couldn’t report that', getErrorMessage(error)));
            }}
          />
        </View>
      </ChromeOverlay>

      <ChromeOverlay visible={sheet === 'caption'} onClose={onCloseSheet} dim zIndex={40}>
        <View
          style={{
            backgroundColor: THEME.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            padding: 16,
          }}>
          <Input label="Caption" value={captionDraft} onChangeText={onCaptionDraft} maxLength={140} />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const postId = social.post?.id ?? clip.postId;
              if (postId) {
                void import('@/lib/supabase').then(({ supabase }) =>
                  supabase.from('posts').update({ content: captionDraft.trim() || null }).eq('id', postId),
                );
              }
              if (clip.kind === 'wave') {
                void import('@/lib/supabase').then(({ supabase }) =>
                  supabase.from('stories').update({ caption: captionDraft.trim() || null }).eq('id', clip.id),
                );
              } else {
                void import('@/lib/supabase').then(({ supabase }) =>
                  supabase.from('reels').update({ caption: captionDraft.trim() || null }).eq('id', clip.id),
                );
              }
              onCloseSheet();
            }}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-[15px] font-bold text-charcoal">Save</AppText>
          </Pressable>
        </View>
      </ChromeOverlay>
      <ChromeOverlay visible={sheet === 'delete'} onClose={onCloseSheet} dim zIndex={45}>
        <View
          style={{
            backgroundColor: THEME.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 20,
          }}>
          <AppText className="text-[16px] font-extrabold text-charcoal">Remove this clip?</AppText>
          <AppText className="mt-2 text-[14px] text-muted">
            It leaves your rails. Other people will see that this clip isn’t available. Comments stay.
          </AppText>
          <MoreRow
            label="Remove"
            onPress={() => {
              const postId = social.post?.id ?? clip.postId;
              if (!postId) {
                onCloseSheet();
                return;
              }
              void setPostHiddenFromRail(postId, true)
                .then(() => {
                  void queryClient.invalidateQueries({ queryKey: ['stories'] });
                  void queryClient.invalidateQueries({ queryKey: ['reels'] });
                  void queryClient.invalidateQueries({ queryKey: ['story-rail-filters'] });
                  onCloseSheet();
                  onClosePlayer();
                })
                .catch((error) => Alert.alert('Couldn’t remove that', getErrorMessage(error)));
            }}
          />
          <MoreRow label="Cancel" onPress={onCloseSheet} />
        </View>
      </ChromeOverlay>
      <RoundShareComposer
        visible={sheet === 'shareFeed'}
        target={
          clip.postId
            ? {
                kind: clip.kind,
                reelId: clip.kind === 'round' ? clip.id : undefined,
                storyId: clip.kind === 'wave' ? clip.id : undefined,
                postId: clip.postId,
                mediaUrl: clip.mediaUrl,
                coverUrl: clip.coverUrl,
                caption: clip.caption,
                authorId: clip.authorId,
                authorName: clip.authorName,
                username: clip.username,
                avatarUrl: clip.authorAvatar,
                createdAt: clip.createdAt,
                audience: clip.audience,
                audienceUserIds: clip.audienceUserIds,
                challengeId: clip.challengeId,
                privacyMode: clip.privacyMode,
              }
            : null
        }
        onClose={onCloseSheet}
      />
    </>
  );
}

function MoreRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText className="text-[15px] font-semibold text-charcoal">{label}</AppText>
    </Pressable>
  );
}

function ClipVideo({
  uri,
  poster,
  startMs,
  durationMs,
  loop,
  muted,
  pausedRef,
  onEnded,
  onProgress,
}: {
  uri: string;
  poster?: string | null;
  startMs: number;
  durationMs: number;
  loop: boolean;
  muted: boolean;
  pausedRef: { current: boolean };
  onEnded?: () => void;
  onProgress: (value: number) => void;
}) {
  if (Platform.OS === 'web') {
    return (
      <WebClipVideo
        uri={uri}
        poster={poster}
        startMs={startMs}
        durationMs={durationMs}
        loop={loop}
        muted={muted}
        pausedRef={pausedRef}
        onEnded={onEnded}
        onProgress={onProgress}
      />
    );
  }
  return (
    <NativeClipVideo
      uri={uri}
      startMs={startMs}
      durationMs={durationMs}
      loop={loop}
      muted={muted}
      pausedRef={pausedRef}
      onEnded={onEnded}
      onProgress={onProgress}
    />
  );
}

function NativeClipVideo({
  uri,
  startMs,
  durationMs,
  loop,
  muted,
  pausedRef,
  onEnded,
  onProgress,
}: {
  uri: string;
  startMs: number;
  durationMs: number;
  loop: boolean;
  muted: boolean;
  pausedRef: { current: boolean };
  onEnded?: () => void;
  onProgress: (value: number) => void;
}) {
  const startSec = Math.max(startMs, 0) / 1000;
  const endSec = startSec + Math.max(durationMs || WAVE_CLIP_MS, 400) / 1000;
  const endedRef = useRef(false);
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = loop;
    instance.muted = muted;
    instance.currentTime = startSec;
    instance.play();
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    player.loop = loop;
  }, [loop, player]);

  useEventListener(player, 'playToEnd', () => {
    if (loopRef.current || endedRef.current) {
      return;
    }
    endedRef.current = true;
    onEnded?.();
  });

  useEffect(() => {
    return registerNativeCameraStop(() => {
      try {
        player.pause();
      } catch {
        // Player already released.
      }
    });
  }, [player]);

  useEffect(() => {
    endedRef.current = false;
    player.currentTime = startSec;
    player.play();
    const id = setInterval(() => {
      const t = player.currentTime;
      const span = Math.max(endSec - startSec, 0.4);
      onProgress(Math.max(0, Math.min(1, (t - startSec) / span)));
      if (pausedRef.current) {
        player.pause();
      } else if (!player.playing) {
        player.play();
      }
      if (!loopRef.current && !endedRef.current && t >= endSec - 0.05) {
        endedRef.current = true;
        player.pause();
        onEnded?.();
      }
    }, 120);
    return () => {
      clearInterval(id);
      try {
        player.pause();
      } catch {
        // Player already released.
      }
    };
  }, [endSec, onEnded, onProgress, pausedRef, player, startSec]);

  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
      contentFit="cover"
      nativeControls={false}
      pointerEvents="none"
    />
  );
}

function WebClipVideo({
  uri,
  poster,
  startMs,
  durationMs,
  loop,
  muted,
  pausedRef,
  onEnded,
  onProgress,
}: {
  uri: string;
  poster?: string | null;
  startMs: number;
  durationMs: number;
  loop: boolean;
  muted: boolean;
  pausedRef: { current: boolean };
  onEnded?: () => void;
  onProgress: (value: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const endedRef = useRef(false);
  const loopRef = useRef(loop);
  const seekKey = useRef('');
  loopRef.current = loop;
  const [ready, setReady] = useState(false);
  const startSec = Math.max(startMs, 0) / 1000;
  const endSec = startSec + Math.max(durationMs || WAVE_CLIP_MS, 400) / 1000;

  const detach = useCallback((node: HTMLVideoElement | null) => {
    if (!node) {
      return;
    }
    node.removeEventListener('webkitbeginfullscreen', preventWebVideoFullscreen);
    node.removeEventListener('webkitendfullscreen', preventWebVideoFullscreen);
    stopMedia({ video: node });
    unwatchLiveMedia({ video: node });
  }, []);

  const attach = useCallback(
    (node: HTMLVideoElement | null) => {
      if (videoRef.current && videoRef.current !== node) {
        detach(videoRef.current);
      }
      videoRef.current = node;
      applyWebVideoLock(node, poster);
      if (!node) {
        return;
      }
      watchLiveMedia({ video: node });
      node.addEventListener('webkitbeginfullscreen', preventWebVideoFullscreen);
      node.addEventListener('webkitendfullscreen', preventWebVideoFullscreen);
    },
    [detach, poster],
  );

  useEffect(() => {
    return () => {
      detach(videoRef.current);
      videoRef.current = null;
    };
  }, [detach]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    const restore = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      const node = videoRef.current;
      if (!node || node.getAttribute('src') || !uri) {
        return;
      }
      node.src = uri;
      applyWebVideoLock(node, poster);
      watchLiveMedia({ video: node });
      endedRef.current = false;
      if (!pausedRef.current) {
        void node.play().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', restore);
    return () => document.removeEventListener('visibilitychange', restore);
  }, [pausedRef, poster, uri]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) {
      return;
    }
    node.loop = loop;
    node.muted = muted;
  }, [loop, muted]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) {
      return;
    }
    applyWebVideoLock(node, poster);
    node.loop = loopRef.current;
    const token = `${uri}:${startSec}`;
    if (seekKey.current !== token) {
      seekKey.current = token;
      endedRef.current = false;
      node.currentTime = startSec;
    }
    const play = () => {
      if (pausedRef.current) {
        node.pause();
        return;
      }
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (!node.getAttribute('src') && uri) {
        node.src = uri;
        applyWebVideoLock(node, poster);
        watchLiveMedia({ video: node });
      }
      void node.play().catch(() => undefined);
    };
    const onTime = () => {
      const span = Math.max(endSec - startSec, 0.4);
      onProgress(Math.max(0, Math.min(1, (node.currentTime - startSec) / span)));
      if (!loopRef.current && !endedRef.current && node.currentTime >= endSec - 0.05) {
        endedRef.current = true;
        node.pause();
        onEnded?.();
      }
    };
    const onReady = () => {
      setReady(true);
      play();
    };
    const onEndedNative = () => {
      if (loopRef.current || endedRef.current) {
        return;
      }
      endedRef.current = true;
      onEnded?.();
    };
    node.addEventListener('loadeddata', onReady);
    node.addEventListener('playing', onReady);
    node.addEventListener('timeupdate', onTime);
    node.addEventListener('ended', onEndedNative);
    play();
    const id = window.setInterval(() => {
      if (pausedRef.current || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) {
        node.pause();
      } else if (node.paused) {
        play();
      }
      onTime();
    }, 120);
    return () => {
      window.clearInterval(id);
      node.removeEventListener('loadeddata', onReady);
      node.removeEventListener('playing', onReady);
      node.removeEventListener('timeupdate', onTime);
      node.removeEventListener('ended', onEndedNative);
      node.pause();
    };
  }, [endSec, onEnded, onProgress, pausedRef, poster, startSec, uri]);

  return (
    <View style={{ width: '100%', height: '100%', backgroundColor: '#101312' }}>
      {poster && !ready ? (
        <Image
          source={{ uri: poster }}
          style={{ position: 'absolute', width: '100%', height: '100%' }}
          contentFit="cover"
        />
      ) : null}
      {createElement('video', {
        ref: attach,
        src: uri,
        poster: poster ?? undefined,
        autoPlay: true,
        muted,
        loop,
        ...WEB_VIDEO_LOCK,
        style: {
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          backgroundColor: 'transparent',
          pointerEvents: 'none',
        },
      })}
    </View>
  );
}
