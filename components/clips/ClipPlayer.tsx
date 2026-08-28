import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated as RNAnimated,
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
import { stopAllLiveMedia } from '@/lib/cameraSession';
import { RoundShareComposer } from '@/components/clips/RoundShareComposer';
import { downloadClipMedia } from '@/lib/clipDownload';
import {
  CLIP_REACTIONS,
  DEFAULT_CLIP_REACTION,
  asClipReactionType,
  clipReactionEmoji,
  commentsBandHeight,
  loadLastClipReaction,
  saveLastClipReaction,
  type ClipReactionType,
} from '@/lib/clipReactions';
import { setPostHiddenFromRail } from '@/lib/clipRail';
import { clipSocialCounts } from '@/lib/clipPost';
import { copy } from '@/lib/copy';
import { canOfferShareToFeed } from '@/lib/roundShare';
import { userReaction } from '@/lib/reactions';
import { personDisplayName, type FeedChallengePreview } from '@/lib/social';
import { THEME } from '@/lib/theme';
import { WAVE_CLIP_MS } from '@/lib/waveClips';
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

const RAIL_HIT = 48;

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
  const [sheet, setSheet] = useState<'share' | 'shareFeed' | 'more' | 'caption' | 'delete' | null>(null);
  const [commentsMode, setCommentsMode] = useState(openComments);
  const [promptShare, setPromptShare] = useState(sharePrompt);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lastReaction, setLastReaction] = useState<ClipReactionType>(DEFAULT_CLIP_REACTION);
  const [float, setFloat] = useState<{ emoji: string; key: number } | null>(null);
  const [captionDraft, setCaptionDraft] = useState('');
  const paused = useRef(false);
  const sheetRef = useRef(sheet);
  const commentsRef = useRef(commentsMode);
  const persistReact = useRef<(type: ClipReactionType) => void>(() => undefined);
  const marked = useRef(new Set<string>());
  const clipsRef = useRef(clips);
  const indexRef = useRef(index);
  const translateY = useSharedValue(0);

  clipsRef.current = clips;
  indexRef.current = index;
  sheetRef.current = sheet;
  commentsRef.current = commentsMode;
  paused.current = pickerOpen;

  useEffect(() => {
    void loadLastClipReaction().then(setLastReaction);
  }, []);

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

  const applyReaction = useCallback((type: ClipReactionType) => {
    setLastReaction(type);
    void saveLastClipReaction(type);
    setFloat({ emoji: clipReactionEmoji(type), key: Date.now() });
    setPickerOpen(false);
    persistReact.current(type);
  }, []);

  function requestClose() {
    if (commentsRef.current) {
      setCommentsMode(false);
      return;
    }
    onClose();
  }

  useEffect(() => {
    setProgress(0);
    setFloat(null);
    setPickerOpen(false);
    setCommentsMode(openComments && index === startIndex);
    setSheet(null);
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
            runOnJS(requestClose)();
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
  const bandH = commentsMode ? commentsBandHeight(watchHeight) : undefined;
  const railPad = commentsMode ? 8 : bottomPad;

  return (
    <WatchSurface>
      <StatusBar style="light" />
    <Animated.View style={[{ flex: 1, backgroundColor: '#101312' }, sheetStyle]}>
      <View style={{ flex: 1 }}>
      <GestureDetector gesture={pan}>
          <View style={{ height: bandH, flex: bandH ? undefined : 1, overflow: 'hidden', backgroundColor: '#101312' }}>
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
            accessibilityLabel="React"
            onPress={() => undefined}
            onLongPress={() => setPickerOpen(true)}
            delayLongPress={220}
            style={{ position: 'absolute', top: 0, right: 72, bottom: 0, left: 72 }}
          >
            <DoubleTapLike onLike={() => applyReaction(lastReaction)} />
          </Pressable>

          {autoAdvance && !commentsMode ? (
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
              paddingTop: commentsMode ? 8 : topPad,
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
            onComments={() => setCommentsMode(true)}
            onLongReact={() => setPickerOpen(true)}
            onPickReact={applyReaction}
            onClosePicker={() => setPickerOpen(false)}
          />

          {clip.caption ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 16,
                right: 88,
                bottom: railPad + 20,
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
          </View>
      </GestureDetector>
          {commentsMode ? (
            <View style={{ flex: 1, minHeight: 0 }}>
              <ClipCommentsPane
                clip={clip}
                currentUserId={user?.id}
                avatarUrl={profile?.avatar_url}
                displayName={profile?.display_name ?? profile?.username}
              />
            </View>
          ) : null}
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
  lastReaction,
  pickerOpen,
  float,
  insetsBottom,
  persistReact,
  onComments,
  onLongReact,
  onPickReact,
  onClosePicker,
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
  persistReact.current = (type) => {
    void social.onReact(type);
  };

  function fire(type: ClipReactionType) {
    onPickReact(type);
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        right: 8,
        bottom: insetsBottom + 48,
        alignItems: 'center',
        gap: 8,
      }}>
      {pickerOpen ? (
        <View
          style={{
            maxWidth: 220,
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(16,19,18,0.88)',
            borderRadius: 18,
            padding: 6,
            gap: 2,
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
        </View>
      ) : null}
      <View style={{ minWidth: RAIL_HIT, minHeight: RAIL_HIT, alignItems: 'center', justifyContent: 'center' }}>
        {float ? <FloatEmoji emoji={float.emoji} token={float.key} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reaction"
          onPress={() => fire(mineType ?? lastReaction)}
          onLongPress={onLongReact}
          delayLongPress={280}
          style={{ minWidth: RAIL_HIT, minHeight: RAIL_HIT, alignItems: 'center', justifyContent: 'center' }}>
          <AppText className="text-[28px]">{mineType ? clipReactionEmoji(mineType) : '♡'}</AppText>
          <AppText className="text-[11px] font-bold" style={{ color: '#fff' }}>
            {counts.reactions}
          </AppText>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Comment"
        onPress={onComments}
        style={{ minWidth: RAIL_HIT, minHeight: RAIL_HIT, alignItems: 'center', justifyContent: 'center' }}>
        <Glyph name={GLYPH.reply} color="#fff" size={26} />
        <AppText className="text-[11px] font-bold" style={{ color: '#fff' }}>
          {counts.comments}
        </AppText>
      </Pressable>
      {pickerOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close reactions"
          onPress={onClosePicker}
          style={{ minWidth: RAIL_HIT, minHeight: 32, alignItems: 'center' }}>
          <AppText className="text-[12px] font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Close
          </AppText>
        </Pressable>
      ) : null}
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
}: {
  clip: ClipPlayItem;
  currentUserId?: string;
  avatarUrl?: string | null;
  displayName?: string | null;
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
  return (
    <WaveRoundCommentsFeed
      comments={social.post?.comments ?? []}
      currentUserId={currentUserId}
      avatarUrl={avatarUrl}
      displayName={displayName}
      submitting={social.commenting}
      onSend={(content, parentId) => social.onComment(content, parentId)}
      onReact={(commentId, type) => void social.onReact(type, commentId)}
      onReport={async () => {
        const postId = social.post?.id ?? clip.postId;
        if (!postId) {
          return;
        }
        await report.mutateAsync({ postId, reason: 'comment' });
      }}
    />
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
}: {
  clip: ClipPlayItem;
  sheet: 'share' | 'shareFeed' | 'more' | 'caption' | 'delete' | null;
  captionDraft: string;
  onCaptionDraft: (value: string) => void;
  onOpenSheet: (next: 'share' | 'shareFeed' | 'more' | 'caption' | 'delete') => void;
  onCloseSheet: () => void;
  onClosePlayer: () => void;
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
  const url = clip.kind === 'round' ? roundShareUrl(clip.id) : storyShareUrl(clip.id);

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
          <MoreRow label="Share" onPress={() => onOpenSheet('share')} />
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
