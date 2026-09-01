import { memo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { CommentThread } from '@/components/feed/CommentThread';
import { InlineComposer } from '@/components/feed/InlineComposer';
import { useMediaLightboxOptional, type LightboxItem } from '@/components/feed/MediaLightbox';
import { MentionText } from '@/components/feed/MentionText';
import { ReactionBar } from '@/components/feed/ReactionBar';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { Avatar } from '@/components/ui/Avatar';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { checkinExtraCaption } from '@/lib/checkinPost';
import { formatLiveClock, isLiveCheckinPost, liveCheckinLabel } from '@/lib/liveThread';
import { asPostAudience } from '@/lib/postAudience';
import { pagerUrlsForViewer } from '@/lib/postMediaCarousel';
import { authorLabel, safeUserId } from '@/lib/safeIds';
import { THEME } from '@/lib/theme';
import type { PostWithMeta, ReactionType } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { commentMediaUrls, mediaKind } from '@/utils/media';

type LiveBubbleProps = {
  post: PostWithMeta;
  currentUserId?: string;
  highlighted?: boolean;
  commenting?: boolean;
  onReact: (type: ReactionType, commentId?: string | null) => void;
  onComment?: (
    content: string,
    parentId?: string | null,
    mentionedUserIds?: string[],
  ) => Promise<unknown> | void;
};

export const LiveBubble = memo(function LiveBubble({
  post,
  currentUserId,
  highlighted,
  commenting,
  onReact,
  onComment,
}: LiveBubbleProps) {
  const [showReplies, setShowReplies] = useState(false);
  const lightbox = useMediaLightboxOptional();
  const uid = safeUserId(post.author, post.author_id, (post as { user_id?: string | null }).user_id);
  const name = authorLabel(post.author);
  const mine = Boolean(currentUserId && currentUserId === post.author_id);
  const checkin = isLiveCheckinPost(post);
  const comments = post.comments ?? [];
  const audience = asPostAudience(post.audience);
  const visuals = liveVisualUrls(post, mine);
  const time = formatLiveClock(post.created_at);
  const caption = checkin
    ? checkinExtraCaption(post.content, null)
    : liveChatText(post.content, post.media_urls);
  const items: LightboxItem[] = visuals.map((uri) => ({
    uri,
    label: mediaKind(uri) === 'video' ? 'Video' : 'Photo',
  }));

  function openProof(index = 0) {
    if (!lightbox || items.length === 0) {
      return;
    }
    lightbox.openLightbox(items, index);
  }

  return (
    <View
      style={{
        alignItems: mine && !checkin ? 'flex-end' : 'flex-start',
        maxWidth: '100%',
        borderRadius: 16,
        borderWidth: highlighted ? 1.5 : 0,
        borderColor: highlighted ? THEME.accent : 'transparent',
        padding: highlighted ? 4 : 0,
      }}>
      <View
        className="flex-row items-end"
        style={{
          gap: 8,
          maxWidth: checkin ? '100%' : '86%',
          alignSelf: mine && !checkin ? 'flex-end' : 'flex-start',
        }}>
        {mine && !checkin ? null : (
          <ProfileLink username={post.author?.username} userId={uid}>
            <Avatar uri={post.author?.avatar_url} name={name} size={28} />
          </ProfileLink>
        )}
        <View style={{ flexShrink: 1, minWidth: 0, alignItems: mine && !checkin ? 'flex-end' : 'flex-start' }}>
          <AppText className="mb-0.5 text-[11px] font-semibold" style={{ color: THEME.textMuted }}>
            {name}
          </AppText>
          {checkin ? (
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
                  accessibilityLabel="Open check-in proof"
                  onPress={() => openProof(0)}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 12,
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
                </Pressable>
              ) : null}
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <AppText className="text-[14px] font-semibold" style={{ color: THEME.textPrimary }}>
                  {liveCheckinLabel(post)}
                </AppText>
                {caption ? (
                  <AppText className="mt-0.5 text-[13px]" style={{ color: THEME.textMuted }} numberOfLines={2}>
                    {caption}
                  </AppText>
                ) : null}
                {time ? (
                  <AppText className="mt-0.5 text-[11px]" style={{ color: THEME.textMuted }}>
                    {time}
                  </AppText>
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
              {caption ? (
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
          {checkin ? null : time ? (
            <AppText className="mt-1 text-[11px]" style={{ color: THEME.textMuted }}>
              {time}
            </AppText>
          ) : null}
          <View style={{ marginTop: 2, alignSelf: mine && !checkin ? 'flex-end' : 'flex-start' }}>
            <ReactionBar
              compact
              reactions={post.reactions}
              currentUserId={currentUserId}
              commentCount={comments.length}
              onReact={(type) => onReact(type)}
              onReply={
                onComment
                  ? () => setShowReplies((open) => !open)
                  : undefined
              }
            />
          </View>
        </View>
      </View>

      {showReplies && onComment ? (
        <View style={{ marginTop: 8, width: '100%', paddingLeft: mine && !checkin ? 0 : 36 }}>
          <InlineComposer
            placeholder="Write a reply…"
            submitting={commenting}
            audience={audience}
            audienceUserIds={post.audience_user_ids ?? []}
            autoFocus
            onSubmit={async (text, mentionedUserIds) => {
              try {
                await onComment(text, null, mentionedUserIds);
              } catch (error) {
                Alert.alert('Couldn’t post that reply', getErrorMessage(error));
              }
            }}
          />
          {comments.length > 0 ? (
            <CommentThread
              comments={comments}
              currentUserId={currentUserId}
              composing={commenting}
              audience={audience}
              audienceUserIds={post.audience_user_ids ?? []}
              onReply={onComment}
              onReact={(commentId, type) => onReact(type, commentId)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

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

function liveChatText(content?: string | null, mediaUrls?: string[] | null): string {
  const text = (content ?? '').trim();
  if (!text) {
    return '';
  }
  const skip = new Set([...(mediaUrls ?? []), ...commentMediaUrls(text)]);
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !skip.has(line))
    .join('\n');
}
