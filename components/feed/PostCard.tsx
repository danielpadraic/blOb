import { useRef, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';

import { ChallengeFeedCard } from '@/components/feed/ChallengeFeedCard';
import { AudienceIconButton } from '@/components/feed/AudienceSheet';
import { CommentThread } from '@/components/feed/CommentThread';
import { InlineComposer } from '@/components/feed/InlineComposer';
import { useMediaLightboxOptional } from '@/components/feed/MediaLightbox';
import { MentionText } from '@/components/feed/MentionText';
import { QuoteEmbed } from '@/components/feed/QuoteEmbed';
import { ReactionBar } from '@/components/feed/ReactionBar';
import { OfficialMark } from '@/components/profile/OfficialMark';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { useSocialSheetsOptional } from '@/components/social/SocialSheets';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useChallengeFeedPreview, useChallengeShareState } from '@/hooks/useChallenge';
import { useOpenChallengeFromTag } from '@/hooks/useOpenChallengeFromTag';
import { useUpdatePostAudience } from '@/hooks/useFeed';
import { checkinExtraCaption, isCheckinPost, postLocality } from '@/lib/checkinPost';
import { PROOF_META } from '@/lib/constants';
import { postHref } from '@/lib/postShare';
import { asQuoteSnapshot } from '@/lib/quotePost';
import { asPostAudience } from '@/lib/postAudience';
import { supabase } from '@/lib/supabase';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import type { PostWithMeta, ReactionType } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { formatFeedTime } from '@/utils/format';
import { displayUrl, mediaKind } from '@/utils/media';

const BODY_COLLAPSE_LINES = 4;
const BODY_COLLAPSE_CHARS = 160;

type PostCardProps = {
  post: PostWithMeta;
  currentUserId?: string;
  hideAudience?: boolean;
  challengeFeed?: boolean;
  onReact: (type: ReactionType, commentId?: string | null) => void;
  onComment?: (
    content: string,
    parentId?: string | null,
    mentionedUserIds?: string[],
  ) => Promise<unknown> | void;
  commenting?: boolean;
  highlighted?: boolean;
};

