import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { CommentBodyBlock, CommentNameRow, commentBodyInsetStyle } from '@/components/feed/CommentNameRow';
import { InlineComposer } from '@/components/feed/InlineComposer';
import { MentionText } from '@/components/feed/MentionText';
import { ReactionBar } from '@/components/feed/ReactionBar';
import {
  useCommentEditing,
  useSocialSheetsOptional,
  type WindowRect,
} from '@/components/social/SocialSheets';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useUpdateComment } from '@/hooks/useCommentEdit';
import { commentsForThread, isLiveComment, visibleCommentCount } from '@/lib/commentEdit';
import {
  COMMENT_HIGHLIGHT_MS,
  scrollCommentNodeIntoView,
} from '@/lib/commentHighlight';
import { copy } from '@/lib/copy';
import { mentionChipFromAuthor, type MentionChip } from '@/lib/mentions';
import { THEME } from '@/lib/theme';
import type { CommentWithAuthor, ReactionType } from '@/lib/types';
import { nestComments } from '@/utils/comments';
import { getErrorMessage } from '@/utils/errors';
import { formatFeedTime } from '@/utils/format';
import { commentMediaUrls, commentTextWithoutMedia, mediaKind } from '@/utils/media';

const INDENT = 12;

type ScrollHost = {
  scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void;
  scrollTo?: (opts: { y: number; animated?: boolean }) => void;
};

type CommentScrollValue = {
  hostRef: { current: ScrollHost | null };
  scrollY: { current: number };
  bottomSafe?: number;
};

const CommentScrollContext = createContext<CommentScrollValue | null>(null);

export function CommentScrollProvider({
  hostRef,
  scrollY,
  bottomSafe,
  children,
}: CommentScrollValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ hostRef, scrollY, bottomSafe }),
    [bottomSafe, hostRef, scrollY],
  );
  return <CommentScrollContext.Provider value={value}>{children}</CommentScrollContext.Provider>;
}

export function useCommentScroll() {
  return useContext(CommentScrollContext);
}

type ReplyHandler = (
  content: string,
  parentId?: string | null,
  mentionedUserIds?: string[],
  mentionChips?: MentionChip[],
) => Promise<unknown> | void;

type CommentThreadProps = {
  comments: CommentWithAuthor[];
  currentUserId?: string;
  onReply: ReplyHandler;
  onReact?: (commentId: string, type: ReactionType) => void;
  composing?: boolean;
  audience?: string;
  audienceUserIds?: string[];
  highlightCommentId?: string | null;
  ensureVisibleId?: string | null;
  /** Home: Reply focuses the footer composer. Wave keeps a composer under the row. */
  replyMode?: 'inline' | 'callback';
  onReplyPress?: (comment: CommentWithAuthor, mention: MentionChip | null) => void;
  showEmpty?: boolean;
  showAll?: boolean;
};

