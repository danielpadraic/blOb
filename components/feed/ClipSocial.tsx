import { useState } from 'react';
import { Alert, View } from 'react-native';

import { CommentThread } from '@/components/feed/CommentThread';
import { InlineComposer } from '@/components/feed/InlineComposer';
import { ReactionBar } from '@/components/feed/ReactionBar';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { clipSocialCounts } from '@/lib/clipPost';
import { THEME } from '@/lib/theme';
import type { PostAudience } from '@/lib/postAudience';
import type { PostWithMeta, ReactionType } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

type ClipSocialProps = {
  post: PostWithMeta | null;
  currentUserId?: string;
  compact?: boolean;
  showThread?: boolean;
  startComposer?: boolean;
  commenting?: boolean;
  onReact: (type: ReactionType, commentId?: string | null) => void;
  onComment?: (
    content: string,
    parentId?: string | null,
    mentionedUserIds?: string[],
  ) => Promise<unknown> | void;
  onOpenComments?: () => void;
  onComposerFocus?: (focused: boolean) => void;
};

export function ClipCountRow({
  post,
  light,
}: {
  post: PostWithMeta | null;
  light?: boolean;
}) {
  const counts = clipSocialCounts(post);
  const color = light ? '#FFFFFF' : THEME.textMuted;
  return (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <View className="flex-row items-center">
        <Glyph name={GLYPH.like} color={color} size={12} />
        <AppText className="ml-0.5 text-[11px] font-bold" style={{ color }}>
          {counts.reactions}
        </AppText>
      </View>
      <View className="flex-row items-center">
        <Glyph name={GLYPH.reply} color={color} size={12} />
        <AppText className="ml-0.5 text-[11px] font-bold" style={{ color }}>
          {counts.comments}
        </AppText>
      </View>
    </View>
  );
}

export function ClipSocial({
  post,
  currentUserId,
  compact = false,
  showThread = false,
  startComposer = false,
  commenting,
  onReact,
  onComment,
  onOpenComments,
  onComposerFocus,
}: ClipSocialProps) {
  const [showComposer, setShowComposer] = useState(startComposer);
  const [composerExpanded, setComposerExpanded] = useState(true);
  const comments = post?.comments ?? [];
  const audience = (post?.audience ?? 'public') as PostAudience;

  return (
    <View className="gap-2">
      <ReactionBar
        compact={compact}
        createdAt={compact ? undefined : post?.created_at}
        reactions={post?.reactions}
        currentUserId={currentUserId}
        commentCount={comments.length}
        onReact={(type) => onReact(type)}
        onReply={
          onComment
            ? () => {
                if (onOpenComments && !showThread) {
                  onOpenComments();
                  return;
                }
                const next = !showComposer;
                setShowComposer(next);
                setComposerExpanded(true);
                onComposerFocus?.(next);
              }
            : onOpenComments
        }
      />

      {showThread && showComposer && onComment ? (
        <InlineComposer
          placeholder="Write a reply…"
          submitting={commenting}
          audience={audience}
          audienceUserIds={post?.audience_user_ids ?? []}
          expanded={composerExpanded}
          autoFocus
          onExpandedChange={(next) => {
            setComposerExpanded(next);
            onComposerFocus?.(next);
          }}
          replyTo={
            post?.author
              ? {
                  userId: post.author_id,
                  username: post.author.username ?? 'blob',
                  label: post.author.display_name ?? post.author.username ?? 'blob',
                }
              : null
          }
          onSubmit={async (text, mentionedUserIds) => {
            try {
              await onComment(text, null, mentionedUserIds);
              setShowComposer(false);
              setComposerExpanded(true);
              onComposerFocus?.(false);
            } catch (error) {
              Alert.alert('Couldn’t post that reply', getErrorMessage(error));
            }
          }}
        />
      ) : null}

      {showThread && comments.length > 0 ? (
        <CommentThread
          comments={comments}
          currentUserId={currentUserId}
          composing={commenting}
          audience={audience}
          audienceUserIds={post?.audience_user_ids ?? []}
          onReply={onComment ?? (async () => undefined)}
          onReact={(commentId, type) => onReact(type, commentId)}
        />
      ) : null}
    </View>
  );
}
