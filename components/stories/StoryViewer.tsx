import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useEventListener } from 'expo';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClipSocial } from '@/components/feed/ClipSocial';
import { StoryRing } from '@/components/stories/StoryRing';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useClipSocial } from '@/hooks/useClipSocial';
import {
  useFriends,
  useShareStory,
  useViewStory,
} from '@/hooks/useSocial';
import { Button } from '@/components/ui/Button';
import { copy } from '@/lib/copy';
import { openChallengeLobby } from '@/lib/challengeOpen';
import { startFreshWaveCapture } from '@/lib/waveCapture';
import { personDisplayName, storyTimeLeft, type FeedChallengePreview, type StoryGroup } from '@/lib/social';
import { WAVE_CLIP_MS } from '@/lib/waveClips';
import { storyShareUrl } from '@/lib/waveShare';
import { THEME } from '@/lib/theme';
import type { Story } from '@/types/social';
import { getErrorMessage } from '@/utils/errors';

type StoryViewerProps = {
  groups: StoryGroup[];
  startGroupIndex?: number;
  startStoryIndex?: number;
  challenges?: Map<string, FeedChallengePreview>;
  openComments?: boolean;
  onClose: () => void;
};

export function StoryViewer({
  groups,
  startGroupIndex = 0,
  startStoryIndex = 0,
  challenges,
  openComments = false,
  onClose,
}: StoryViewerProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const viewStory = useViewStory();
  const [groupIndex, setGroupIndex] = useState(startGroupIndex);
  const [storyIndex, setStoryIndex] = useState(startStoryIndex);
  const [videoProgress, setVideoProgress] = useState(0);
  const [panel, setPanel] = useState<'comments' | 'share' | null>(null);
  const composerOpen = useRef(false);
  const paused = useRef(false);
  const marked = useRef(new Set<string>());
  const groupsRef = useRef(groups);
  const groupIndexRef = useRef(groupIndex);
  const storyIndexRef = useRef(storyIndex);
  const translateY = useSharedValue(0);

  groupsRef.current = groups;
  groupIndexRef.current = groupIndex;
  storyIndexRef.current = storyIndex;
  paused.current = panel != null || composerOpen.current;

  const group = groups[groupIndex];
  const story = group?.stories[storyIndex];
  const holdMs =
    story?.media_type === 'video'
      ? Math.max(story.clip_duration_ms || WAVE_CLIP_MS, 400)
      : WAVE_CLIP_MS;

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
  }, []);

  const goNextGroup = useCallback(() => {
    const currentGroups = groupsRef.current;
    const currentGroupIndex = groupIndexRef.current;
    if (currentGroupIndex + 1 < currentGroups.length) {
      setGroupIndex(currentGroupIndex + 1);
      setStoryIndex(0);
    }
  }, []);

  const goPrevGroup = useCallback(() => {
    const currentGroupIndex = groupIndexRef.current;
    if (currentGroupIndex > 0) {
      setGroupIndex(currentGroupIndex - 1);
      setStoryIndex(0);
    }
  }, []);

  useEffect(() => {
    setVideoProgress(0);
    setPanel(null);
  }, [story?.id]);

  useEffect(() => {
    if (!story?.id || group?.isOwn) {
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
        .activeOffsetX([-24, 24])
        .activeOffsetY([-24, 24])
        .onUpdate((event) => {
          if (Math.abs(event.translationY) > Math.abs(event.translationX) && event.translationY > 0) {
            translateY.value = event.translationY;
          }
        })
        .onEnd((event) => {
          const absX = Math.abs(event.translationX);
          const absY = Math.abs(event.translationY);
          if (absX > 72 && absX > absY) {
            translateY.value = withTiming(0);
            if (event.translationX < 0) {
              runOnJS(goNextGroup)();
            } else {
              runOnJS(goPrevGroup)();
            }
            return;
          }
          if (event.translationY > 110) {
            runOnJS(onClose)();
            return;
          }
          translateY.value = withTiming(0);
        }),
    [goNextGroup, goPrevGroup, onClose, translateY],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!group || !story?.id) {
    return null;
  }

  const challenge = story.challenge_id ? challenges?.get(story.challenge_id) : undefined;

  return (
    <Animated.View className="flex-1" style={[{ backgroundColor: '#101312' }, sheetStyle]}>
      <View className="flex-1" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }}>
          <View className="flex-row gap-1 px-3">
            {group.stories.map((item, index) => (
              <StoryProgress
                key={item.id}
                active={index === storyIndex}
                filled={index < storyIndex}
                pausedRef={paused}
                durationMs={
                  item.media_type === 'video'
                    ? Math.max(item.clip_duration_ms || WAVE_CLIP_MS, 400)
                    : WAVE_CLIP_MS
                }
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

          <GestureDetector gesture={pan}>
          <View className="relative mt-3 flex-1">
            {story.media_type === 'video' ? (
              <StoryVideo
                key={story.id}
                uri={story.media_url}
                startMs={story.clip_start_ms ?? 0}
                durationMs={holdMs}
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
              style={{ width: '33%' }}
              delayLongPress={160}
              onLongPress={() => {
                paused.current = true;
              }}
              onPressOut={() => {
                paused.current = panel != null || composerOpen.current;
              }}
              onPress={goPrev}
            />
            <Pressable
              accessibilityLabel={copy('wave.next')}
              className="absolute bottom-0 right-0 top-0"
              style={{ width: '33%' }}
              delayLongPress={160}
              onLongPress={() => {
                paused.current = true;
              }}
              onPressOut={() => {
                paused.current = panel != null || composerOpen.current;
              }}
              onPress={goNext}
            />
          </View>
          </GestureDetector>

          {story.caption ? (
            <AppText className="px-4 pt-3 text-[15px] leading-5" style={{ color: '#fff' }}>
              {story.caption}
            </AppText>
          ) : null}
          {challenge ? <ChallengeChip challenge={challenge} onClose={onClose} /> : null}
          {group.isOwn ? (
            <View className="mt-3 px-4">
              <Button
                title={copy('wave.recordAnother')}
                variant="secondary"
                size="lg"
                accessibilityLabel={copy('wave.add')}
                onPress={() => {
                  onClose();
                  startFreshWaveCapture(router);
                }}
              />
            </View>
          ) : null}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{
              backgroundColor: THEME.surface,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: 320,
              marginTop: 12,
            }}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 }}>
              <WavePlaybackSocial
                key={story.id}
                story={story}
                openComments={openComments || panel === 'comments'}
                onComposerFocus={(focused) => {
                  composerOpen.current = focused;
                  paused.current = focused || panel != null;
                }}
                onShare={() => setPanel('share')}
              />
              {panel === 'share' ? <WaveShare storyId={story.id} onClose={() => setPanel(null)} /> : null}
            </ScrollView>
          </KeyboardAvoidingView>
      </View>
    </Animated.View>
  );
}

function WavePlaybackSocial({
  story,
  openComments,
  onComposerFocus,
  onShare,
}: {
  story: Story;
  openComments: boolean;
  onComposerFocus: (focused: boolean) => void;
  onShare: () => void;
}) {
  const { user } = useAuth();
  const social = useClipSocial({
    kind: 'story',
    clipId: story.id,
    postId: story.post_id,
    mediaUrl: story.media_url,
    caption: story.caption,
    challengeId: story.challenge_id,
  });
  return (
    <View className="gap-2">
      <ClipSocial
        showThread
        startComposer={openComments}
        post={social.post}
        currentUserId={user?.id}
        commenting={social.commenting}
        onReact={social.onReact}
        onComment={social.onComment}
        onComposerFocus={onComposerFocus}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share"
        onPress={onShare}
        hitSlop={8}
        style={{ minHeight: 44, justifyContent: 'center' }}>
        <AppText className="text-[13px] font-semibold" style={{ color: THEME.textMuted }}>
          Share
        </AppText>
      </Pressable>
    </View>
  );
}

function WaveShare({ storyId, onClose }: { storyId: string; onClose: () => void }) {
  const friends = useFriends();
  const share = useShareStory();
  const url = storyShareUrl(storyId);
  return (
    <View className="mx-4 mt-2 rounded-2xl px-3 py-3" style={{ backgroundColor: 'rgba(16,19,18,0.92)', maxHeight: 260 }}>
      <View className="flex-row items-center justify-between">
        <AppText className="text-[13px] font-extrabold" style={{ color: '#fff' }}>
          Send in DM
        </AppText>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
          <AppText className="text-[16px] font-bold" style={{ color: '#fff' }}>
            ×
          </AppText>
        </Pressable>
      </View>
      <ScrollView style={{ maxHeight: 200 }} className="mt-2">
        {(friends.data ?? []).length === 0 ? (
          <AppText className="text-[13px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Add friends first.
          </AppText>
        ) : (
          (friends.data ?? []).map((row) => {
            const id = row.profile?.id;
            if (!id) {
              return null;
            }
            const name = personDisplayName(row.profile);
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={`Send to ${name}`}
                onPress={() =>
                  share.mutate(
                    { storyId, friendId: id, url },
                    {
                      onSuccess: onClose,
                      onError: (error) => Alert.alert('Couldn’t send that', getErrorMessage(error)),
                    },
                  )
                }
                className="justify-center"
                style={{ minHeight: 44 }}>
                <AppText className="text-[15px] font-semibold" style={{ color: '#fff' }}>
                  {name}
                </AppText>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
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
        if (challenge.id) {
          openChallengeLobby(router, { id: challenge.id, snapshot: challenge, returnTo: 'feed' });
        }
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
  startMs,
  durationMs,
  pausedRef,
  onEnded,
  onProgress,
}: {
  uri: string;
  startMs: number;
  durationMs: number;
  pausedRef: { current: boolean };
  onEnded: () => void;
  onProgress: (value: number) => void;
}) {
  const startSec = Math.max(startMs, 0) / 1000;
  const endSec = startSec + Math.max(durationMs, 400) / 1000;
  const endedRef = useRef(false);
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.muted = false;
    instance.currentTime = startSec;
    instance.play();
  });

  useEventListener(player, 'playToEnd', () => {
    if (!endedRef.current) {
      endedRef.current = true;
      onEnded();
    }
  });

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
      if (!endedRef.current && t >= endSec - 0.05) {
        endedRef.current = true;
        player.pause();
        onEnded();
      }
    }, 120);
    return () => clearInterval(id);
  }, [endSec, onEnded, onProgress, pausedRef, player, startSec]);

  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%', backgroundColor: '#101312' }}
      contentFit="contain"
      nativeControls={false}
    />
  );
}
