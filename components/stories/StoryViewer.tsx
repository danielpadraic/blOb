import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useEventListener } from 'expo';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StoryRing } from '@/components/stories/StoryRing';
import { AppText } from '@/components/ui/AppText';
import { useViewStory } from '@/hooks/useSocial';
import { copy } from '@/lib/copy';
import { challengeDetailHref } from '@/lib/routes';
import { storyTimeLeft, type FeedChallengePreview, type StoryGroup } from '@/lib/social';
import { THEME } from '@/lib/theme';
import type { Story } from '@/types/social';

const IMAGE_MS = 5000;

type StoryViewerProps = {
  groups: StoryGroup[];
  startGroupIndex?: number;
  startStoryIndex?: number;
  challenges?: Map<string, FeedChallengePreview>;
  onClose: () => void;
};

export function StoryViewer({
  groups,
  startGroupIndex = 0,
  startStoryIndex = 0,
  challenges,
  onClose,
}: StoryViewerProps) {
  const insets = useSafeAreaInsets();
  const viewStory = useViewStory();
  const [groupIndex, setGroupIndex] = useState(startGroupIndex);
  const [storyIndex, setStoryIndex] = useState(startStoryIndex);
  const [videoProgress, setVideoProgress] = useState(0);
  const paused = useRef(false);
  const marked = useRef(new Set<string>());
  const groupsRef = useRef(groups);
  const groupIndexRef = useRef(groupIndex);
  const storyIndexRef = useRef(storyIndex);
  const translateY = useSharedValue(0);

  groupsRef.current = groups;
  groupIndexRef.current = groupIndex;
  storyIndexRef.current = storyIndex;

  const group = groups[groupIndex];
  const story = group?.stories[storyIndex];

  const goNext = useCallback(() => {
    const currentGroups = groupsRef.current;
    const currentGroupIndex = groupIndexRef.current;
    const currentStoryIndex = storyIndexRef.current;
    const current = currentGroups[currentGroupIndex];
    if (!current) {
      onClose();
      return;
    }
    if (currentStoryIndex + 1 < current.stories.length) {
      setStoryIndex(currentStoryIndex + 1);
      return;
    }
    if (currentGroupIndex + 1 < currentGroups.length) {
      setGroupIndex(currentGroupIndex + 1);
      setStoryIndex(0);
      return;
    }
    onClose();
  }, [onClose]);

  const goPrev = useCallback(() => {
    const currentGroups = groupsRef.current;
    const currentGroupIndex = groupIndexRef.current;
    const currentStoryIndex = storyIndexRef.current;
    if (currentStoryIndex > 0) {
      setStoryIndex(currentStoryIndex - 1);
      return;
    }
    if (currentGroupIndex > 0) {
      const prev = currentGroups[currentGroupIndex - 1];
      setGroupIndex(currentGroupIndex - 1);
      setStoryIndex(Math.max((prev?.stories.length ?? 1) - 1, 0));
      return;
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    setVideoProgress(0);
    paused.current = false;
  }, [story?.id]);

  useEffect(() => {
    if (!story || group?.isOwn) {
      return;
    }
    if (marked.current.has(story.id)) {
      return;
    }
    marked.current.add(story.id);
    viewStory.mutate(story.id);
  }, [group?.isOwn, story, viewStory.mutate]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(24)
        .failOffsetX([-28, 28])
        .onUpdate((event) => {
          if (event.translationY > 0) {
            translateY.value = event.translationY;
          }
        })
        .onEnd((event) => {
          if (event.translationY > 110) {
            runOnJS(onClose)();
            return;
          }
          translateY.value = withTiming(0);
        }),
    [onClose, translateY],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!group || !story) {
    return null;
  }

  const challenge = story.challenge_id ? challenges?.get(story.challenge_id) : undefined;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View className="flex-1" style={[{ backgroundColor: '#101312' }, sheetStyle]}>
        <View className="flex-1" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }}>
          <View className="flex-row gap-1 px-3">
            {group.stories.map((item, index) => (
              <StoryProgress
                key={item.id}
                active={index === storyIndex}
                filled={index < storyIndex}
                pausedRef={paused}
                durationMs={IMAGE_MS}
                mediaType={item.media_type}
                videoProgress={index === storyIndex ? videoProgress : 0}
                storyId={item.id}
                onComplete={goNext}
              />
            ))}
          </View>

          <View className="mt-3 flex-row items-center px-4">
            <StoryRing uri={group.avatar} name={group.name} size={36} seen />
            <View className="ml-2 min-w-0 flex-1">
              <AppText className="text-[14px] font-bold" style={{ color: '#fff' }} numberOfLines={1}>
                {group.name}
              </AppText>
              <AppText className="text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {storyTimeLeft(story.expires_at)}
              </AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={copy('wave.close')}>
              <AppText className="text-[22px] font-bold" style={{ color: '#fff' }}>
                ×
              </AppText>
            </Pressable>
          </View>

          <View className="relative mt-3 flex-1">
            {story.media_type === 'video' ? (
              <StoryVideo
                key={story.id}
                uri={story.media_url}
                pausedRef={paused}
                onEnded={goNext}
                onProgress={setVideoProgress}
              />
            ) : (
              <Image
                source={{ uri: story.media_url }}
                style={{ width: '100%', height: '100%', backgroundColor: '#101312' }}
                contentFit="contain"
              />
            )}
            <Pressable
              accessibilityLabel={copy('wave.prev')}
              className="absolute bottom-0 left-0 top-0"
              style={{ width: '32%' }}
              delayLongPress={160}
              onLongPress={() => {
                paused.current = true;
              }}
              onPressOut={() => {
                paused.current = false;
              }}
              onPress={goPrev}
            />
            <Pressable
              accessibilityLabel={copy('wave.next')}
              className="absolute bottom-0 right-0 top-0"
              style={{ width: '68%' }}
              delayLongPress={160}
              onLongPress={() => {
                paused.current = true;
              }}
              onPressOut={() => {
                paused.current = false;
              }}
              onPress={goNext}
            />
          </View>

          {story.caption ? (
            <AppText className="px-4 pt-3 text-[15px] leading-5" style={{ color: '#fff' }}>
              {story.caption}
            </AppText>
          ) : null}
          {challenge ? <ChallengeChip challenge={challenge} onClose={onClose} /> : null}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

