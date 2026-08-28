import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
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

import { WaveRoundCommentSheet } from '@/components/clips/WaveRoundCommentSheet';
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
import { useBlockUser, useReportPost } from '@/hooks/usePostModeration';
import { useFriends, useShareStory, useViewStory } from '@/hooks/useSocial';
import { stopAllLiveMedia } from '@/lib/cameraSession';
import { RoundShareComposer } from '@/components/clips/RoundShareComposer';
import { hideAuthorFromMyRail, setPostHiddenFromRail } from '@/lib/clipRail';
import { clipSocialCounts } from '@/lib/clipPost';
import { copy } from '@/lib/copy';
import { canOfferShareToFeed } from '@/lib/roundShare';
import { userReaction } from '@/lib/reactions';
import { personDisplayName, type FeedChallengePreview } from '@/lib/social';
import { THEME } from '@/lib/theme';
import { WAVE_CLIP_MS } from '@/lib/waveClips';
import { roundShareUrl, storyShareUrl } from '@/lib/waveShare';
import type { ReactionType } from '@/lib/types';
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

const EMOJI_ROW: { emoji: string; type: ReactionType }[] = [
  { emoji: '👋', type: 'care' },
  { emoji: '🔥', type: 'fire' },
  { emoji: '💪', type: 'like' },
  { emoji: '😂', type: 'sad' },
  { emoji: '❤️', type: 'love' },
];

type ClipPlayerProps = {
  clips: ClipPlayItem[];
  startIndex?: number;
  autoAdvance?: boolean;
  openComments?: boolean;
  challenges?: Map<string, FeedChallengePreview>;
  sharePrompt?: boolean;
  onClose: () => void;
};

