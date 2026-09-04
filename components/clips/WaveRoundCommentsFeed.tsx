import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { CommentBodyBlock, CommentNameRow } from '@/components/feed/CommentNameRow';
import { MentionField } from '@/components/feed/MentionField';
import { MentionText } from '@/components/feed/MentionText';
import { CommentScrollProvider, useCommentScroll } from '@/components/feed/CommentThread';
import { InlineComposer } from '@/components/feed/InlineComposer';
import {
  useCommentEditing,
  useSocialSheetsOptional,
  type WindowRect,
} from '@/components/social/SocialSheets';
import { AppText } from '@/components/ui/AppText';
import { useUpdateComment } from '@/hooks/useCommentEdit';
import { CLIP_REACTIONS, DEFAULT_CLIP_REACTION, clipReactionEmoji } from '@/lib/clipReactions';
import { commentsForThread, isLiveComment } from '@/lib/commentEdit';
import {
  COMMENT_HIGHLIGHT_MS,
  COMMENT_UNAVAILABLE,
  commentTargetMissing,
  scrollCommentNodeIntoView,
} from '@/lib/commentHighlight';
import { copy } from '@/lib/copy';
import type { MentionChip, MentionDoc } from '@/lib/mentions';
import { THEME } from '@/lib/theme';
import type { CommentWithAuthor, PublicProfile, ReactionType } from '@/lib/types';
import { nestComments } from '@/utils/comments';
import { getErrorMessage } from '@/utils/errors';
import { formatFeedTime } from '@/utils/format';
import { userReaction } from '@/lib/reactions';
import { commentMediaUrls, commentTextWithoutMedia } from '@/utils/media';

const NAME = 'rgba(255,255,255,0.72)';
const TIME = 'rgba(255,255,255,0.5)';
const BODY = 'rgba(245,245,245,0.96)';
const ICON = 'rgba(245,245,245,0.9)';
const FOOTER = 'footer';

type ReplyTarget = {
  id: string;
  name: string;
  mention: MentionChip | null;
};

type WaveRoundCommentsFeedProps = {
  comments: CommentWithAuthor[];
  commentsReady?: boolean;
  currentUserId?: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  submitting?: boolean;
  audience?: string;
  audienceUserIds?: string[];
  keyboardInset?: number;
  highlightCommentId?: string | null;
  onSend: (
    content: string,
    parentId?: string | null,
    mentionedUserIds?: string[],
  ) => Promise<unknown> | void;
  onReact?: (commentId: string, type: ReactionType) => void;
  onReport?: (commentId: string) => Promise<unknown> | void;
  onClose?: () => void;
  onScrollOffset?: (offset: number) => void;
  onCloseFromTop?: () => void;
};

