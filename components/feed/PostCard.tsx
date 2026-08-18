import { useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { CommentThread } from '@/components/feed/CommentThread';
import { InlineComposer } from '@/components/feed/InlineComposer';
import { QuoteEmbed } from '@/components/feed/QuoteEmbed';
import { ReactionBar } from '@/components/feed/ReactionBar';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { useSocialSheetsOptional } from '@/components/social/SocialSheets';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useChallenges } from '@/hooks/useChallenge';
import { PROOF_META } from '@/lib/constants';
import { postHref } from '@/lib/postShare';
import { asQuoteSnapshot } from '@/lib/quotePost';
import { challengeDetailHref } from '@/lib/routes';
import { audienceLabel, asPostAudience } from '@/lib/postAudience';
import { supabase } from '@/lib/supabase';
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
  onReact: (type: ReactionType, commentId?: string | null) => void;
  onComment?: (content: string, parentId?: string | null) => Promise<unknown> | void;
  commenting?: boolean;
};

export function PostCard({
  post,
  currentUserId,
  onReact,
  onComment,
  commenting,
}: PostCardProps) {
  const [showComposer, setShowComposer] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const social = useSocialSheetsOptional();
  const router = useRouter();

  const name = post.author?.display_name ?? post.author?.username ?? 'blob';
  const handle = post.author?.username ?? 'blob';
  const comments = post.comments ?? [];
  const audience = asPostAudience(post.audience);
  const content = post.content?.trim() ?? '';
  const quote = asQuoteSnapshot(post.quote_snapshot);
  const canExpand =
    content.length > BODY_COLLAPSE_CHARS || content.split('\n').length > BODY_COLLAPSE_LINES;
  const menuOpen = Boolean(social?.isOpenFor(post.id));

  return (
    <Card padded={false} style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
      <View className="flex-row items-start gap-2.5">
        <ProfileLink username={post.author?.username} userId={post.author_id}>
          <Avatar uri={post.author?.avatar_url} name={name} size={42} radius={14} />
        </ProfileLink>

        <View className="min-w-0 flex-1 gap-2">
          <View className="flex-row items-start gap-2">
            <View className="min-w-0 flex-1">
              <ProfileLink username={post.author?.username} userId={post.author_id}>
                <AppText className="text-[14px] font-extrabold leading-5 text-charcoal" numberOfLines={1}>
                  {name}
                </AppText>
              </ProfileLink>
              <AppText className="text-[11px] leading-4 text-muted" numberOfLines={1}>
                @{handle} · {formatFeedTime(post.created_at)} · {audienceLabel(audience)}
              </AppText>
            </View>
            {post.challenge_id && currentUserId && currentUserId !== post.author_id ? (
              <ProofFlagButton postId={post.id} />
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Post menu"
              accessibilityState={{ expanded: menuOpen }}
              hitSlop={8}
              onPress={() => social?.toggleOverflow(post)}
              className="h-7 w-7 items-center justify-center">
              <Glyph name={GLYPH.more} color={THEME.textMuted} size={16} />
            </Pressable>
          </View>

          {content ? (
            <PostBody
              content={content}
              challengeId={post.challenge_id}
              expanded={expanded}
              canExpand={canExpand}
              onToggle={() => setExpanded((value) => !value)}
            />
          ) : post.challenge_id && !quote ? (
            <ChallengeTitleLink challengeId={post.challenge_id} />
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

          <ProofMedia urls={post.media_urls ?? []} />

          <ReactionBar
            reactions={post.reactions}
            currentUserId={currentUserId}
            commentCount={comments.length}
            onReact={(type) => onReact(type)}
            onReply={onComment ? () => setShowComposer((value) => !value) : undefined}
            onShare={() => social?.openShare(post)}
          />

          {showComposer && onComment ? (
            <InlineComposer
              placeholder="Write a reply…"
              submitting={commenting}
              onSubmit={async (text) => {
                try {
                  await onComment(text, null);
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
    setBusy(true);
    try {
      const { error } = await supabase.rpc('flag_challenge_proof', { p_post_id: postId });
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
      accessibilityLabel={done ? 'Flagged' : 'Flag proof'}
      disabled={busy || done}
      hitSlop={8}
      onPress={() => void onFlag()}
      className="h-7 w-7 items-center justify-center">
      <Glyph name={GLYPH.flag} color={done ? THEME.danger : THEME.textMuted} size={15} />
    </Pressable>
  );
}

function ChallengeTitleLink({
  challengeId,
  title,
}: {
  challengeId: string;
  title?: string | null;
}) {
  const router = useRouter();
  return (
    <AppText
      accessibilityRole="link"
      onPress={() => router.push(challengeDetailHref(challengeId, 'feed'))}
      className="text-[14px] font-extrabold leading-5"
      style={{ color: THEME.accent }}>
      {title?.trim() || 'View challenge'}
    </AppText>
  );
}

function PostBody({
  content,
  challengeId,
  expanded,
  canExpand,
  onToggle,
}: {
  content: string;
  challengeId: string | null;
  expanded: boolean;
  canExpand: boolean;
  onToggle: () => void;
}) {
  const challenges = useChallenges();
  const title = challengeId
    ? challenges.data?.find((item) => item.id === challengeId)?.title
    : null;
  const matchIndex = title ? content.indexOf(title) : -1;

  return (
    <View>
      {challengeId && title && matchIndex >= 0 ? (
        <AppText
          className="text-[14px] leading-[20px] text-ink"
          numberOfLines={expanded ? undefined : BODY_COLLAPSE_LINES}>
          {content.slice(0, matchIndex)}
          <ChallengeTitleLink challengeId={challengeId} title={title} />
          {content.slice(matchIndex + title.length)}
        </AppText>
      ) : (
        <>
          <AppText
            className="text-[14px] leading-[20px] text-ink"
            numberOfLines={expanded ? undefined : BODY_COLLAPSE_LINES}>
            {content}
          </AppText>
          {challengeId ? (
            <View className="mt-1">
              <ChallengeTitleLink challengeId={challengeId} title={title} />
            </View>
          ) : null}
        </>
      )}
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

function CoverPhoto({
  uri,
  height,
  radius,
  label,
}: {
  uri: string;
  height: number;
  radius: number;
  label?: string;
}) {
  return (
    <View
      style={{
        height,
        width: '100%',
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: THEME.surface2,
      }}>
      <Image
        source={{ uri }}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        contentPosition="center"
        recyclingKey={uri}
      />
      {label ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 6,
            bottom: 6,
            backgroundColor: 'rgba(16, 19, 18, 0.72)',
            borderRadius: 999,
            paddingHorizontal: 7,
            paddingVertical: 3,
          }}>
          <AppText className="text-[9px] font-bold" style={{ color: '#fff' }}>
            {label}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function ProofMedia({ urls }: { urls: string[] }) {
  const items = urls.filter(Boolean);
  if (items.length === 0) {
    return null;
  }

  const images = items.filter((url) => mediaKind(url) === 'image');
  const others = items.filter((url) => mediaKind(url) !== 'image');
  const labels = images.length === 3 ? PROOF_LABELS : images.map((_, index) => String(index + 1));
  const columns = imageColumns(images.length);

  return (
    <View className="gap-1.5">
      {images.length === 1 ? (
        <CoverPhoto uri={images[0]} height={SINGLE_IMAGE_HEIGHT} radius={14} label={labels[0]} />
      ) : images.length > 1 ? (
        <View className="gap-1.5">
          {chunk(images, columns).map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} className="flex-row gap-1.5">
              {row.map((uri, index) => {
                const itemIndex = rowIndex * columns + index;
                return (
                  <View key={`${uri}-${itemIndex}`} className="flex-1">
                    <CoverPhoto
                      uri={uri}
                      height={TILE_HEIGHT}
                      radius={12}
                      label={labels[itemIndex]}
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
