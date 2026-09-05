import { memo, useMemo, useRef } from 'react';
import { Alert, Animated, PanResponder, Platform, Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { LiveReactions } from '@/components/challenge/LiveReactions';
import { InlineComposer } from '@/components/feed/InlineComposer';
import { useMediaLightboxOptional, type LightboxItem } from '@/components/feed/MediaLightbox';
import { MentionText } from '@/components/feed/MentionText';
import { ProfileLink } from '@/components/profile/ProfileLink';
import {
  useCommentEditing,
  useSocialSheetsOptional,
  type WindowRect,
} from '@/components/social/SocialSheets';
import { Avatar } from '@/components/ui/Avatar';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useUpdateComment } from '@/hooks/useCommentEdit';
import { isLiveComment } from '@/lib/commentEdit';
import { checkinCardCaption } from '@/lib/checkinPost';
import { copy } from '@/lib/copy';
import {
  formatLiveClock,
  isLiveCheckinPost,
  isLiveSystemPost,
  liveChatText,
  liveCheckinHeadline,
  liveProofCaption,
  liveQuoteLine,
  liveSwipeClaimsReply,
  REPLY_SWIPE_MAX,
  REPLY_SWIPE_TRIGGER,
} from '@/lib/liveThread';
import { pagerUrlsForViewer } from '@/lib/postMediaCarousel';
import { resolveLiveAuthor } from '@/lib/safeIds';
import { CheckinProofStatsRow } from '@/components/challenge/CheckinProofStats';
import { LiftPostCard } from '@/components/lift/LiftPostCard';
import { THEME } from '@/lib/theme';
import type { CommentWithAuthor, PostWithMeta, Reaction, ReactionType } from '@/lib/types';
import { commentMediaUrls, commentTextWithoutMedia, mediaKind } from '@/utils/media';
import { getErrorMessage } from '@/utils/errors';

export type LiveQuote = {
  name: string;
  text: string;
  avatarUrl?: string | null;
};

type LiveBubbleProps = {
  post: PostWithMeta;
  currentUserId?: string;
  highlighted?: boolean;
  quote?: LiveQuote | null;
  reactions?: Reaction[];
  comment?: CommentWithAuthor | null;
  onReact: (type: ReactionType) => void;
  onReply?: () => void;
  onEdit?: () => void;
  onHistory?: () => void;
};