export function WaveRoundCommentsFeed({
  comments,
  commentsReady = true,
  currentUserId,
  displayName,
  submitting,
  audience = 'public',
  audienceUserIds = [],
  keyboardInset = 0,
  highlightCommentId,
  onSend,
  onReact,
  onReport: _onReport,
  onClose,
  onScrollOffset,
  onCloseFromTop,
}: WaveRoundCommentsFeedProps) {
  const [local, setLocal] = useState<CommentWithAuthor[]>([]);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [docs, setDocs] = useState<Record<string, MentionDoc>>({});
  const seededReply = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollTop = useRef(0);
  const topSwipes = useRef(0);
  const sentCount = useRef(0);

  const thread = [...comments];
  const seen = useRef(new Set<string>());
  for (const comment of comments) {
    seen.current.add(`${comment.author_id}:${comment.content}`);
  }
  for (const row of local) {
    if (seen.current.has(`${row.author_id}:${row.content}`)) {
      continue;
    }
    if (
      !thread.some(
        (comment) =>
          comment.id === row.id ||
          (comment.content === row.content &&
            (comment.author_id === row.author_id ||
              Boolean(currentUserId && comment.author_id === currentUserId))),
      )
    ) {
      thread.push(row);
    }
  }
  const roots = nestComments(commentsForThread(thread));
  const slot = replyTo?.id ?? FOOTER;
  const missingComment = commentTargetMissing(thread, highlightCommentId, commentsReady);
  const hostRef = useRef<{
    scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void;
    scrollTo?: (opts: { y: number; animated?: boolean }) => void;
  } | null>(null);

  useEffect(() => {
    if (highlightCommentId) {
      return;
    }
    if (thread.length <= sentCount.current) {
      return undefined;
    }
    sentCount.current = thread.length;
    const handle = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(handle);
  }, [highlightCommentId, thread.length]);

  useEffect(() => {
    if (!replyTo) {
      return undefined;
    }
    const handle = requestAnimationFrame(() => {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.getElementById(`blob-comment-${replyTo.id}`)?.scrollIntoView({
          block: 'center',
          inline: 'nearest',
        });
      }
    });
    return () => cancelAnimationFrame(handle);
  }, [replyTo?.id]);

  function setSlotDoc(id: string, doc: MentionDoc) {
    setDocs((current) => (current[id] === doc ? current : { ...current, [id]: doc }));
  }

  function openReply(target: ReplyTarget) {
    setReplyTo(target);
    if (seededReply.current === target.id) {
      return;
    }
    seededReply.current = target.id;
    setDocs((current) => {
      if ((current[target.id]?.text ?? '').trim()) {
        return current;
      }
      const handle = target.mention?.username?.replace(/^@/, '');
      if (!handle) {
        return current;
      }
      return {
        ...current,
        [target.id]: {
          text: `@${handle} `,
          chips: target.mention ? [target.mention] : [],
        },
      };
    });
  }

  async function send(id: string, parentId: string | null) {
    const doc = docs[id] ?? { text: '', chips: [] };
    const body = doc.text.trim();
    if (!body || submitting) {
      return;
    }
    const mentioned = [
      ...new Set([
        ...doc.chips.map((chip) => chip.userId),
        ...(parentId && replyTo?.mention?.userId ? [replyTo.mention.userId] : []),
      ]),
    ];
    await onSend(body, parentId, mentioned);
    const author = {
      display_name: displayName ?? 'You',
      username: displayName ?? 'you',
      avatar_url: null,
    } as PublicProfile;
    setLocal((current) => [
      ...current,
      {
        id: `local-comment-${Date.now()}`,
        post_id: comments[0]?.post_id ?? '',
        author_id: currentUserId ?? 'me',
        parent_id: parentId,
        content: body,
        created_at: new Date().toISOString(),
        author,
      },
    ]);
    setDocs((current) => ({ ...current, [id]: { text: '', chips: [] } }));
    setReplyTo(null);
    seededReply.current = null;
  }

  function noteScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = event.nativeEvent.contentOffset.y;
    scrollTop.current = y;
    onScrollOffset?.(y);
    if (y > 4) {
      topSwipes.current = 0;
    }
  }

  function tryCloseFromTop(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = event.nativeEvent.contentOffset.y;
    const vy = event.nativeEvent.velocity?.y ?? 0;
    if (y > 2) {
      return;
    }
    topSwipes.current += 1;
    if (topSwipes.current >= 2 || vy > 0.55) {
      topSwipes.current = 0;
      onCloseFromTop?.();
    }
  }

  const composer = (
    <FrostComposer
      key={slot}
      slot={slot}
      doc={docs[slot] ?? { text: '', chips: [] }}
      onDoc={(doc) => setSlotDoc(slot, doc)}
      seedMention={slot !== FOOTER ? replyTo?.mention ?? null : null}
      audience={audience}
      audienceUserIds={audienceUserIds}
      excludeIds={currentUserId ? [currentUserId] : []}
      submitting={submitting}
      keyboardInset={keyboardInset}
      onCancel={replyTo ? () => setReplyTo(null) : undefined}
      onSend={() => void send(slot, replyTo?.id ?? null)}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <Pressable
        onPress={() => {
          if (replyTo) {
            setReplyTo(null);
          }
        }}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2, paddingBottom: 2 }}>
        <AppText className="flex-1 text-[15px] font-extrabold" style={{ color: '#fff' }}>
          {copy('clip.comments')}
        </AppText>
        {onClose ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close comments"
            onPress={onClose}
            hitSlop={8}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <AppText className="text-[22px] font-bold" style={{ color: '#fff' }}>
              ×
            </AppText>
          </Pressable>
        ) : null}
      </Pressable>
      {missingComment ? (
        <AppText className="px-4 pb-1 text-[13px]" style={{ color: TIME }}>
          {COMMENT_UNAVAILABLE}
        </AppText>
      ) : null}
      <CommentScrollProvider hostRef={hostRef} scrollY={scrollTop} bottomSafe={220}>
      <ScrollView
        ref={(node) => {
          scrollRef.current = node;
          hostRef.current = node;
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 8, flexGrow: 1 }}
        scrollEventThrottle={16}
        onScroll={noteScroll}
        onScrollEndDrag={tryCloseFromTop}
        onMomentumScrollEnd={tryCloseFromTop}>
        {roots.length === 0 ? (
          <AppText className="mt-3 text-[13px]" style={{ color: ICON }}>
            {copy('clip.commentEmpty')}
          </AppText>
        ) : (
          roots.map((comment) => (
            <FeedItem
              key={comment.id}
              comment={comment}
              nested={false}
              currentUserId={currentUserId}
              audience={audience}
              audienceUserIds={audienceUserIds}
              highlightCommentId={highlightCommentId}
              ensureVisibleId={replyTo?.id}
              onReply={openReply}
              onReact={onReact}
            />
          ))
        )}
      </ScrollView>
      </CommentScrollProvider>
      {composer}
    </View>
  );
}

