import { memo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';

import { useVideoPoster } from '@/hooks/useVideoPoster';

import { ChallengeInviteCard } from '@/components/challenge/ChallengeInviteCard';
import { AudienceIconButton } from '@/components/feed/AudienceSheet';
import { CommentThread } from '@/components/feed/CommentThread';
import { InlineComposer } from '@/components/feed/InlineComposer';
import { useMediaLightboxOptional } from '@/components/feed/MediaLightbox';
import { MentionText } from '@/components/feed/MentionText';
import { QuoteEmbed } from '@/components/feed/QuoteEmbed';
import { ReactionBar } from '@/components/feed/ReactionBar';
import { OfficialMark } from '@/components/profile/OfficialMark';
import { ProfileLink } from '@/components/profile/ProfileLink';
import {
  useOverflowMenuOpen,
  useSocialSheetsOptional,
} from '@/components/social/SocialSheets';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useChallengeFeedPreview, useChallengeShareState } from '@/hooks/useChallenge';
import { useOpenChallengeFromTag } from '@/hooks/useOpenChallengeFromTag';
import { usePost, useUpdatePostAudience } from '@/hooks/useFeed';
import { checkinCardCaption, isCheckinPost, postLocality } from '@/lib/checkinPost';
import { LocationVenueLine } from '@/components/challenge/LocationProofRow';
import { PROOF_META } from '@/lib/constants';
import { useHidePostFromHome } from '@/hooks/usePostEdit';
import { WebTapButton } from '@/components/ui/WebTapButton';
import { postHref } from '@/lib/postShare';
import { asQuoteSnapshot } from '@/lib/quotePost';
import { asPostAudience } from '@/lib/postAudience';
import {
  clipShareKind,
  isClipSharePost,
  isRoundSharePost,
  reelIdFromShare,
  storyIdFromShare,
  roundShareClipUnavailable,
} from '@/lib/roundShare';
import { roundHref, waveHref } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { copy } from '@/lib/copy';
import { OFFICIAL_BOB_ID } from '@/lib/official';
import { flexChildMin, THEME } from '@/lib/theme';
import type { PostWithMeta, ReactionType } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { displayUrl, mediaKind } from '@/utils/media';
import { formatFeedTime } from '@/utils/format';

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
  homeFeed?: boolean;
};

