import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { LiveReactions } from '@/components/challenge/LiveReactions';
import { useMediaLightboxOptional, type LightboxItem } from '@/components/feed/MediaLightbox';
import { MentionText } from '@/components/feed/MentionText';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { Avatar } from '@/components/ui/Avatar';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { checkinExtraCaption } from '@/lib/checkinPost';
import {
  formatLiveClock,
  isLiveCheckinPost,
  liveChatText,
  liveCheckinLabel,
  liveQuoteLine,
} from '@/lib/liveThread';
import { pagerUrlsForViewer } from '@/lib/postMediaCarousel';
import { resolveLiveAuthor } from '@/lib/safeIds';
import { THEME } from '@/lib/theme';
import type { PostWithMeta, Reaction, ReactionType } from '@/lib/types';
import { commentMediaUrls, mediaKind } from '@/utils/media';

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
  onReact: (type: ReactionType) => void;
  onReply?: () => void;
};

export const LiveBubble = memo(function LiveBubble({
  post,
  currentUserId,
  highlighted,
  quote,
  reactions,
  onReact,
  onReply,
}: LiveBubbleProps) {
  const lightbox = useMediaLightboxOptional();
  const { authorId: uid, name } = resolveLiveAuthor({
    ...post,
    user_id: (post as { user_id?: string | null }).user_id,
  });
  const mine = Boolean(currentUserId && uid && currentUserId === uid);
  const checkin = isLiveCheckinPost(post);
  const visuals = liveVisualUrls(post, mine);
  const time = formatLiveClock(post.created_at);
  const caption = checkin
    ? checkinExtraCaption(post.content, null)
    : liveChatText(post.content, post.media_urls);
  const items: LightboxItem[] = visuals.map((uri) => ({
    uri,
    label: mediaKind(uri) === 'video' ? 'Video' : 'Photo',
  }));
  const alignEnd = mine && !checkin;

  function openProof(index = 0) {
    if (!lightbox || items.length === 0) {
      return;
    }
    lightbox.openLightbox(items, index);
  }

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
      <View
        className="flex-row items-end"
        style={{
          gap: 8,
          maxWidth: checkin ? '100%' : '86%',
          alignSelf: alignEnd ? 'flex-end' : 'flex-start',
        }}>
        {alignEnd ? null : (
          <ProfileLink username={post.author?.username} userId={uid}>
            <Avatar uri={post.author?.avatar_url} name={name} size={28} />
          </ProfileLink>
        )}
        <View style={{ flexShrink: 1, minWidth: 0, alignItems: alignEnd ? 'flex-end' : 'flex-start' }}>
          {alignEnd ? null : (
            <AppText className="mb-0.5 text-[11px] font-semibold" style={{ color: THEME.textMuted }}>
              {name}
            </AppText>
          )}
          {quote && !checkin ? <LiveQuoteChip quote={quote} mine={alignEnd} /> : null}
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
          <View style={{ marginTop: 2, alignSelf: alignEnd ? 'flex-end' : 'flex-start' }}>
            <LiveReactions
              reactions={reactions ?? post.reactions}
              currentUserId={currentUserId}
              onReact={onReact}
              onReply={onReply}
            />
          </View>
        </View>
      </View>
    </View>
  );
});

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