export function PostCard({
  post,
  currentUserId,
  hideAudience,
  challengeFeed,
  onReact,
  onComment,
  commenting,
  highlighted,
}: PostCardProps) {
  const [showComposer, setShowComposer] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const social = useSocialSheetsOptional();
  const router = useRouter();
  const moreRef = useRef<View>(null);
  const updateAudience = useUpdatePostAudience();

  const name = post.author?.display_name ?? post.author?.username ?? 'blob';
  const handle = post.author?.username ?? 'blob';
  const comments = post.comments ?? [];
  const audience = asPostAudience(post.audience);
  const content = post.content?.trim() ?? '';
  const quote = asQuoteSnapshot(post.quote_snapshot);
  const canExpand =
    content.length > BODY_COLLAPSE_CHARS || content.split('\n').length > BODY_COLLAPSE_LINES;
  const menuOpen = Boolean(social?.isOpenFor(post.id));
  const checkin = isCheckinPost(post);
  const tagged = Boolean(post.challenge_id);
  const hidePromoCard =
    Boolean(challengeFeed) ||
    checkin ||
    post.source === 'challenge' ||
    post.source === 'checkin';
  const preview = useChallengeFeedPreview(tagged ? post.challenge_id : undefined);
  const challengeTitle = preview.data?.title?.trim() || null;
  const city = postLocality(post);
  const caption = checkin ? checkinExtraCaption(content, challengeTitle) : content;
  const attribution = `@${handle} · ${formatFeedTime(post.created_at)}${
    post.wall_host
      ? ` · ${copy('wall.onHost', 'neutral', {
          name: post.wall_host.display_name?.trim() || post.wall_host.username || 'this blob',
        })}`
      : ''
  }`;

  return (
    <Card
      padded={false}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderWidth: highlighted ? 1.5 : 0,
        borderColor: highlighted ? THEME.accent : 'transparent',
      }}>
      <View className="flex-row items-start gap-2.5">
        <ProfileLink username={post.author?.username} userId={post.author_id}>
          <Avatar uri={post.author?.avatar_url} name={name} size={42} radius={14} />
        </ProfileLink>

        <View className="min-w-0 flex-1 gap-2">
          <View className="flex-row items-start gap-2">
            <View className="min-w-0 flex-1">
              <ProfileLink username={post.author?.username} userId={post.author_id}>
                <View className="flex-row items-center gap-1">
                  <AppText className="text-[14px] font-extrabold leading-5 text-charcoal" numberOfLines={1}>
                    {name}
                  </AppText>
                  <OfficialMark profile={post.author} compact />
                </View>
              </ProfileLink>
              <AppText className="text-[11px] leading-4 text-muted" numberOfLines={2}>
                {attribution}
              </AppText>
            </View>
            {hideAudience || post.checkin_id ? null : currentUserId && currentUserId === post.author_id ? (
              <AudienceIconButton
                audience={audience}
                onPress={() =>
                  social?.openAudience({
                    audience,
                    audienceUserIds: post.audience_user_ids ?? [],
                    onSave: async (next, ids) => {
                      await updateAudience.mutateAsync({
                        postId: post.id,
                        audience: next,
                        audienceUserIds: ids,
                      });
                    },
                  })
                }
              />
            ) : (
              <AudienceIconButton audience={audience} />
            )}
            {post.challenge_id && currentUserId && currentUserId !== post.author_id ? (
              <ProofFlagButton postId={post.id} />
            ) : null}
            <Pressable
              ref={moreRef}
              accessibilityRole="button"
              accessibilityLabel="Post menu"
              accessibilityState={{ expanded: menuOpen }}
              hitSlop={8}
              collapsable={false}
              onPress={() => {
                moreRef.current?.measureInWindow((x, y, width, height) => {
                  social?.toggleOverflow(post, { x, y, width, height });
                });
              }}
              className="h-11 w-11 items-center justify-center">
              <Glyph name={GLYPH.more} color={THEME.textMuted} size={16} />
            </Pressable>
          </View>

          {checkin && !challengeFeed && post.challenge_id ? (
            <CheckinTagLine
              challengeId={post.challenge_id}
              title={challengeTitle}
              visibility={preview.data?.visibility}
              challengeLane={preview.data?.challenge_lane}
              isOfficial={preview.data?.is_official}
              createdBy={preview.data?.created_by}
            />
          ) : null}

          {caption ? (
            <PostBody
              content={caption}
              mentions={post.mentions}
              expanded={expanded}
              canExpand={
                checkin
                  ? caption.length > BODY_COLLAPSE_CHARS ||
                    caption.split('\n').length > BODY_COLLAPSE_LINES
                  : canExpand
              }
              onToggle={() => setExpanded((value) => !value)}
            />
          ) : null}

          {city ? (
            <AppText className="text-[12px] leading-4" style={{ color: THEME.textMuted }}>
              {city}
            </AppText>
          ) : null}

          {post.challenge_id && !hidePromoCard ? (
            <ChallengeShareCard challengeId={post.challenge_id} />
          ) : null}

          {quote ? (
            <QuoteEmbed
              snapshot={quote}
              audience={quote.audience ?? post.audience}
              onPress={() => {
                if (post.quoted_post_id) {
                  router.push(postHref(post.quoted_post_id));
                }
              }}
            />
          ) : null}

          <ProofMedia urls={post.media_urls ?? []} proof={checkin} />

          <ReactionBar
            reactions={post.reactions}
            currentUserId={currentUserId}
            commentCount={comments.length}
            onReact={(type) => onReact(type)}
            onReply={onComment ? () => setShowComposer((value) => !value) : undefined}
            onShare={(anchor) => social?.openShare(post, anchor)}
          />

          {showComposer && onComment ? (
            <InlineComposer
              placeholder="Write a reply…"
              submitting={commenting}
              audience={audience}
              audienceUserIds={post.audience_user_ids ?? []}
              onSubmit={async (text, mentionedUserIds) => {
                try {
                  await onComment(text, null, mentionedUserIds);
                  setShowComposer(false);
                } catch (error) {
                  Alert.alert('Couldn’t post that reply', getErrorMessage(error));
                }
              }}
            />
          ) : null}

          {comments.length > 0 ? (
            <View
              style={{
                backgroundColor: THEME.surface2,
                borderRadius: 14,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}>
              <CommentThread
                comments={comments}
                currentUserId={currentUserId}
                composing={commenting}
                onReply={onComment ?? (async () => undefined)}
                onReact={(commentId, type) => onReact(type, commentId)}
              />
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function ProofFlagButton({ postId }: { postId: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onFlag() {
    if (busy || done) {
      return;
    }
    Alert.alert(copy('proof.flag'), copy('proof.flagReason'), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Flag',
        style: 'destructive',
        onPress: () => {
          void runFlag();
        },
      },
    ]);
  }

  async function runFlag() {
    if (busy || done) {
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('flag_challenge_proof', {
        p_post_id: postId,
        p_reason: copy('proof.flagReason'),
      });
      if (error) {
        throw error;
      }
      setDone(true);
    } catch (error) {
      Alert.alert('Couldn’t flag that', getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={done ? copy('proof.flagged') : copy('proof.flag')}
      disabled={busy || done}
      hitSlop={8}
      onPress={() => void onFlag()}
      className="h-7 w-7 items-center justify-center">
      <Glyph name={GLYPH.flag} color={done ? THEME.danger : THEME.textMuted} size={15} />
    </Pressable>
  );
}

function CheckinTagLine({
  challengeId,
  title,
  visibility,
  challengeLane,
  isOfficial,
  createdBy,
}: {
  challengeId: string;
  title?: string | null;
  visibility?: string | null;
  challengeLane?: string | null;
  isOfficial?: boolean | null;
  createdBy?: string | null;
}) {
  const openTag = useOpenChallengeFromTag();
  const label = title?.trim() || 'Challenge';
  return (
    <View className="flex-row flex-wrap items-center">
      <AppText className="text-[14px] leading-5" style={{ color: THEME.textMuted }}>
        {copy('feed.checkedIn')}{' '}
      </AppText>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`@${label}`}
        onPress={() =>
          void openTag({
            challengeId,
            visibility,
            challenge_lane: challengeLane,
            is_official: isOfficial,
            created_by: createdBy,
          })
        }
        hitSlop={4}>
        <AppText className="text-[14px] font-semibold leading-5" style={{ color: THEME.accent }}>
          @{label}
        </AppText>
      </Pressable>
    </View>
  );
}

function ChallengeTitleLink({
  challengeId,
  title,
  visibility,
  challengeLane,
  isOfficial,
  createdBy,
}: {
  challengeId: string;
  title?: string | null;
  visibility?: string | null;
  challengeLane?: string | null;
  isOfficial?: boolean | null;
  createdBy?: string | null;
}) {
  const openTag = useOpenChallengeFromTag();
  return (
    <AppText
      accessibilityRole="link"
      onPress={() =>
        void openTag({
          challengeId,
          visibility,
          challenge_lane: challengeLane,
          is_official: isOfficial,
          created_by: createdBy,
        })
      }
      className="text-[14px] font-extrabold leading-5"
      style={{ color: THEME.accent }}>
      {title?.trim() || 'View challenge'}
    </AppText>
  );
}

function GeoUnavailable() {
  return (
    <AppText className="mt-1 text-[13px] leading-5" style={{ color: THEME.textMuted }}>
      {copy('geo.unavailable')}
    </AppText>
  );
}

function ChallengeShareCard({ challengeId }: { challengeId: string }) {
  const openTag = useOpenChallengeFromTag();
  const share = useChallengeShareState(challengeId);
  const preview = useChallengeFeedPreview(challengeId);
  const card = preview.data;
  if (share.data?.reason === 'geo') {
    return <GeoUnavailable />;
  }
  if (share.data?.reason === 'hidden') {
    return null;
  }
  const open = () =>
    void openTag({
      challengeId,
      visibility: card?.visibility,
      challenge_lane: card?.challenge_lane,
      is_official: card?.is_official,
      created_by: card?.created_by,
    });
  if (card) {
    return <ChallengeFeedCard challenge={card} onPress={open} />;
  }
  if (share.data?.reason === 'ok') {
    return <ChallengeTitleLink challengeId={challengeId} title={share.data.title} />;
  }
  return null;
}

function PostBody({
  content,
  mentions,
  expanded,
  canExpand,
  onToggle,
}: {
  content: string;
  mentions?: PostWithMeta['mentions'];
  expanded: boolean;
  canExpand: boolean;
  onToggle: () => void;
}) {
  return (
    <View>
      <MentionText
        content={content}
        mentions={mentions}
        numberOfLines={expanded ? undefined : BODY_COLLAPSE_LINES}
      />
      {canExpand ? (
        <Pressable accessibilityRole="button" hitSlop={6} onPress={onToggle}>
          <AppText className="mt-0.5 text-[13px] font-semibold" style={{ color: THEME.accent }}>
            {expanded ? 'See less' : 'See more'}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const PROOF_LABELS = [
  PROOF_META.pre_selfie.short,
  PROOF_META.post_selfie.short,
  PROOF_META.hr_monitor.short,
];

const SINGLE_IMAGE_HEIGHT = 220;
const TILE_HEIGHT = 118;

function imageColumns(count: number) {
  if (count <= 1) {
    return 1;
  }
  if (count === 2) {
    return 2;
  }
  return 3;
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function MediaFrame({
  uri,
  height,
  radius,
  label,
  onPress,
}: {
  uri: string;
  height: number;
  radius: number;
  label?: string;
  onPress?: () => void;
}) {
  const kind = mediaKind(uri);
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label ? `Open ${label}` : 'Open photo'}
      disabled={!onPress}
      onPress={onPress}
      style={{
        height,
        width: '100%',
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: THEME.surface,
      }}>
      {kind === 'video' ? (
        <PostVideo uri={uri} />
      ) : (
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
          contentPosition="center"
          recyclingKey={uri}
        />
      )}
      {label ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 6,
            bottom: 6,
            backgroundColor: THEME.accentSoft,
            borderRadius: 8,
            paddingHorizontal: 7,
            paddingVertical: 3,
          }}>
          <AppText className="text-[9px] font-bold" style={{ color: THEME.accent }}>
            {label}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

function PostVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.muted = true;
  });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%', backgroundColor: THEME.surface }}
      contentFit="contain"
      nativeControls
    />
  );
}

function ProofMedia({ urls, proof }: { urls: string[]; proof?: boolean }) {
  const lightbox = useMediaLightboxOptional();
  const items = urls.filter(Boolean);
  if (items.length === 0) {
    return null;
  }

  const visuals = items.filter((url) => {
    const kind = mediaKind(url);
    return kind === 'image' || kind === 'video';
  });
  const others = items.filter((url) => {
    const kind = mediaKind(url);
    return kind !== 'image' && kind !== 'video';
  });
  const labels = proof || visuals.length === 3 ? PROOF_LABELS.slice(0, visuals.length) : undefined;
  const columns = imageColumns(visuals.length);
  const lightboxItems = visuals.map((uri, index) => ({
    uri,
    label: labels?.[index],
  }));

  function openAt(index: number) {
    lightbox?.openLightbox(lightboxItems, index);
  }

  return (
    <View className="gap-1.5">
      {visuals.length === 1 ? (
        <MediaFrame
          uri={visuals[0]}
          height={SINGLE_IMAGE_HEIGHT}
          radius={14}
          label={labels?.[0]}
          onPress={lightbox ? () => openAt(0) : undefined}
        />
      ) : visuals.length > 1 ? (
        <View className="gap-1.5">
          {chunk(visuals, columns).map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} className="flex-row gap-1.5">
              {row.map((uri, index) => {
                const itemIndex = rowIndex * columns + index;
                return (
                  <View key={`${uri}-${itemIndex}`} className="flex-1">
                    <MediaFrame
                      uri={uri}
                      height={TILE_HEIGHT}
                      radius={12}
                      label={labels?.[itemIndex]}
                      onPress={lightbox ? () => openAt(itemIndex) : undefined}
                    />
                  </View>
                );
              })}
              {row.length < columns
                ? Array.from({ length: columns - row.length }, (_, slot) => (
                    <View key={`pad-${slot}`} className="flex-1" />
                  ))
                : null}
            </View>
          ))}
        </View>
      ) : null}
      {others.map((url) => (
        <MediaChip key={url} url={url} />
      ))}
    </View>
  );
}

function MediaChip({ url }: { url: string }) {
  const kind = mediaKind(url);
  const label = kind === 'video' ? 'Video' : kind === 'file' ? 'Attachment' : displayUrl(url);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url)}
      className="flex-row items-center px-2.5 py-2"
      style={{
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: 12,
        backgroundColor: THEME.background,
      }}>
      <Glyph
        name={kind === 'video' ? GLYPH.play : kind === 'file' ? GLYPH.attach : GLYPH.link}
        color={THEME.accent}
        size={16}
      />
      <View className="w-2" />
      <AppText className="flex-1 text-[12px] font-semibold text-charcoal" numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}