function PostCardInner({
  post,
  currentUserId,
  hideAudience,
  challengeFeed,
  onReact,
  onComment,
  commenting,
  highlighted,
  homeFeed,
}: PostCardProps) {
  const [showComposer, setShowComposer] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const social = useSocialSheetsOptional();
  const menuOpen = useOverflowMenuOpen(post.id);
  const router = useRouter();
  const moreRef = useRef<View>(null);
  const updateAudience = useUpdatePostAudience();

  const name = post.author?.display_name ?? post.author?.username ?? 'blob';
  const handle = post.author?.username ?? 'blob';
  const comments = post.comments ?? [];
  const audience = asPostAudience(post.audience);
  const content = post.content?.trim() ?? '';
  const quote = asQuoteSnapshot(post.quote_snapshot);
  const shareParentId = isClipSharePost(post) ? post.parent_id ?? post.quoted_post_id : null;
  const parentRound = usePost(shareParentId);
  const shareUnavailable =
    isClipSharePost(post) &&
    !parentRound.isLoading &&
    (roundShareClipUnavailable(parentRound.data) || !parentRound.data);
  const shareKind = clipShareKind(post);
  const shareClipId =
    shareKind === 'wave'
      ? storyIdFromShare(post) ?? shareParentId ?? null
      : reelIdFromShare(post) ?? shareParentId ?? null;
  const canExpand =
    content.length > BODY_COLLAPSE_CHARS || content.split('\n').length > BODY_COLLAPSE_LINES;
  const checkin = isCheckinPost(post);
  const hideHome = useHidePostFromHome();
  const mine = Boolean(currentUserId && currentUserId === post.author_id);
  const tagged = Boolean(post.challenge_id);
  const hidePromoCard =
    Boolean(challengeFeed) ||
    checkin ||
    post.source === 'challenge' ||
    post.source === 'checkin';
  const preview = useChallengeFeedPreview(tagged ? post.challenge_id : undefined);
  const previewRow = preview.data?.id === post.challenge_id ? preview.data : null;
  const challengeTitle = previewRow ? challengeDisplayTitle(previewRow) : null;
  const city = postLocality(post);
  const caption = checkin ? checkinCardCaption(content, challengeTitle, post.edited_at) : content;
  const showInLine = Boolean(tagged && !challengeFeed && hidePromoCard);
  const hiddenFromHome = Boolean(post.hidden_from_home);
  const mutedOwnerHome = mine && hiddenFromHome && !challengeFeed;
  const hideOnRail = Boolean(homeFeed && mine && !challengeFeed);
  const officialOnHome = !homeFeed || isHomeOfficialAuthor(post.author);

  function toggleHomeHide() {
    hideHome.mutate(
      { postId: post.id, hidden: !hiddenFromHome },
      { onError: (error) => Alert.alert('Couldn’t hide that', getErrorMessage(error)) },
    );
  }

  return (
    <Card
      padded={false}
      style={{
        paddingHorizontal: homeFeed ? 12 : 15,
        paddingVertical: homeFeed ? 10 : 15,
        borderRadius: THEME.radius,
        borderWidth: highlighted ? 1.5 : 1,
        borderColor: highlighted ? THEME.accent : THEME.border,
        overflow: 'visible',
      }}>
      <View className="flex-row items-center" style={{ gap: homeFeed ? 6 : 10 }}>
        <ProfileLink username={post.author?.username} userId={post.author_id}>
          <Avatar uri={post.author?.avatar_url} name={name} size={homeFeed ? 32 : 42} />
        </ProfileLink>
        <View className="flex-1 justify-center" style={flexChildMin()}>
          <ProfileLink
            username={post.author?.username}
            userId={post.author_id}
            style={[flexChildMin(), { maxWidth: '100%' }]}>
            <View
              className="flex-row items-center"
              style={[{ gap: homeFeed ? 4 : 6, flexWrap: homeFeed ? 'nowrap' : 'wrap' }, flexChildMin()]}>
              <AppText
                className="font-semibold text-charcoal"
                style={{
                  fontSize: homeFeed ? 13 : 16,
                  lineHeight: homeFeed ? 16 : 20,
                  minWidth: 0,
                  flexShrink: 1,
                }}
                numberOfLines={homeFeed ? 1 : 2}>
                {name}
              </AppText>
              {officialOnHome ? <OfficialMark profile={post.author} compact /> : null}
              <AppText
                style={{
                  fontSize: 11,
                  color: THEME.textMuted,
                  lineHeight: 14,
                  flexShrink: 0,
                }}
                numberOfLines={1}>
                {formatFeedTime(post.created_at)}
              </AppText>
            </View>
          </ProfileLink>
        </View>
        {hideAudience || post.checkin_id ? null : currentUserId && currentUserId === post.author_id ? (
          <AudienceIconButton
            audience={audience}
            onPress={() =>
              social?.openAudience({
                audience,
                audienceUserIds: post.audience_user_ids ?? [],
                profileOnly: true,
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
        {hideOnRail ? (
          <WebTapButton
            accessibilityLabel={
              hiddenFromHome ? copy('post.unhideOnHome') : copy('post.hideFromHome')
            }
            onPress={toggleHomeHide}
            style={{ height: 44, width: 36, minWidth: 36, minHeight: 44, flexShrink: 0 }}>
            <Glyph
              name={GLYPH.hide}
              color={hiddenFromHome ? THEME.accent : THEME.textMuted}
              size={16}
            />
          </WebTapButton>
        ) : null}
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
      {showInLine && post.challenge_id ? (
        <View className="flex-row flex-wrap items-center" style={{ gap: 8, marginTop: homeFeed ? 2 : 6, minWidth: 0 }}>
          <View style={[flexChildMin(), { flexGrow: 1, flexShrink: 1, minWidth: 140 }]}>
            <InChallengeLine
              challengeId={post.challenge_id}
              title={challengeTitle}
              visibility={previewRow?.visibility}
              challengeLane={previewRow?.challenge_lane}
              isOfficial={previewRow?.is_official}
              createdBy={previewRow?.created_by}
              snapshot={previewRow}
            />
          </View>
          {!hideOnRail && mine && hiddenFromHome ? (
            <WebTapButton
              accessibilityLabel={copy('post.unhideOnHome')}
              onPress={toggleHomeHide}
              style={{
                height: 28,
                minHeight: 28,
                paddingHorizontal: 8,
                borderRadius: 999,
                backgroundColor: THEME.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
              <AppText className="text-[11px] font-semibold" style={{ color: THEME.accent }}>
                {copy('post.hiddenFromHome')}
              </AppText>
            </WebTapButton>
          ) : null}
          {!hideOnRail && mine && !challengeFeed ? (
            <WebTapButton
              accessibilityLabel={
                hiddenFromHome ? copy('post.unhideOnHome') : copy('post.hideFromHome')
              }
              onPress={toggleHomeHide}
              style={{ height: 44, width: 44, minWidth: 44, minHeight: 44, flexShrink: 0 }}>
              <Glyph name={GLYPH.hide} color={THEME.textMuted} size={16} />
            </WebTapButton>
          ) : null}
        </View>
      ) : (post.wall_host && !challengeFeed) || (!hideOnRail && mine && !challengeFeed) || (!hideOnRail && mine && hiddenFromHome) ? (
        <View className="flex-row flex-wrap items-center" style={{ gap: 8, marginTop: homeFeed ? 2 : 4, minWidth: 0 }}>
          {post.wall_host && !challengeFeed ? (
            <WallHostLine host={post.wall_host} />
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {!hideOnRail && mine && hiddenFromHome ? (
            <WebTapButton
              accessibilityLabel={copy('post.unhideOnHome')}
              onPress={toggleHomeHide}
              style={{
                height: 28,
                minHeight: 28,
                paddingHorizontal: 8,
                borderRadius: 999,
                backgroundColor: THEME.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
              <AppText className="text-[11px] font-semibold" style={{ color: THEME.accent }}>
                {copy('post.hiddenFromHome')}
              </AppText>
            </WebTapButton>
          ) : null}
          {!hideOnRail && mine && !challengeFeed ? (
            <WebTapButton
              accessibilityLabel={
                hiddenFromHome ? copy('post.unhideOnHome') : copy('post.hideFromHome')
              }
              onPress={toggleHomeHide}
              style={{ height: 44, width: 44, minWidth: 44, minHeight: 44, flexShrink: 0 }}>
              <Glyph name={GLYPH.hide} color={THEME.textMuted} size={16} />
            </WebTapButton>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: homeFeed ? 6 : 10, marginTop: homeFeed ? 2 : 6, opacity: mutedOwnerHome ? 0.45 : 1 }}>
        {caption ? (
          <PostBody
            content={caption}
            mentions={post.mentions}
            expanded={expanded}
            compact={homeFeed || !challengeFeed}
            canExpand={
              checkin
                ? caption.length > BODY_COLLAPSE_CHARS ||
                  caption.split('\n').length > BODY_COLLAPSE_LINES
                : canExpand
            }
            onToggle={() => setExpanded((value) => !value)}
          />
        ) : null}

        {post.edited_at ? (
          <Pressable
            accessibilityRole={currentUserId === post.author_id ? 'button' : undefined}
            accessibilityLabel={copy('post.edited')}
            disabled={currentUserId !== post.author_id}
            onPress={() => social?.openHistory(post)}
            hitSlop={6}
            style={{ alignSelf: 'flex-start' }}>
            <AppText className="text-[11px] font-semibold" style={{ color: THEME.textMuted }}>
              {copy('post.edited')}
            </AppText>
          </Pressable>
        ) : null}

        {city ? <LocationVenueLine place={city} compact /> : null}

        {post.challenge_id && !hidePromoCard ? (
          <ChallengeShareCard
            challengeId={post.challenge_id}
            author={
              post.author
                ? {
                    id: post.author.id,
                    name,
                    avatarUrl: post.author.avatar_url,
                  }
                : null
            }
          />
        ) : null}

        {isClipSharePost(post) ? (
          <RoundShareEmbed
            coverUrl={quote?.media_preview_url ?? parentRound.data?.media_urls?.[0] ?? null}
            unavailable={Boolean(shareUnavailable)}
            onPress={
              shareUnavailable || !shareClipId
                ? undefined
                : () =>
                    router.push(
                      shareKind === 'wave' ? waveHref(shareClipId) : roundHref(shareClipId),
                    )
            }
          />
        ) : quote ? (
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

        {isClipSharePost(post) ? null : <ProofMedia urls={post.media_urls ?? []} proof={checkin} />}

        <ReactionBar
          createdAt={homeFeed ? undefined : post.created_at}
          reactions={post.reactions}
          currentUserId={currentUserId}
          commentCount={comments.length}
          onReact={(type) => onReact(type)}
          onShare={(anchor) => social?.openShare(post, anchor)}
          onReply={
            onComment
              ? () => {
                  setShowComposer((open) => !open);
                  setComposerExpanded(true);
                }
              : undefined
          }
        />

        {showComposer && onComment ? (
          <View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close comments"
              onPress={() => setShowComposer(false)}
              style={{
                position: 'absolute',
                top: -900,
                right: -24,
                bottom: 0,
                left: -24,
                zIndex: 0,
              }}
            />
            <View style={{ zIndex: 1 }}>
              <InlineComposer
                placeholder="Write a reply…"
                submitting={commenting}
                audience={audience}
                audienceUserIds={post.audience_user_ids ?? []}
                expanded={composerExpanded}
                onExpandedChange={setComposerExpanded}
                replyTo={
                  post.author
                    ? {
                        userId: post.author_id,
                        username: handle,
                        label: name,
                      }
                    : null
                }
                onSubmit={async (text, mentionedUserIds) => {
                  try {
                    await onComment(text, null, mentionedUserIds);
                    setComposerExpanded(true);
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
                  onReply={onComment ?? (async () => undefined)}
                  onReact={(commentId, type) => onReact(type, commentId)}
                />
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

export const PostCard = memo(PostCardInner);

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

function InChallengeLine({
  challengeId,
  title,
  visibility,
  challengeLane,
  isOfficial,
  createdBy,
  snapshot,
}: {
  challengeId: string;
  title?: string | null;
  visibility?: string | null;
  challengeLane?: string | null;
  isOfficial?: boolean | null;
  createdBy?: string | null;
  snapshot?: {
    id?: string | null;
    title?: string | null;
    task?: string | null;
    tasks?: Array<{ title?: string | null } | string> | null;
    cover_image_url?: string | null;
    prize_pool?: number | null;
    buy_in_amount?: number | null;
    days_required?: number | null;
    target_count?: number | null;
    starts_at?: string | null;
    ends_at?: string | null;
    visibility?: string | null;
    challenge_lane?: unknown;
    is_official?: boolean | null;
    created_by?: string | null;
  } | null;
}) {
  const openTag = useOpenChallengeFromTag();
  const label = title?.trim() || 'this challenge';
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`in ${label}`}
      onPress={() =>
        void openTag({
          challengeId,
          visibility,
          challenge_lane: challengeLane,
          is_official: isOfficial,
          created_by: createdBy,
          snapshot: snapshot
            ? { ...snapshot, id: challengeId, title: snapshot.title ?? title }
            : { id: challengeId, title, visibility, challenge_lane: challengeLane, is_official: isOfficial, created_by: createdBy },
        })
      }
      hitSlop={4}
      className="flex-row items-start"
      style={{ minWidth: 0, maxWidth: '100%', flex: 1 }}>
      <AppText
        className="text-[13px] leading-5"
        style={{ color: THEME.textMuted, flexShrink: 0 }}>
        in{' '}
      </AppText>
      <AppText
        numberOfLines={2}
        ellipsizeMode="tail"
        className="text-[13px] font-semibold leading-5"
        style={{
          color: THEME.accent,
          fontWeight: '600',
          flex: 1,
          flexShrink: 1,
          minWidth: 0,
        }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function WallHostLine({
  host,
}: {
  host: { id?: string | null; username?: string | null; display_name?: string | null; avatar_url?: string | null };
}) {
  const name = host.display_name?.trim() || host.username?.trim();
  if (!host.id && !host.username) {
    return (
      <AppText className="flex-1 text-[13px] leading-5" style={{ color: THEME.textMuted }} numberOfLines={2}>
        {copy('wall.onHost', 'neutral', { name: name || 'this blob' })}
      </AppText>
    );
  }
  return (
    <ProfileLink
      username={host.username}
      userId={host.id}
      style={[flexChildMin(), { flex: 1, minWidth: 0 }]}>
      <View className="flex-row flex-wrap items-center" style={{ gap: 6, minWidth: 0 }}>
        <AppText className="text-[13px] leading-5" style={{ color: THEME.textMuted, flexShrink: 0 }}>
          {copy('wall.to')}
        </AppText>
        <Avatar uri={host.avatar_url} name={name || 'blob'} size={28} />
        <AppText
          className="font-semibold text-charcoal"
          style={{ fontSize: 14, lineHeight: 18, minWidth: 0, flexShrink: 1 }}
          numberOfLines={2}>
          {name || 'blob'}
        </AppText>
      </View>
    </ProfileLink>
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

function ChallengeShareCard({
  challengeId,
  author,
}: {
  challengeId: string;
  author?: { id: string; name: string; avatarUrl?: string | null } | null;
}) {
  const openTag = useOpenChallengeFromTag();
  const share = useChallengeShareState(challengeId);
  const preview = useChallengeFeedPreview(challengeId);
  const card = preview.data?.id === challengeId ? preview.data : null;
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
      snapshot: card,
    });
  if (card) {
    const host =
      author && card.created_by && author.id === card.created_by
        ? { name: author.name, avatarUrl: author.avatarUrl }
        : null;
    return (
      <View className="mt-3">
        <ChallengeInviteCard
          challenge={card}
          theme={card.is_official ? 'official' : 'user'}
          context="feed"
          host={host}
          onPress={open}
        />
      </View>
    );
  }
  if (share.data?.reason === 'ok') {
    return <ChallengeTitleLink challengeId={challengeId} title={share.data.title} />;
  }
  return null;
}

function isHomeOfficialAuthor(
  author?: { id?: string | null; is_official?: boolean | null; username?: string | null } | null,
) {
  if (!author) {
    return false;
  }
  if (author.is_official || author.id === OFFICIAL_BOB_ID) {
    return true;
  }
  return String(author.username ?? '').trim().toLowerCase() === 'blob';
}

function PostBody({
  content,
  mentions,
  expanded,
  canExpand,
  onToggle,
  compact,
}: {
  content: string;
  mentions?: PostWithMeta['mentions'];
  expanded: boolean;
  canExpand: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  return (
    <View>
      <MentionText
        content={content}
        mentions={mentions}
        numberOfLines={expanded ? undefined : BODY_COLLAPSE_LINES}
        className={compact ? 'text-[12px] leading-[16px] text-ink' : undefined}
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
  PROOF_META.distance.short,
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
          cachePolicy="memory-disk"
          recyclingKey={uri}
        />
      )}
    </Pressable>
  );
}

function PostVideo({ uri }: { uri: string }) {
  const [playing, setPlaying] = useState(false);
  const poster = useVideoPoster(uri);
  if (!playing) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Play video"
        onPress={() => setPlaying(true)}
        style={{
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: THEME.primary,
          overflow: 'hidden',
        }}>
        {poster ? (
          <Image
            source={{ uri: poster }}
            contentFit="cover"
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
        ) : null}
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(16,19,18,0.55)',
          }}>
          <Glyph name={GLYPH.play} color="#fff" size={18} />
        </View>
      </Pressable>
    );
  }
  return <PostVideoPlayer uri={uri} />;
}

function PostVideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%', backgroundColor: THEME.surface, overflow: 'hidden' }}
      contentFit="contain"
      nativeControls
    />
  );
}

function RoundShareEmbed({
  coverUrl,
  unavailable,
  onPress,
}: {
  coverUrl?: string | null;
  unavailable: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'none'}
      accessibilityLabel={unavailable ? copy('round.gone') : copy('round.noun')}
      disabled={!onPress}
      onPress={onPress}
      style={{
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: THEME.primary,
        borderWidth: 1,
        borderColor: THEME.border,
      }}>
      <View
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 2,
          borderRadius: 999,
          backgroundColor: THEME.accentSoft,
          paddingHorizontal: 10,
          paddingVertical: 4,
        }}>
        <AppText className="text-[11px] font-extrabold" style={{ color: THEME.accent }}>
          {copy('round.noun')}
        </AppText>
      </View>
      {unavailable ? (
        <View style={{ minHeight: 160, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <AppText className="text-center text-[14px] font-bold" style={{ color: '#fff' }}>
            {copy('round.gone')}
          </AppText>
        </View>
      ) : coverUrl ? (
        <Image
          source={{ uri: coverUrl }}
          style={{ width: '100%', height: 200 }}
          contentFit="contain"
        />
      ) : (
        <View style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}>
          <AppText className="text-[14px] font-bold" style={{ color: '#fff' }}>
            {copy('round.noun')}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

function ProofMedia({
  urls,
  proof,
}: {
  urls: string[];
  proof?: boolean;
}) {
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
    <View style={{ gap: 6 }}>
      {visuals.length === 1 ? (
        <MediaFrame
          uri={visuals[0]}
          height={SINGLE_IMAGE_HEIGHT}
          radius={14}
          onPress={lightbox ? () => openAt(0) : undefined}
        />
      ) : visuals.length > 1 ? (
        <View style={{ gap: 6 }}>
          {chunk(visuals, columns).map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} className="flex-row" style={{ gap: 6 }}>
              {row.map((uri, index) => {
                const itemIndex = rowIndex * columns + index;
                return (
                  <View key={`${uri}-${itemIndex}`} className="flex-1">
                    <MediaFrame
                      uri={uri}
                      height={TILE_HEIGHT}
                      radius={12}
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