export function CommentThread({
  comments,
  currentUserId,
  onReply,
  onReact,
  composing,
  audience,
  audienceUserIds,
  highlightCommentId,
  ensureVisibleId,
  replyMode = 'inline',
  onReplyPress,
  showEmpty = false,
  showAll: showAllProp,
}: CommentThreadProps) {
  const [showAll, setShowAll] = useState(Boolean(showAllProp));
  const thread = commentsForThread(comments);
  const roots = nestComments(thread);
  const liveCount = visibleCommentCount(comments);
  const targetId = highlightCommentId || ensureVisibleId;

  useEffect(() => {
    if (!targetId) {
      return;
    }
    if (thread.some((comment) => comment.id === targetId)) {
      setShowAll(true);
    }
  }, [targetId, thread]);

  if (thread.length === 0) {
    if (!showEmpty) {
      return null;
    }
    return (
      <AppText className="text-[13px] text-muted">No comments yet</AppText>
    );
  }

  const previewLimit = 3;
  const expanded = showAllProp || showAll;
  const visibleRoots = expanded ? roots : roots.slice(0, previewLimit);
  const hiddenCount = roots.length - visibleRoots.length;

  return (
    <View className="gap-1">
      {hiddenCount > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => setShowAll(true)}>
          <AppText className="text-[13px] font-semibold text-muted">
            View all {liveCount} replies
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
          highlightCommentId={highlightCommentId}
          ensureVisibleId={ensureVisibleId}
          replyMode={replyMode}
          onReplyPress={onReplyPress}
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
  highlightCommentId,
  ensureVisibleId,
  replyMode,
  onReplyPress,
}: {
  comment: CommentWithAuthor;
  nested: boolean;
  currentUserId?: string;
  composing?: boolean;
  onReply: ReplyHandler;
  onReact?: (commentId: string, type: ReactionType) => void;
  audience?: string;
  audienceUserIds?: string[];
  highlightCommentId?: string | null;
  ensureVisibleId?: string | null;
  replyMode: 'inline' | 'callback';
  onReplyPress?: (comment: CommentWithAuthor, mention: MentionChip | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [highlighted, setHighlighted] = useState(false);
  const nodeRef = useRef<View>(null);
  const moreRef = useRef<View>(null);
  const social = useSocialSheetsOptional();
  const scroll = useContext(CommentScrollContext);
  const editing = useCommentEditing(comment.id);
  const updateComment = useUpdateComment();
  const removed = !isLiveComment(comment);
  const name = comment.author?.display_name ?? comment.author?.username ?? 'blob';
  const replies = comment.replies ?? [];
  const body = commentTextWithoutMedia(comment.content);
  const mediaUrls = commentMediaUrls(comment.content);
  const mention = mentionChipFromAuthor(comment.author, comment.author_id);
  const time = formatFeedTime(comment.created_at);

  useEffect(() => {
    const isHighlight = highlightCommentId === comment.id;
    const isEnsure = ensureVisibleId === comment.id;
    if (!isHighlight && !isEnsure) {
      return;
    }
    if (isHighlight && !removed) {
      setHighlighted(true);
    }
    const frame = requestAnimationFrame(() => {
      scrollCommentNodeIntoView(
        nodeRef.current,
        scroll?.hostRef.current,
        scroll?.scrollY.current ?? 0,
        { bottomSafe: scroll?.bottomSafe },
      );
    });
    const timer = isHighlight
      ? setTimeout(() => setHighlighted(false), COMMENT_HIGHLIGHT_MS)
      : null;
    return () => {
      cancelAnimationFrame(frame);
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [comment.id, ensureVisibleId, highlightCommentId, removed, scroll]);

  function openMenu() {
    moreRef.current?.measureInWindow((x, y, width, height) => {
      social?.toggleCommentOverflow(comment, { x, y, width, height } as WindowRect);
    });
  }

  function onReplyTap() {
    if (replyMode === 'callback') {
      onReplyPress?.(comment, mention);
      return;
    }
    setOpen(true);
    setExpanded(true);
  }

  return (
    <View
      nativeID={`blob-comment-${comment.id}`}
      ref={nodeRef}
      collapsable={false}
      style={[
        nested
          ? {
              marginLeft: INDENT,
              borderLeftWidth: 2,
              borderLeftColor: THEME.accentSoft,
              paddingLeft: 8,
            }
          : undefined,
        highlighted
          ? {
              backgroundColor: THEME.accentSoft,
              borderRadius: 12,
              paddingVertical: 4,
              paddingHorizontal: 6,
              marginHorizontal: -6,
            }
          : undefined,
      ]}>
      <CommentNameRow
        author={comment.author}
        authorId={comment.author_id}
        name={name}
        handle={comment.author?.username}
        time={removed ? null : time}
        edited={Boolean(!removed && comment.edited_at)}
        moreRef={moreRef}
        onMenu={social ? openMenu : undefined}
      />
      <CommentBodyBlock>
          {removed ? (
            <AppText className="text-[13px] leading-[18px]" style={{ color: THEME.textMuted }}>
              {copy('comment.removed')}
            </AppText>
          ) : editing ? (
            <View>
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
                audience={audience}
                audienceUserIds={audienceUserIds}
                pinned
                autoFocus
                initialText={body}
                initialMediaUrls={mediaUrls}
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
          ) : (
            <>
              {body ? (
                <MentionText
                  content={body}
                  mentions={comment.mentions}
                  className="text-[13px] leading-[18px] text-ink"
                />
              ) : null}
              <CommentMedia urls={mediaUrls} />
            </>
          )}
          {removed || editing ? null : (
            <View className="mt-0.5">
              <ReactionBar
                compact
                reactions={comment.reactions}
                currentUserId={currentUserId}
                onReact={(type) => onReact?.(comment.id, type)}
                onReply={onReplyTap}
              />
            </View>
          )}
      </CommentBodyBlock>

      {replyMode === 'inline' && open && !removed && !editing ? (
        <View style={commentBodyInsetStyle()}>
          <InlineComposer
            placeholder={`Reply to ${name}…`}
            submitting={composing}
            audience={audience}
            audienceUserIds={audienceUserIds}
            expanded={expanded}
            autoFocus
            onExpandedChange={setExpanded}
            replyTo={mention}
            onSubmit={async (text, mentionedUserIds, chips) => {
              try {
                await onReply(text, comment.id, mentionedUserIds, chips);
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
          highlightCommentId={highlightCommentId}
          ensureVisibleId={ensureVisibleId}
          replyMode={replyMode}
          onReplyPress={onReplyPress}
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
