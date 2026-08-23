import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { InlineComposer } from '@/components/feed/InlineComposer';
import { MentionText } from '@/components/feed/MentionText';
import { ReactionBar } from '@/components/feed/ReactionBar';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { Avatar } from '@/components/ui/Avatar';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
import type { CommentWithAuthor, ReactionType } from '@/lib/types';
import { nestComments } from '@/utils/comments';
import { getErrorMessage } from '@/utils/errors';
import { formatFeedTime } from '@/utils/format';
import { commentMediaUrls, commentTextWithoutMedia, mediaKind } from '@/utils/media';

const INDENT = 12;

type ReplyHandler = (
  content: string,
  parentId?: string | null,
  mentionedUserIds?: string[],
) => Promise<unknown> | void;

type CommentThreadProps = {
  comments: CommentWithAuthor[];
  currentUserId?: string;
  onReply: ReplyHandler;
  onReact?: (commentId: string, type: ReactionType) => void;
  composing?: boolean;
  audience?: string;
  audienceUserIds?: string[];
};

export function CommentThread({
  comments,
  currentUserId,
  onReply,
  onReact,
  composing,
  audience,
  audienceUserIds,
}: CommentThreadProps) {
  const [showAll, setShowAll] = useState(false);
  const roots = nestComments(comments);

  if (comments.length === 0) {
    return null;
  }

  const previewLimit = 3;
  const visibleRoots = showAll ? roots : roots.slice(0, previewLimit);
  const hiddenCount = roots.length - visibleRoots.length;

  return (
    <View className="gap-2">
      {hiddenCount > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => setShowAll(true)}>
          <AppText className="text-[13px] font-semibold text-muted">
            View all {comments.length} replies
          </AppText>
        </Pressable>
      ) : null}
      {visibleRoots.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          nested={false}
          currentUserId={currentUserId}
          composing={composing}
          onReply={onReply}
          onReact={onReact}
          audience={audience}
          audienceUserIds={audienceUserIds}
        />
      ))}
    </View>
  );
}

function CommentItem({
  comment,
  nested,
  currentUserId,
  composing,
  onReply,
  onReact,
  audience,
  audienceUserIds,
}: {
  comment: CommentWithAuthor;
  nested: boolean;
  currentUserId?: string;
  composing?: boolean;
  onReply: ReplyHandler;
  onReact?: (commentId: string, type: ReactionType) => void;
  audience?: string;
  audienceUserIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const name = comment.author?.display_name ?? comment.author?.username ?? 'blob';
  const handle = comment.author?.username ?? 'blob';
  const replies = comment.replies ?? [];
  const body = commentTextWithoutMedia(comment.content);
  const mediaUrls = commentMediaUrls(comment.content);

  return (
    <View
      className="gap-1.5"
      style={
        nested
          ? {
              marginLeft: INDENT,
              borderLeftWidth: 2,
              borderLeftColor: THEME.accentSoft,
              paddingLeft: 8,
            }
          : undefined
      }>
      <View className="flex-row gap-2">
        <ProfileLink username={comment.author?.username} userId={comment.author_id}>
          <Avatar uri={comment.author?.avatar_url} name={name} size={nested ? 20 : 24} />
        </ProfileLink>
        <View className="min-w-0 flex-1">
          <ProfileLink username={comment.author?.username} userId={comment.author_id}>
            <AppText className="text-[12px] font-semibold text-charcoal" numberOfLines={1}>
              {name}{' '}
              <AppText className="text-[11px] font-normal text-muted">@{handle}</AppText>
            </AppText>
          </ProfileLink>
          {body ? (
            <MentionText
              content={body}
              mentions={comment.mentions}
              className="text-[13px] leading-[18px] text-ink"
            />
          ) : null}
          <CommentMedia urls={mediaUrls} />
          <AppText className="mt-0.5 text-[11px] text-muted">{formatFeedTime(comment.created_at)}</AppText>
          <View className="mt-0.5">
            <ReactionBar
              compact
              reactions={comment.reactions}
              currentUserId={currentUserId}
              onReact={(type) => onReact?.(comment.id, type)}
              onReply={() => {
                if (!open) {
                  setOpen(true);
                  setExpanded(true);
                  return;
                }
                setExpanded((value) => !value);
              }}
            />
          </View>
        </View>
      </View>

      {open ? (
        <View style={{ marginLeft: 28, marginTop: 6 }}>
          <InlineComposer
            placeholder={`Reply to ${name}…`}
            submitting={composing}
            audience={audience}
            audienceUserIds={audienceUserIds}
            expanded={expanded}
            onExpandedChange={setExpanded}
            replyTo={{
              userId: comment.author_id,
              username: handle,
              label: name,
            }}
            onSubmit={async (text, mentionedUserIds) => {
              try {
                await onReply(text, comment.id, mentionedUserIds);
                setOpen(false);
                setExpanded(true);
              } catch (error) {
                Alert.alert('Couldn’t post that reply', getErrorMessage(error));
              }
            }}
          />
        </View>
      ) : null}

      {replies.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          nested
          currentUserId={currentUserId}
          composing={composing}
          onReply={onReply}
          onReact={onReact}
          audience={audience}
          audienceUserIds={audienceUserIds}
        />
      ))}
    </View>
  );
}

function CommentMedia({ urls }: { urls: string[] }) {
  if (urls.length === 0) {
    return null;
  }
  return (
    <View className="mt-1 gap-1.5">
      {urls.map((url) => {
        const video = mediaKind(url) === 'video';
        return (
          <View
            key={url}
            className="overflow-hidden"
            style={{
              borderRadius: 12,
              backgroundColor: THEME.surface,
              maxWidth: 220,
            }}>
            {video ? (
              <View
                className="items-center justify-center"
                style={{ height: 120, backgroundColor: THEME.primary }}>
                <Glyph name={GLYPH.play} color="#fff" size={22} />
              </View>
            ) : (
              <Image
                source={{ uri: url }}
                style={{ width: 220, height: 140 }}
                contentFit="cover"
              />
            )}
          </View>
        );
      })}
    </View>
  );
}