function FeedItem({
  comment,
  nested,
  currentUserId,
  audience,
  audienceUserIds,
  highlightCommentId,
  ensureVisibleId,
  onReply,
  onReact,
}: {
  comment: CommentWithAuthor;
  nested: boolean;
  currentUserId?: string;
  audience: string;
  audienceUserIds: string[];
  highlightCommentId?: string | null;
  ensureVisibleId?: string | null;
  onReply: (target: ReplyTarget) => void;
  onReact?: (commentId: string, type: ReactionType) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  const nodeRef = useRef<View>(null);
  const moreRef = useRef<View>(null);
  const social = useSocialSheetsOptional();
  const scroll = useCommentScroll();
  const editing = useCommentEditing(comment.id);
  const updateComment = useUpdateComment();
  const removed = !isLiveComment(comment);
  const name = comment.author?.display_name ?? comment.author?.username ?? 'blob';
  const handle = comment.author?.username ?? '';
  const replies = comment.replies ?? [];
  const mine = userReaction(comment.reactions, currentUserId);
  const count = comment.reactions?.length ?? 0;
  const body = commentTextWithoutMedia(comment.content);
  const mediaUrls = commentMediaUrls(comment.content);
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
    const timer = isHighlight ? setTimeout(() => setHighlighted(false), COMMENT_HIGHLIGHT_MS) : null;
    return () => {
      cancelAnimationFrame(frame);
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [comment.id, ensureVisibleId, highlightCommentId, removed, scroll]);

  return (
    <View
      nativeID={`blob-comment-${comment.id}`}
      ref={nodeRef}
      collapsable={false}
      style={{
        marginBottom: 6,
        marginLeft: nested ? 14 : 0,
        paddingLeft: nested ? 8 : 0,
        borderLeftWidth: nested ? 1.5 : 0,
        borderLeftColor: nested ? 'rgba(255,255,255,0.18)' : 'transparent',
        backgroundColor: highlighted ? 'rgba(231,247,243,0.18)' : 'transparent',
        borderRadius: highlighted ? 12 : 0,
        paddingVertical: highlighted ? 4 : 0,
        paddingHorizontal: highlighted ? 4 : 0,
      }}>
      <CommentNameRow
        author={comment.author}
        authorId={comment.author_id}
        name={name}
        handle={handle}
        time={removed ? null : time}
        edited={Boolean(!removed && comment.edited_at)}
        moreRef={moreRef}
        onMenu={
          social
            ? () => {
                moreRef.current?.measureInWindow((x, y, width, height) => {
                  social.toggleCommentOverflow(comment, { x, y, width, height } as WindowRect);
                });
              }
            : undefined
        }
        nameColor={NAME}
        metaColor={TIME}
        moreColor={ICON}
      />
      <CommentBodyBlock>
          {removed ? (
            <AppText className="text-[13px]" style={{ color: TIME }}>
              {copy('comment.removed')}
            </AppText>
          ) : editing ? (
            <View
              style={{
                borderRadius: 14,
                backgroundColor: THEME.surface,
                paddingHorizontal: 8,
                paddingVertical: 6,
              }}>
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
            <MentionText
              content={comment.content}
              mentions={comment.mentions}
              color={BODY}
              className="text-[13px] leading-[18px] font-normal"
            />
          )}
          {removed || editing ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 30, marginTop: 2, gap: 4 }}>
            {onReact ? (
              <View style={{ minWidth: 30, minHeight: 30, alignItems: 'center', justifyContent: 'center' }}>
                {pickerOpen ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss reactions"
                      onPress={() => setPickerOpen(false)}
                      style={{
                        position: 'absolute',
                        top: -800,
                        right: -800,
                        bottom: -800,
                        left: -800,
                        backgroundColor: 'rgba(16,19,18,0.28)',
                        zIndex: 5,
                      }}
                    />
                    <View
                      pointerEvents="auto"
                      style={{
                        position: 'absolute',
                        left: 0,
                        bottom: 32,
                        backgroundColor: 'rgba(16,19,18,0.28)',
                        borderRadius: 18,
                        paddingVertical: 4,
                        zIndex: 6,
                      }}>
                      {CLIP_REACTIONS.map((row) => (
                        <Pressable
                          key={row.type}
                          accessibilityRole="button"
                          accessibilityLabel={row.label}
                          onPress={() => {
                            onReact(comment.id, row.type);
                            setPickerOpen(false);
                          }}
                          style={{
                            minWidth: 30,
                            minHeight: 30,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                          <AppText className="text-[18px]">{row.emoji}</AppText>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Love comment"
                  onPress={() => {
                    if (pickerOpen) {
                      setPickerOpen(false);
                      return;
                    }
                    onReact(comment.id, mine?.reaction_type ?? DEFAULT_CLIP_REACTION);
                  }}
                  onLongPress={() => setPickerOpen((open) => !open)}
                  delayLongPress={280}
                  style={{ minWidth: 30, minHeight: 30, alignItems: 'center', justifyContent: 'center', zIndex: 7 }}>
                  <AppText className="text-[16px]" style={{ color: mine ? '#fff' : ICON }}>
                    {mine ? clipReactionEmoji(mine.reaction_type) : '♡'}
                  </AppText>
                </Pressable>
              </View>
            ) : null}
            {count > 0 ? (
              <AppText className="text-[11px]" style={{ color: ICON, marginRight: 4 }}>
                {count}
              </AppText>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Reply to ${name}`}
              onPress={() =>
                onReply({
                  id: comment.id,
                  name,
                  mention: handle
                    ? { userId: comment.author_id, username: handle, label: name, kind: 'user' }
                    : null,
                })
              }
              style={{ minWidth: 30, minHeight: 30, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 3 }}>
              <AppText className="text-[16px]" style={{ color: ICON }}>
                ↩
              </AppText>
              {replies.length > 0 ? (
                <AppText className="text-[11px]" style={{ color: ICON }}>
                  {replies.length}
                </AppText>
              ) : null}
            </Pressable>
          </View>
          )}
      </CommentBodyBlock>
      {replies.map((reply) => (
        <FeedItem
          key={reply.id}
          comment={reply}
          nested
          currentUserId={currentUserId}
          audience={audience}
          audienceUserIds={audienceUserIds}
          highlightCommentId={highlightCommentId}
          ensureVisibleId={ensureVisibleId}
          onReply={onReply}
          onReact={onReact}
        />
      ))}
    </View>
  );
}

function FrostComposer({
  slot,
  doc,
  onDoc,
  seedMention,
  audience,
  audienceUserIds,
  excludeIds,
  submitting,
  keyboardInset,
  onSend,
  onCancel,
}: {
  slot: string;
  doc: MentionDoc;
  onDoc: (doc: MentionDoc) => void;
  seedMention?: MentionChip | null;
  audience: string;
  audienceUserIds: string[];
  excludeIds: string[];
  submitting?: boolean;
  keyboardInset: number;
  onSend: () => void;
  onCancel?: () => void;
}) {
  return (
    <View
      style={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 + Math.max(0, keyboardInset), gap: 4 }}>
      {onCancel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel reply"
          onPress={onCancel}
          style={{ alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center' }}>
          <AppText className="text-[11px]" style={{ color: ICON }}>
            Cancel
          </AppText>
        </Pressable>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View
          style={{
            flex: 1,
            minHeight: 40,
            borderRadius: 14,
            paddingHorizontal: 10,
            paddingVertical: 2,
            backgroundColor: 'rgba(255,255,255,0.08)',
          }}>
          <MentionField
            compact
            autoFocus={Boolean(onCancel)}
            pickerPlacement="above"
            tone="frost"
            initialText={doc.text}
            initialMention={doc.text.trim() ? null : seedMention}
            audience={audience}
            audienceUserIds={audienceUserIds}
            excludeIds={excludeIds}
            placeholder={copy('clip.comment')}
            accessibilityLabel={copy('clip.comment')}
            onChange={onDoc}
            onSubmit={onSend}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy('clip.commentSend')}
          disabled={!doc.text.trim() || submitting}
          onPress={onSend}
          style={{
            minWidth: 48,
            minHeight: 40,
            paddingHorizontal: 12,
            borderRadius: 14,
            backgroundColor: THEME.accent,
            opacity: doc.text.trim() && !submitting ? 1 : 0.4,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <AppText className="text-[13px] font-extrabold" style={{ color: '#fff' }}>
            {copy('clip.commentSend')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