export const LiveBubble = memo(function LiveBubble({
  post,
  currentUserId,
  highlighted,
  quote,
  reactions,
  comment,
  onReact,
  onReply,
  onEdit,
  onHistory,
}: LiveBubbleProps) {
  const lightbox = useMediaLightboxOptional();
  const social = useSocialSheetsOptional();
  const moreRef = useRef<View>(null);
  const editing = useCommentEditing(comment?.id ?? '');
  const updateComment = useUpdateComment();
  const removed = Boolean(comment) && !isLiveComment(comment);
  const { authorId: uid, name } = resolveLiveAuthor({
    ...post,
    user_id: (post as { user_id?: string | null }).user_id,
  });
  const mine = Boolean(currentUserId && uid && currentUserId === uid);
  const checkin = isLiveCheckinPost(post);
  const system = isLiveSystemPost(post);
  const visuals = liveVisualUrls(post, mine);
  const time = formatLiveClock(post.created_at);
  const caption = checkin
    ? checkinCardCaption(post.content, null, post.edited_at)
    : liveChatText(post.content, post.media_urls);
  const headline = liveCheckinHeadline(post);
  const liftSessionId = post.lift_session_id ? String(post.lift_session_id) : null;
  const items: LightboxItem[] = visuals.map((uri) => ({
    uri,
    label: liveProofCaption(post, uri, checkin ? headline : caption),
    meta: time,
  }));
  const alignEnd = mine && !system;
  const canSwipeReply = Boolean(onReply) && !removed && !editing;
  const swipe = useRef(new Animated.Value(0)).current;
  const swipeLive = useRef(false);
  const replyRef = useRef(onReply);
  replyRef.current = onReply;
  swipeLive.current = canSwipeReply;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          swipeLive.current && liveSwipeClaimsReply(gesture.dx, gesture.dy),
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          swipeLive.current && liveSwipeClaimsReply(gesture.dx, gesture.dy),
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderMove: (_, gesture) => {
          swipe.setValue(Math.max(0, Math.min(gesture.dx, REPLY_SWIPE_MAX)));
        },
        onPanResponderRelease: (_, gesture) => {
          const fire = gesture.dx >= REPLY_SWIPE_TRIGGER;
          Animated.spring(swipe, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
          if (fire) {
            replyRef.current?.();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(swipe, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
        },
      }),
    [swipe],
  );

  function openProof(index = 0) {
    if (!lightbox || items.length === 0) {
      return;
    }
    lightbox.openLightbox(items, index);
  }

  function openCommentMenu() {
    if (!comment || !social) {
      return;
    }
    moreRef.current?.measureInWindow((x, y, width, height) => {
      social.toggleCommentOverflow(comment, { x, y, width, height } as WindowRect);
    });
  }

  const commentBody = comment ? commentTextWithoutMedia(comment.content) : '';
  const commentMedia = comment ? commentMediaUrls(comment.content) : [];

  return (
    <View
      style={{
        alignItems: alignEnd ? 'flex-end' : 'flex-start',
        maxWidth: '100%',
        borderRadius: 16,
        borderWidth: highlighted ? 1.5 : 0,
        borderColor: highlighted ? THEME.accent : 'transparent',
        padding: highlighted ? 4 : 0,
        overflow: 'visible',
      }}>
      {/* iMessage: a clear right drag reveals Reply. Vertical scroll still wins. */}
      {canSwipeReply ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
            opacity: swipe.interpolate({
              inputRange: [0, REPLY_SWIPE_TRIGGER],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            }),
          }}>
          <Glyph name={GLYPH.replyArrow} color={THEME.textMuted} size={16} />
        </Animated.View>
      ) : null}
      <Animated.View
        {...(canSwipeReply ? pan.panHandlers : null)}
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 8,
          maxWidth: '86%',
          alignSelf: alignEnd ? 'flex-end' : 'flex-start',
          transform: [{ translateX: swipe }],
          ...(Platform.OS === 'web' ? ({ userSelect: 'none' } as object) : null),
        }}>
        {alignEnd ? null : (
          <ProfileLink username={post.author?.username} userId={uid}>
            <Avatar uri={post.author?.avatar_url} name={name} size={28} />
          </ProfileLink>
        )}
        <View
          style={{
            flexShrink: 1,
            minWidth: 0,
            maxWidth: '100%',
            alignItems: alignEnd ? 'flex-end' : 'flex-start',
          }}>
          {checkin ? null : (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 28,
                gap: 6,
                marginBottom: 4,
                maxWidth: '100%',
                alignSelf: alignEnd ? 'flex-end' : 'stretch',
              }}>
              {alignEnd ? null : (
                <AppText
                  className="text-[13px] font-semibold"
                  numberOfLines={1}
                  style={{ color: THEME.textMuted, flexShrink: 1, minWidth: 0 }}>
                  {name}
                </AppText>
              )}
              {removed ? null : time ? (
                <AppText className="text-[11px]" numberOfLines={1} style={{ color: THEME.textMuted, flexShrink: 0 }}>
                  {time}
                  {post.edited_at || comment?.edited_at ? ` · ${copy('comment.edited')}` : ''}
                </AppText>
              ) : null}
              <View style={{ flex: 1, minWidth: 8 }} />
              {comment && social ? (
                <Pressable
                  ref={moreRef}
                  collapsable={false}
                  accessibilityRole="button"
                  accessibilityLabel="Comment menu"
                  onPress={openCommentMenu}
                  hitSlop={8}
                  style={{
                    flexShrink: 0,
                    minWidth: 32,
                    minHeight: 32,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Glyph name={GLYPH.more} color={THEME.textMuted} size={14} />
                </Pressable>
              ) : null}
            </View>
          )}
          {quote && !checkin && !removed ? <LiveQuoteChip quote={quote} mine={alignEnd} /> : null}
          {removed ? (
            <View
              style={{
                backgroundColor: THEME.surface,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: THEME.border,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}>
              <AppText className="text-[14px]" style={{ color: THEME.textMuted }}>
                {copy('comment.removed')}
              </AppText>
            </View>
          ) : editing && comment ? (
            <View style={{ minWidth: 220, maxWidth: '100%' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={() => social?.clearCommentEdit()}
                style={{ alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center' }}>
                <AppText className="text-[12px] font-semibold" style={{ color: THEME.textMuted }}>
                  Cancel
                </AppText>
              </Pressable>
              <InlineComposer
                placeholder="Edit comment…"
                submitLabel="Save"
                submitting={updateComment.isPending}
                bar
                pinned
                autoFocus
                initialText={commentBody}
                initialMediaUrls={commentMedia}
                onSubmit={async (text, mentionedUserIds, chips) => {
                  try {
                    await updateComment.mutateAsync({
                      commentId: comment.id,
                      content: text,
                      mentionedUserIds,
                      mentionChips: chips,
                    });
                    social?.clearCommentEdit();
                  } catch (error) {
                    Alert.alert(copy('comment.saveFailed'), getErrorMessage(error));
                  }
                }}
              />
            </View>
          ) : checkin ? (
            <View
              className="flex-row items-center"
              style={{
                gap: 10,
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 16,
                backgroundColor: THEME.surface,
                borderWidth: 1,
                borderColor: THEME.border,
                maxWidth: '100%',
              }}>
              {visuals[0] ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open check-in proof. ${headline}`}
                  onPress={() => openProof(0)}
                  style={{
                    width: CHECKIN_THUMB,
                    height: CHECKIN_THUMB,
                    borderRadius: 14,
                    overflow: 'hidden',
                    backgroundColor: THEME.surface2,
                  }}>
                  <Image
                    source={{ uri: visuals[0] }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                  {mediaKind(visuals[0]) === 'video' ? (
                    <View
                      pointerEvents="none"
                      style={{
                        ...absoluteFill,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(16,19,18,0.28)',
                      }}>
                      <Glyph name={GLYPH.play} color="#fff" size={16} />
                    </View>
                  ) : null}
                  {visuals.length > 1 ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 999,
                        backgroundColor: 'rgba(16,19,18,0.82)',
                      }}>
                      <AppText className="text-[10px] font-bold" style={{ color: THEME.primaryForeground }}>
                        {visuals.length}
                      </AppText>
                    </View>
                  ) : null}
                  {/* Receipt line rides in a solid chip, never raw white text on the proof. */}
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      paddingHorizontal: 5,
                      paddingVertical: 4,
                      backgroundColor: 'rgba(16,19,18,0.92)',
                    }}>
                    <AppText
                      className="text-[10px] font-bold"
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={{ color: THEME.primaryForeground, letterSpacing: -0.1 }}>
                      {headline}
                    </AppText>
                  </View>
                </Pressable>
              ) : null}
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                {visuals[0] ? null : (
                  <AppText className="text-[14px] font-semibold" style={{ color: THEME.textPrimary }}>
                    {headline}
                  </AppText>
                )}
                {caption && !liftSessionId ? (
                  <AppText className="mt-0.5 text-[13px]" style={{ color: THEME.textMuted }} numberOfLines={2}>
                    {caption}
                  </AppText>
                ) : null}
                {/* A lift attached to this check-in reads as its own card, not as a wall of text. */}
                {liftSessionId ? (
                  <View className="mt-1.5">
                    <LiftPostCard
                      sessionId={liftSessionId}
                      authorId={uid}
                      caption={post.content}
                      compact
                    />
                  </View>
                ) : null}
                {/* Fitness stats only. The caption above stays whatever the user typed. */}
                <View className="mt-1">
                  <CheckinProofStatsRow stats={post.checkin_stats} />
                </View>
                {time || post.edited_at ? (
                  <View className="mt-0.5 flex-row items-center" style={{ gap: 6 }}>
                    {time ? (
                      <AppText className="text-[11px]" style={{ color: THEME.textMuted }}>
                        {time}
                      </AppText>
                    ) : null}
                    <EditedMark editedAt={post.edited_at} onPress={onHistory} />
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <View
              style={{
                backgroundColor: mine ? THEME.primary : THEME.surface,
                borderRadius: 18,
                borderBottomRightRadius: mine ? 6 : 18,
                borderBottomLeftRadius: mine ? 18 : 6,
                borderWidth: mine ? 0 : 1,
                borderColor: THEME.border,
                overflow: 'hidden',
                maxWidth: '100%',
              }}>
              {visuals[0] ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open photo"
                  onPress={() => openProof(0)}
                  style={{ width: 200, maxWidth: '100%', aspectRatio: 1, backgroundColor: THEME.surface2 }}>
                  <Image
                    source={{ uri: visuals[0] }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                  {mediaKind(visuals[0]) === 'video' ? (
                    <View
                      pointerEvents="none"
                      style={{
                        ...absoluteFill,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(16,19,18,0.28)',
                      }}>
                      <Glyph name={GLYPH.play} color="#fff" size={18} />
                    </View>
                  ) : null}
                </Pressable>
              ) : null}
              {liftSessionId ? (
                <View className="px-3 py-2">
                  <LiftPostCard
                    sessionId={liftSessionId}
                    authorId={uid}
                    caption={post.content}
                    compact
                  />
                </View>
              ) : caption ? (
                <View className="px-3 py-2">
                  <MentionText
                    content={caption}
                    mentions={post.mentions}
                    className="text-[15px] leading-5"
                    color={mine ? THEME.primaryForeground : THEME.textPrimary}
                  />
                </View>
              ) : null}
            </View>
          )}
          {/* stretch, not flex-end: a content-sized row cannot wrap, so chips used to push Reply off screen. */}
          {removed || editing ? null : (
          <View style={{ marginTop: 2, maxWidth: '100%', alignSelf: 'stretch' }}>
            <LiveReactions
              reactions={reactions ?? post.reactions}
              currentUserId={currentUserId}
              align={alignEnd ? 'end' : 'start'}
              onReact={onReact}
              onReply={onReply}
              onEdit={onEdit}
            />
          </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
});

function EditedMark({
  editedAt,
  onPress,
}: {
  editedAt?: string | null;
  onPress?: () => void;
}) {
  if (!editedAt) {
    return null;
  }
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={copy('post.edited')}
      disabled={!onPress}
      onPress={onPress}
      hitSlop={6}>
      <AppText className="text-[11px] font-semibold" style={{ color: THEME.textMuted }}>
        {copy('post.edited')}
      </AppText>
    </Pressable>
  );
}

function LiveQuoteChip({ quote, mine }: { quote: LiveQuote; mine?: boolean }) {
  const line = liveQuoteLine(quote.name, quote.text);
  if (!line) {
    return null;
  }
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        maxWidth: '100%',
        marginBottom: 4,
        alignSelf: mine ? 'flex-end' : 'flex-start',
      }}>
      {quote.avatarUrl ? <Avatar uri={quote.avatarUrl} name={quote.name} size={16} /> : null}
      <AppText
        className="text-[12px]"
        style={{ color: THEME.textMuted, flexShrink: 1 }}
        numberOfLines={1}>
        {line}
      </AppText>
    </View>
  );
}

/** Dense Live stays one thumb, but big enough for the caption chip and the clock to read. */
const CHECKIN_THUMB = 96;

const absoluteFill = {
  position: 'absolute' as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

function liveVisualUrls(post: PostWithMeta, isOwner: boolean): string[] {
  const fromFields = pagerUrlsForViewer({
    urls: post.media_urls,
    hidden: post.hidden_media_urls,
    isOwner,
  });
  if (fromFields.length > 0) {
    return fromFields;
  }
  return commentMediaUrls(post.content ?? '');
}