function ChallengeChip({
  challenge,
  onClose,
}: {
  challenge: FeedChallengePreview;
  onClose: () => void;
}) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => {
        onClose();
        router.push(challengeDetailHref(challenge.id, 'feed'));
      }}
      className="mx-4 mt-3 self-start rounded-full px-3 py-2"
      style={{ backgroundColor: THEME.accentSoft }}
      accessibilityRole="button"
      accessibilityLabel={`Open challenge ${challenge.title}`}>
      <AppText className="text-[12px] font-bold" style={{ color: THEME.accent }}>
        {challenge.title}
      </AppText>
    </Pressable>
  );
}

function StoryProgress({
  active,
  filled,
  pausedRef,
  durationMs,
  mediaType,
  videoProgress,
  storyId,
  onComplete,
}: {
  active: boolean;
  filled: boolean;
  pausedRef: { current: boolean };
  durationMs: number;
  mediaType: Story['media_type'];
  videoProgress: number;
  storyId: string;
  onComplete: () => void;
}) {
  const progress = useSharedValue(filled ? 1 : 0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (mediaType === 'video') {
      progress.value = filled ? 1 : active ? videoProgress : 0;
      return;
    }
    progress.value = filled ? 1 : 0;
    if (!active) {
      return;
    }
    let remaining = durationMs;
    let last = Date.now();
    let frame = 0;
    const tick = () => {
      const now = Date.now();
      const delta = now - last;
      last = now;
      if (!pausedRef.current) {
        remaining -= delta;
        progress.value = Math.max(0, Math.min(1, 1 - remaining / durationMs));
        if (remaining <= 0) {
          onCompleteRef.current();
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, durationMs, filled, mediaType, pausedRef, progress, storyId, videoProgress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View className="h-[2px] flex-1 overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.28)' }}>
      <Animated.View className="h-full" style={[{ backgroundColor: '#fff' }, fillStyle]} />
    </View>
  );
}

function StoryVideo({
  uri,
  pausedRef,
  onEnded,
  onProgress,
}: {
  uri: string;
  pausedRef: { current: boolean };
  onEnded: () => void;
  onProgress: (value: number) => void;
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.muted = false;
    instance.play();
  });

  useEventListener(player, 'playToEnd', onEnded);

  useEffect(() => {
    const id = setInterval(() => {
      const duration = player.duration;
      if (duration > 0) {
        onProgress(Math.max(0, Math.min(1, player.currentTime / duration)));
      }
      if (pausedRef.current) {
        player.pause();
      } else if (!player.playing) {
        player.play();
      }
    }, 120);
    return () => clearInterval(id);
  }, [onProgress, pausedRef, player]);

  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%', backgroundColor: '#101312' }}
      contentFit="contain"
      nativeControls={false}
    />
  );
}