export function ClipPlayer({
  clips,
  startIndex = 0,
  autoAdvance = true,
  openComments = false,
  challenges,
  sharePrompt = false,
  onClose,
}: ClipPlayerProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const watch = useWatchSurface();
  const topPad = Platform.OS === 'web' ? 8 : insets.top + 8;
  const bottomPad = Platform.OS === 'web' ? 8 : Math.max(insets.bottom, 8);
  const watchHeight = watch.height || Dimensions.get('window').height;
  const viewStory = useViewStory();
  const [index, setIndex] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const [sheet, setSheet] = useState<'comments' | 'share' | 'shareFeed' | 'more' | 'caption' | null>(
    openComments ? 'comments' : null,
  );
  const [promptShare, setPromptShare] = useState(sharePrompt);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [burst, setBurst] = useState(0);
  const [floatEmoji, setFloatEmoji] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const paused = useRef(false);
  const sheetRef = useRef(sheet);
  const marked = useRef(new Set<string>());
  const clipsRef = useRef(clips);
  const indexRef = useRef(index);
  const translateY = useSharedValue(0);

  clipsRef.current = clips;
  indexRef.current = index;
  sheetRef.current = sheet;
  paused.current = emojiOpen;

  useEffect(() => {
    if (!toast) {
      return;
    }
    const handle = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(handle);
  }, [toast]);

  const clip = clips[index];

  const goNext = useCallback(() => {
    const current = clipsRef.current;
    const at = indexRef.current;
    if (at + 1 < current.length) {
      setIndex(at + 1);
      return;
    }
    onClose();
  }, [onClose]);

  const goPrev = useCallback(() => {
    const at = indexRef.current;
    if (at > 0) {
      setIndex(at - 1);
    }
  }, []);

  useEffect(() => {
    setProgress(0);
    setBurst(0);
    setFloatEmoji(null);
    setSheet(openComments && index === startIndex ? 'comments' : null);
    setEmojiOpen(false);
    setCaptionDraft(clip?.caption ?? '');
  }, [clip?.id, index, openComments, startIndex]);

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

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-28, 28])
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

  if (!clip) {
    return null;
  }

  const origin = clip.challengeId ? challenges?.get(clip.challengeId) : undefined;

  return (
    <WatchSurface>
      <StatusBar style="light" />
    <Animated.View style={[{ flex: 1, backgroundColor: '#101312' }, sheetStyle]}>
      <GestureDetector gesture={pan}>
        <View style={{ flex: 1 }}>
          {clip.mediaType === 'video' ? (
            <ClipVideo
              key={clip.id}
              uri={clip.mediaUrl}
              startMs={clip.startMs ?? 0}
              durationMs={clip.durationMs}
              loop={!autoAdvance}
              pausedRef={paused}
              onEnded={autoAdvance ? goNext : undefined}
              onProgress={setProgress}
            />
          ) : (
            <Image
              source={{ uri: clip.mediaUrl }}
              style={{ width: '100%', height: '100%', backgroundColor: '#101312' }}
              contentFit="cover"
            />
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Like"
            onPress={() => undefined}
            onLongPress={() => {
              paused.current = true;
              setEmojiOpen(true);
            }}
            delayLongPress={220}
            style={{ position: 'absolute', top: 0, right: 72, bottom: 0, left: 72 }}
          >
            <DoubleTapLike
              onLike={() => {
                setBurst((value) => value + 1);
              }}
            />
          </Pressable>

          {autoAdvance ? (
            <>
              <Pressable
                accessibilityLabel={copy('wave.prev')}
                onPress={goPrev}
                style={{ position: 'absolute', top: 96, bottom: 120, left: 0, width: 56 }}
              />
              <Pressable
                accessibilityLabel={copy('wave.next')}
                onPress={goNext}
                style={{ position: 'absolute', top: 96, bottom: 120, right: 72, width: 56 }}
              />
            </>
          ) : null}

          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              left: 0,
              paddingTop: topPad,
              paddingHorizontal: 12,
            }}>
            <View className="flex-row items-center">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={clip.kind === 'wave' ? copy('wave.close') : 'Close'}
                onPress={onClose}
                hitSlop={8}
                style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
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
                <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(16,19,18,0.55)' }}>
                  <AppText className="text-[11px] font-bold" style={{ color: '#fff' }} numberOfLines={1}>
                    {origin.title}
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>

          <ClipSocialRail
            key={clip.id}
            clip={clip}
            currentUserId={user?.id}
            onComments={() => setSheet('comments')}
            onShare={() => setSheet('share')}
            onMore={() => setSheet('more')}
            onLikeBurst={() => setBurst((value) => value + 1)}
            burstKey={burst}
            floatEmoji={floatEmoji}
            insetsBottom={bottomPad}
          />

          {clip.caption ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 16,
                right: 88,
                bottom: bottomPad + 20,
              }}>
              <AppText className="text-[15px] leading-5" style={{ color: '#fff' }} numberOfLines={3}>
                {clip.caption}
              </AppText>
            </View>
          ) : null}

          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: 12,
              left: 12,
              bottom: bottomPad,
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
          {promptShare && canOfferShareToFeed(clip) ? (
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
                bottom: bottomPad + 32,
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
          {toast ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 16,
                right: 88,
                bottom: bottomPad + 72,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 14,
                backgroundColor: 'rgba(16,19,18,0.72)',
              }}>
              <AppText className="text-[14px] leading-5" style={{ color: '#fff' }} numberOfLines={3}>
                {toast}
              </AppText>
            </View>
          ) : null}
        </View>
      </GestureDetector>

      {emojiOpen ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            right: 0,
            bottom: bottomPad + 64,
            left: 0,
            alignItems: 'center',
          }}>
          <View className="flex-row" style={{ gap: 10 }}>
            {EMOJI_ROW.map((row) => (
              <Pressable
                key={row.emoji}
                accessibilityRole="button"
                accessibilityLabel={row.emoji}
                onPress={() => {
                  setFloatEmoji(row.emoji);
                  setEmojiOpen(false);
                  paused.current = false;
                  setTimeout(() => setFloatEmoji(null), 900);
                }}
                style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                <AppText className="text-[28px]">{row.emoji}</AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <ClipSheets
        key={`${clip.id}-sheets`}
        clip={clip}
        sheet={sheet}
        captionDraft={captionDraft}
        onCaptionDraft={setCaptionDraft}
        onOpenSheet={setSheet}
        onCloseSheet={() => setSheet(null)}
        onClosePlayer={onClose}
        currentUserId={user?.id}
        avatarUrl={profile?.avatar_url}
        displayName={profile?.display_name ?? profile?.username}
        viewportHeight={watchHeight}
        onToast={setToast}
        floatType={
          floatEmoji ? EMOJI_ROW.find((row) => row.emoji === floatEmoji)?.type : undefined
        }
      />
    </Animated.View>
    </WatchSurface>
  );
}

function DoubleTapLike({ onLike }: { onLike: () => void }) {
  const last = useRef(0);
  return (
    <Pressable
      onPress={() => {
        const now = Date.now();
        if (now - last.current < 280) {
          onLike();
        }
        last.current = now;
      }}
      style={{ flex: 1 }}
    />
  );
}

function ClipSocialRail({
  clip,
  currentUserId,
  onComments,
  onShare,
  onMore,
  onLikeBurst,
  burstKey,
  floatEmoji,
  insetsBottom,
}: {
  clip: ClipPlayItem;
  currentUserId?: string;
  onComments: () => void;
  onShare: () => void;
  onMore: () => void;
  onLikeBurst: () => void;
  burstKey: number;
  floatEmoji: string | null;
  insetsBottom: number;
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
  const liked = Boolean(userReaction(social.post?.reactions, currentUserId));

  useEffect(() => {
    if (burstKey > 0) {
      void social.onReact('like');
    }
    // Burst key is the trigger; social identity is stable enough for this overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burstKey]);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        right: 8,
        bottom: insetsBottom + 48,
        alignItems: 'center',
        gap: 10,
      }}>
      {floatEmoji ? (
        <AppText className="text-[36px]" style={{ marginBottom: 8 }}>
          {floatEmoji}
        </AppText>
      ) : burstKey > 0 ? (
        <AppText className="text-[36px]" style={{ marginBottom: 8 }}>
          ❤️
        </AppText>
      ) : null}
      <RailButton
        accessibilityLabel="Like"
        glyph={liked ? GLYPH.like : GLYPH.likeOutline}
        count={counts.reactions}
        onPress={() => {
          onLikeBurst();
        }}
      />
      <RailButton
        accessibilityLabel="Comment"
        glyph={GLYPH.reply}
        count={counts.comments}
        onPress={onComments}
      />
      <RailButton accessibilityLabel="Share" glyph={GLYPH.share} onPress={onShare} />
      <RailButton accessibilityLabel="More" glyph={GLYPH.more} onPress={onMore} />
    </View>
  );
}

function RailButton({
  accessibilityLabel,
  glyph,
  count,
  onPress,
}: {
  accessibilityLabel: string;
  glyph: (typeof GLYPH)[keyof typeof GLYPH];
  count?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Glyph name={glyph} color="#fff" size={22} />
      {count != null ? (
        <AppText className="text-[11px] font-bold" style={{ color: '#fff' }}>
          {count}
        </AppText>
      ) : null}
    </Pressable>
  );
}

function ClipSheets({
  clip,
  sheet,
  captionDraft,
  onCaptionDraft,
  onOpenSheet,
  onCloseSheet,
  onClosePlayer,
  currentUserId,
  avatarUrl,
  displayName,
  viewportHeight,
  onToast,
  floatType,
}: {
  clip: ClipPlayItem;
  sheet: 'comments' | 'share' | 'shareFeed' | 'more' | 'caption' | null;
  captionDraft: string;
  onCaptionDraft: (value: string) => void;
  onOpenSheet: (next: 'comments' | 'share' | 'shareFeed' | 'more' | 'caption') => void;
  onCloseSheet: () => void;
  onClosePlayer: () => void;
  currentUserId?: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  viewportHeight: number;
  onToast: (value: string | null) => void;
  floatType?: ReactionType;
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
  const block = useBlockUser();
  const url = clip.kind === 'round' ? roundShareUrl(clip.id) : storyShareUrl(clip.id);

  useEffect(() => {
    if (floatType) {
      void social.onReact(floatType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatType]);

  return (
    <>
      <WaveRoundCommentSheet
        visible={sheet === 'comments'}
        comments={social.post?.comments ?? []}
        viewportHeight={viewportHeight}
        avatarUrl={avatarUrl}
        displayName={displayName}
        authorId={currentUserId}
        submitting={social.commenting}
        onClose={onCloseSheet}
        onSend={async (content) => {
          await social.onComment(content);
          onToast(content);
        }}
      />

      <ChromeOverlay visible={sheet === 'share'} onClose={onCloseSheet} dim zIndex={40}>
        <View
          style={{
            backgroundColor: THEME.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 20,
            maxHeight: 360,
          }}>
          <AppText className="text-[15px] font-extrabold text-charcoal">Share</AppText>
          {canOfferShareToFeed(clip) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenSheet('shareFeed')}
              style={{ minHeight: 44, justifyContent: 'center' }}>
              <AppText className="text-[15px] font-semibold text-charcoal">
                {copy('round.shareFeed')}
              </AppText>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void Clipboard.setStringAsync(url);
              onCloseSheet();
            }}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-[15px] font-semibold text-charcoal">Copy link</AppText>
          </Pressable>
          <AppText className="mt-2 text-[13px] font-bold text-muted">Send in DM</AppText>
          <ScrollView style={{ maxHeight: 200 }}>
            {(friends.data ?? []).length === 0 ? (
              <AppText className="mt-2 text-[13px] text-muted">Add friends first.</AppText>
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
                    onPress={() =>
                      share.mutate(
                        { storyId: clip.id, friendId: id, url },
                        {
                          onSuccess: onCloseSheet,
                          onError: (error) => Alert.alert('Couldn’t send that', getErrorMessage(error)),
                        },
                      )
                    }
                    style={{ minHeight: 44, justifyContent: 'center' }}>
                    <AppText className="text-[15px] font-semibold text-charcoal">{name}</AppText>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
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
                label="Hide from rail"
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
                      onCloseSheet();
                    })
                    .catch((error) => Alert.alert('Couldn’t hide that', getErrorMessage(error)));
                }}
              />
              <MoreRow
                label="Edit caption"
                onPress={() => {
                  onCaptionDraft(clip.caption ?? '');
                  onOpenSheet('caption');
                }}
              />
            </>
          ) : (
            <>
              <MoreRow
                label="Hide from my rail"
                onPress={() => {
                  void hideAuthorFromMyRail(clip.authorId).then(() => {
                    void queryClient.invalidateQueries({ queryKey: ['stories'] });
                    void queryClient.invalidateQueries({ queryKey: ['story-rail-filters'] });
                    onCloseSheet();
                    onClosePlayer();
                  });
                }}
              />
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
              <MoreRow
                label="Block"
                onPress={() => {
                  void block
                    .mutateAsync(clip.authorId)
                    .then(() => {
                      onCloseSheet();
                      onClosePlayer();
                    })
                    .catch((error) => Alert.alert('Couldn’t block that', getErrorMessage(error)));
                }}
              />
            </>
          )}
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
      <RoundShareComposer
        visible={sheet === 'shareFeed'}
        target={
          clip.kind === 'round' && clip.postId
            ? {
                reelId: clip.id,
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
  startMs,
  durationMs,
  loop,
  pausedRef,
  onEnded,
  onProgress,
}: {
  uri: string;
  startMs: number;
  durationMs: number;
  loop: boolean;
  pausedRef: { current: boolean };
  onEnded?: () => void;
  onProgress: (value: number) => void;
}) {
  const startSec = Math.max(startMs, 0) / 1000;
  const endSec = startSec + Math.max(durationMs || WAVE_CLIP_MS, 400) / 1000;
  const endedRef = useRef(false);
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = loop;
    instance.muted = false;
    instance.currentTime = startSec;
    instance.play();
  });

  useEventListener(player, 'playToEnd', () => {
    if (loop || endedRef.current) {
      return;
    }
    endedRef.current = true;
    onEnded?.();
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
      if (!loop && !endedRef.current && t >= endSec - 0.05) {
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
  }, [endSec, loop, onEnded, onProgress, pausedRef, player, startSec]);

  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%', backgroundColor: '#101312' }}
      contentFit="cover"
      nativeControls={false}
    />
  );
}
