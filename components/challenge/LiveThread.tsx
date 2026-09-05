import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveBubble } from '@/components/challenge/LiveBubble';
import { createStickyFooterPad } from '@/components/challenge/create/wizardUi';
import { InlineComposer } from '@/components/feed/InlineComposer';
import { MascotState } from '@/components/mascot/MascotState';
import { useSocialSheetsOptional } from '@/components/social/SocialSheets';
import { useKeyboardOverlap } from '@/components/ui/KeyboardFormShell';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { useEditPost } from '@/hooks/usePostEdit';
import { useLiveThreadReads } from '@/hooks/useLiveThreadReads';
import { copy } from '@/lib/copy';
import { insertLiveDayBreaks, type LiveDayBreakChallenge } from '@/lib/liveDayBreak';
import {
  buildLiveThreadRows,
  findLiveHighlightIndex,
  findLiveParent,
  liveChatText,
  isLiveCheckinPost,
  liveComposeFromInline,
  liveEditMediaUrls,
  liveEditPrefill,
  liveQuoteLine,
  liveQuotePreview,
  type LiveThreadRow,
} from '@/lib/liveThread';
import {
  isAtLiveEnd,
  liveJumpLabel,
  liveNewBelowCount,
  liveNextLastReadAt,
  liveUnreadAbove,
  liveUnreadCandidates,
  liveUnreadChipLabel,
  shouldPinToLiveEnd,
} from '@/lib/liveThreadUnread';
import { COMMENT_UNAVAILABLE, commentTargetMissing } from '@/lib/commentHighlight';
import type { MentionChip } from '@/lib/mentions';
import { authorLabel, resolveLiveAuthor, safeUserId } from '@/lib/safeIds';
import { tabBarLift, THEME } from '@/lib/theme';
import type { PostAudience } from '@/lib/postAudience';
import type { CommentWithAuthor, ComposeInput, PostSource, PostWithMeta, ReactionType } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { commentMediaUrls } from '@/utils/media';

type LiveReplyTarget = {
  postId: string;
  name: string;
  preview: string;
  avatarUrl?: string | null;
  mention?: MentionChip | null;
};

type LiveThreadProps = {
  posts: PostWithMeta[];
  isLoading?: boolean;
  isRefreshing?: boolean;
  error?: string | null;
  currentUserId?: string;
  emptyTitle: string;
  emptyBody: string;
  canCompose?: boolean;
  composing?: boolean;
  highlightPostId?: string;
  highlightCommentId?: string | null;
  footerReserve?: number;
  memberIds?: string[];
  placeholder?: string;
  sendLabel?: string;
  loadingTitle?: string;
  composeSource?: PostSource;
  composeAudience?: PostAudience;
  /** Pass the challenge to get period day separators. Omit it and the thread has none. */
  dayBreakChallenge?: LiveDayBreakChallenge | null;
  /**
   * Enables the read cursor and the "N new since you were here" chip. Omit it (Circles) and the
   * thread still gets the scroll fixes and the jump control, just no unread tracking.
   */
  readCursorChallengeId?: string | null;
  onRefresh?: () => void;
  onRetry?: () => void;
  onCompose: (input: ComposeInput) => Promise<unknown> | void;
  onReact: (post: PostWithMeta, type: ReactionType, commentId?: string | null) => void;
};

export function LiveThread({
  posts,
  isLoading,
  isRefreshing,
  error,
  currentUserId,
  emptyTitle,
  emptyBody,
  canCompose = true,
  composing,
  highlightPostId,
  highlightCommentId,
  footerReserve = 0,
  memberIds,
  placeholder,
  sendLabel,
  loadingTitle,
  composeSource = 'challenge',
  composeAudience = 'public',
  dayBreakChallenge,
  readCursorChallengeId,
  onRefresh,
  onRetry,
  onCompose,
  onReact,
}: LiveThreadProps) {
  const insets = useSafeAreaInsets();
  const keyboardOverlap = useKeyboardOverlap();
  const keyboardOpen = keyboardOverlap > 0;
  const social = useSocialSheetsOptional();
  const editPost = useEditPost();
  const listRef = useRef<FlatList<LiveThreadRow>>(null);
  const highlightedOnce = useRef<string | null>(null);
  const [replyTo, setReplyTo] = useState<LiveReplyTarget | null>(null);
  const [editing, setEditing] = useState<PostWithMeta | null>(null);
  const [missingComment, setMissingComment] = useState(false);
  const rows = useMemo(() => {
    const built = buildLiveThreadRows((posts ?? []).filter((post) => Boolean(post?.id)));
    return dayBreakChallenge ? insertLiveDayBreaks(built, dayBreakChallenge) : built;
  }, [dayBreakChallenge, posts]);
  const commentsReady = !isLoading;
  const highlightKey = highlightCommentId
    ? `comment:${highlightCommentId}`
    : highlightPostId
      ? `post:${highlightPostId}`
      : null;

  /**
   * Scroll position is tracked in refs, not state.
   *
   * These are read from scroll and content-size callbacks that fire many times per gesture. Holding
   * them in state would re-render the list on every frame of a drag, which is how the thread ends up
   * fighting the user in the first place.
   */
  const atEndRef = useRef(true);
  const draggingRef = useRef(false);
  const firstPaintPendingRef = useRef(true);
  /** Last reported offset, used to tell a user's upward scroll from our own downward pin. */
  const lastOffsetRef = useRef(0);
  /** The newest row the user has actually been parked on, for the "new below" count. */
  const bottomAnchorRef = useRef<string | null>(null);
  const [notAtEnd, setNotAtEnd] = useState(false);
  const [newBelow, setNewBelow] = useState(0);

  /**
   * Read through a ref so the logger has no dependencies. A logger that changed with `posts` would
   * make pinToLiveEdge change too, which would re-run the first-paint effect on every new message —
   * exactly the coupling this fix removes.
   */
  const postsRef = useRef(posts);
  postsRef.current = posts;

  const logLive = useCallback((why: string) => {
    if (!__DEV__) {
      return;
    }
    const current = postsRef.current ?? [];
    console.log('[blob:live]', {
      why,
      atEnd: atEndRef.current,
      userDragging: draggingRef.current,
      postsLen: current.length,
      lastId: current[current.length - 1]?.id ?? null,
    });
  }, []);

  /**
   * Scrolls to the newest row, but only when the rules allow it.
   *
   * Every automatic pin in this thread goes through here. The bug this replaces was an unconditional
   * scrollToEnd on content size change, which yanked the viewport to the bottom whenever a message
   * arrived, an image finished loading, or a reaction chip wrapped a line while someone was reading
   * older messages.
   */
  const pinToLiveEdge = useCallback(
    (animated: boolean, why: string) => {
      if (!shouldPinToLiveEnd({
        atEnd: atEndRef.current,
        dragging: draggingRef.current,
        firstPaintPending: firstPaintPendingRef.current,
      })) {
        logLive(`skip-pin:${why}`);
        return;
      }
      logLive(`pin:${why}`);
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated });
      });
    },
    [logLive],
  );

  /** The user asked for the newest row, so this one ignores the guard. */
  const jumpToLiveEdge = useCallback(() => {
    logLive('jump-to-newest');
    atEndRef.current = true;
    setNotAtEnd(false);
    setNewBelow(0);
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [logLive]);

  useEffect(() => {
    if (!highlightCommentId) {
      setMissingComment(false);
      return;
    }
    const comments = (posts ?? []).flatMap((post) => post.comments ?? []);
    setMissingComment(commentTargetMissing(comments, highlightCommentId, commentsReady));
  }, [commentsReady, highlightCommentId, posts]);

  useEffect(() => {
    if (rows.length === 0) {
      return;
    }
    if (highlightKey && highlightedOnce.current !== highlightKey) {
      const index = findLiveHighlightIndex(rows, highlightPostId, highlightCommentId);
      if (index >= 0) {
        highlightedOnce.current = highlightKey;
        // Landing on a linked message counts as arriving, so the opening pin is spent.
        firstPaintPendingRef.current = false;
        const timer = setTimeout(() => {
          try {
            listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.35 });
          } catch {
            listRef.current?.scrollToEnd({ animated: false });
          }
        }, 80);
        return () => clearTimeout(timer);
      }
      if (!commentsReady) {
        return;
      }
    }
    if (!highlightKey) {
      pinToLiveEdge(false, 'first-paint');
    }
    // `rows` is deliberately absent: this effect must run when the thread opens or a link targets a
    // message, never every time a row arrives or a reaction changes. Re-running it on rows is what
    // dragged readers back to the bottom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentsReady, highlightCommentId, highlightKey, highlightPostId, pinToLiveEdge, rows.length === 0]);

  // If the list never reports reaching the bottom, the opening pin still expires, so a stalled
  // measurement cannot leave the thread permanently snapping downward.
  useEffect(() => {
    const timer = setTimeout(() => {
      firstPaintPendingRef.current = false;
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const reads = useLiveThreadReads(readCursorChallengeId);
  /** Rows confirmed on screen this visit. A row seen here is not unread, whatever its timestamp. */
  const seenRef = useRef<Set<string>>(new Set());
  const [firstVisibleIndex, setFirstVisibleIndex] = useState(-1);
  const [seenTick, setSeenTick] = useState(0);

  const unreadCandidates = useMemo(
    () => liveUnreadCandidates(rows, { lastReadAt: reads.baseline, currentUserId }),
    [currentUserId, reads.baseline, rows],
  );

  const unreadAbove = useMemo(
    // seenTick is the dependency that lets a scroll-into-view drop the count; seenRef is a ref so it
    // does not re-render the list on every viewability report.
    () => liveUnreadAbove(rows, unreadCandidates, seenRef.current, firstVisibleIndex),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firstVisibleIndex, rows, seenTick, unreadCandidates],
  );

  // A first-time reader gets a starting point so their next visit can measure what is new.
  useEffect(() => {
    if (!reads.ready || rows.length === 0) {
      return;
    }
    reads.seedIfMissing(rows[rows.length - 1]?.createdAt ?? null);
  }, [reads, rows]);

  /**
   * Persists how far they read. Runs on unmount and when the backlog is cleared, not on every row,
   * so leaving the thread is one write.
   */
  const persistCursor = useCallback(() => {
    if (!reads.ready) {
      return;
    }
    const next = liveNextLastReadAt(rows, {
      candidateIds: unreadCandidates,
      seenIds: seenRef.current,
      lastReadAt: reads.baseline,
    });
    void reads.saveCursor(next);
  }, [reads, rows, unreadCandidates]);

  const persistRef = useRef(persistCursor);
  persistRef.current = persistCursor;
  useEffect(() => {
    // Leaving Live is the moment the cursor has to land, so this fires on unmount only.
    return () => persistRef.current();
  }, []);

  useEffect(() => {
    if (unreadCandidates.length > 0 && unreadAbove.count === 0) {
      persistCursor();
    }
  }, [persistCursor, unreadAbove.count, unreadCandidates.length]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length === 0) {
        return;
      }
      let added = false;
      let lowest = Number.MAX_SAFE_INTEGER;
      for (const token of viewableItems) {
        if (typeof token.index === 'number' && token.index < lowest) {
          lowest = token.index;
        }
        const id = typeof token.key === 'string' ? token.key : null;
        if (id && !seenRef.current.has(id)) {
          seenRef.current.add(id);
          added = true;
        }
      }
      if (lowest !== Number.MAX_SAFE_INTEGER) {
        setFirstVisibleIndex(lowest);
      }
      if (added) {
        setSeenTick((tick) => tick + 1);
      }
    },
  ).current;

  /** A row counts as read once half of it is on screen. */
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50, minimumViewTime: 120 }).current;

  const jumpToOldestUnread = useCallback(() => {
    if (unreadAbove.oldestIndex < 0) {
      return;
    }
    logLive('jump-to-oldest-unread');
    firstPaintPendingRef.current = false;
    try {
      listRef.current?.scrollToIndex({
        index: unreadAbove.oldestIndex,
        animated: true,
        viewPosition: 0.2,
      });
    } catch {
      // A row that has not been measured yet cannot be jumped to; the chip stays for another try.
    }
  }, [logLive, unreadAbove.oldestIndex]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const end = isAtLiveEnd({
        offsetY: contentOffset.y,
        contentHeight: contentSize.height,
        viewportHeight: layoutMeasurement.height,
      });
      // Our own pins only ever move down, so an upward move is the user taking over. That ends the
      // opening pin even on web, where a wheel or trackpad never fires a drag event.
      if (contentOffset.y < lastOffsetRef.current - 4) {
        firstPaintPendingRef.current = false;
      }
      lastOffsetRef.current = contentOffset.y;
      if (end !== atEndRef.current) {
        atEndRef.current = end;
        setNotAtEnd(!end);
      }
      if (end) {
        // The opening pin is deliberately NOT retired here. During a cold open the list reports
        // "at the end" against a content height that is still being measured, and treating that as
        // arrival left the thread parked several hundred pixels short of the newest row. Only a user
        // gesture or the opening timeout disarms it.
        //
        // Parked at the newest row: nothing is waiting below, and this is the anchor new arrivals
        // are counted against once they scroll away again.
        bottomAnchorRef.current = rows[rows.length - 1]?.id ?? null;
        if (newBelow !== 0) {
          setNewBelow(0);
        }
      }
    },
    [newBelow, rows],
  );

  // New rows arriving while the reader is scrolled up become a count on the jump control, never a
  // scroll. Their viewport does not move.
  useEffect(() => {
    if (atEndRef.current) {
      return;
    }
    setNewBelow(liveNewBelowCount(rows, bottomAnchorRef.current, currentUserId));
  }, [currentUserId, rows]);

  const submitLine = useCallback(
    async (content: string, mentionedUserIds: string[] = [], parentId?: string | null) => {
      const split = liveComposeFromInline(content);
      if (editing) {
        const mediaUrls = liveEditMediaUrls(editing, split.mediaUrls);
        if (isLiveCheckinPost(editing) && mediaUrls.length === 0) {
          Alert.alert(copy('post.savePhotoFirst'));
          return;
        }
        if (!split.text && mediaUrls.length === 0) {
          return;
        }
        await editPost.mutateAsync({
          postId: editing.id,
          caption: split.text,
          mediaUrls,
          hiddenMediaUrls: editing.hidden_media_urls ?? [],
          checkinId: editing.checkin_id,
        });
        setEditing(null);
        jumpToLiveEdge();
        return;
      }
      if (!split.text && split.mediaUrls.length === 0) {
        return;
      }
      await onCompose({
        content: split.text,
        mediaUrls: split.mediaUrls,
        source: composeSource,
        audience: composeAudience,
        mentionedUserIds,
        parentId: parentId ?? null,
      });
      setReplyTo(null);
      // Sending is an explicit act: the author always lands on their own new message.
      jumpToLiveEdge();
    },
    [composeAudience, composeSource, editPost, editing, jumpToLiveEdge, onCompose],
  );

  const startReply = useCallback((target: LiveReplyTarget) => {
    setEditing(null);
    setReplyTo(target);
  }, []);

  const startEdit = useCallback((post: PostWithMeta) => {
    setReplyTo(null);
    setEditing(post);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: LiveThreadRow }) => {
      if (item.kind === 'day') {
        return <LiveDayBreakRow dateLine={item.dateLine} dayLine={item.dayLine} />;
      }
      if (item.kind === 'comment') {
        const display = commentAsLivePost(item.comment, item.parent);
        const parentAuthor = resolveLiveAuthor(item.parent);
        const commentAuthor = resolveLiveAuthor({
          id: item.comment.id,
          author: item.comment.author,
          author_id: item.comment.author_id,
        });
        return (
          <View style={{ paddingHorizontal: 16, overflow: 'visible' }}>
            <LiveBubble
              post={display}
              currentUserId={currentUserId}
              comment={item.comment}
              highlighted={highlightCommentId === item.comment.id && !item.comment.deleted_at}
              quote={{
                name: parentAuthor.name,
                text: liveQuotePreview(item.parent) || liveChatText(item.parent.content, item.parent.media_urls),
                avatarUrl: parentAuthor.avatarUrl,
              }}
              reactions={item.comment.deleted_at ? [] : item.comment.reactions}
              onReact={(type) => onReact(item.parent, type, item.comment.id)}
              onReply={
                canCompose && !item.comment.deleted_at
                  ? () =>
                      startReply({
                        postId: item.parent.id,
                        name: commentAuthor.name,
                        preview: liveChatText(item.comment.content) || 'Message',
                        avatarUrl: commentAuthor.avatarUrl,
                        mention: mentionFromAuthor(item.comment.author, item.comment.author_id),
                      })
                  : undefined
              }
            />
          </View>
        );
      }

      const parent = findLiveParent(posts, item.post.parent_id);
      const parentAuthor = parent ? resolveLiveAuthor(parent) : null;
      const postAuthor = resolveLiveAuthor(item.post);
      const quote =
        parent && !isLiveCheckinPost(item.post) && !isLiveCheckinPost(parent)
          ? {
              name: parentAuthor?.name ?? 'Someone',
              text: liveQuotePreview(parent),
              avatarUrl: parentAuthor?.avatarUrl,
            }
          : null;
      return (
        <View style={{ paddingHorizontal: 16, overflow: 'visible' }}>
          <LiveBubble
            post={item.post}
            currentUserId={currentUserId}
            highlighted={highlightPostId === item.post.id && !highlightCommentId}
            quote={quote}
            onReact={(type) => onReact(item.post, type)}
            onEdit={
              currentUserId && postAuthor.authorId === currentUserId
                ? () => startEdit(item.post)
                : undefined
            }
            onHistory={
              item.post.edited_at && currentUserId && postAuthor.authorId === currentUserId
                ? () => social?.openHistory(item.post)
                : undefined
            }
            onReply={
              canCompose
                ? () =>
                    startReply({
                      postId: item.post.id,
                      name: postAuthor.name,
                      preview: liveQuotePreview(item.post) || 'Message',
                      avatarUrl: postAuthor.avatarUrl,
                      mention: mentionFromAuthor(item.post.author, item.post.author_id),
                    })
                : undefined
            }
          />
        </View>
      );
    },
    [canCompose, currentUserId, highlightCommentId, highlightPostId, onReact, posts, social, startEdit, startReply],
  );

  const composerPad = createStickyFooterPad(
    keyboardOpen,
    tabBarLift(insets.bottom, 'sticky') + Math.max(footerReserve, 0),
  );

  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        backgroundColor: THEME.background,
        marginBottom: keyboardOverlap,
      }}>
      {error && rows.length === 0 && !isLoading ? (
        <MascotState
          kind="error"
          title={copy('home.error')}
          actionLabel="Try again"
          onAction={onRetry}
        />
      ) : isLoading && rows.length === 0 ? (
        <MascotState kind="loading" title={loadingTitle ?? 'Loading Live'} compact />
      ) : (
        <View style={{ flex: 1, minHeight: 0 }}>
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => {
            draggingRef.current = true;
            // Touching the list ends the opening pin, so nothing can scroll out from under them.
            firstPaintPendingRef.current = false;
          }}
          onScrollEndDrag={() => {
            draggingRef.current = false;
          }}
          onMomentumScrollBegin={() => {
            firstPaintPendingRef.current = false;
          }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onContentSizeChange={() => {
            if (highlightKey && highlightedOnce.current === highlightKey) {
              return;
            }
            // Guarded, unlike the version this replaces: content grows on every new message, image
            // load and wrapped reaction row, and none of those may move a reader's viewport.
            //
            // The opening pin is deliberately not spent here. Rows measure in batches, so the first
            // pin lands on a bottom that is still growing; re-pinning on each growth is what makes a
            // cold open finish on the newest row instead of a few hundred pixels short.
            pinToLiveEdge(false, 'content-size');
          }}
          onScrollToIndexFailed={() => pinToLiveEdge(false, 'index-failed')}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'flex-end',
            gap: 12,
            paddingTop: 12,
            paddingBottom: 8,
            overflow: 'visible',
          }}
          ListEmptyComponent={
            <MascotState kind="empty" title={emptyTitle} body={emptyBody} compact />
          }
          ListHeaderComponent={
            missingComment ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 2 }}>
                <AppText className="text-[13px]" style={{ color: THEME.textMuted }}>
                  {COMMENT_UNAVAILABLE}
                </AppText>
              </View>
            ) : null
          }
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={Boolean(isRefreshing)}
                onRefresh={onRefresh}
                tintColor={THEME.accent}
              />
            ) : undefined
          }
          style={
            Platform.OS === 'web'
              ? ({ flex: 1, overflowY: 'auto', overflowX: 'hidden' } as object)
              : { flex: 1 }
          }
        />

        {/*
          "N new since you were here" — messages that landed since the last visit and are still above
          the viewport. A compact chip in the thread chrome, never a modal, and it dismisses itself as
          those rows scroll into view.
        */}
        {unreadAbove.count > 0 ? (
          <View
            pointerEvents="box-none"
            style={{ position: 'absolute', left: 0, right: 0, top: 8, alignItems: 'center' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${liveUnreadChipLabel(unreadAbove.count)}. Jump to the oldest.`}
              onPress={jumpToOldestUnread}
              style={{
                minHeight: 32,
                paddingHorizontal: 14,
                justifyContent: 'center',
                borderRadius: 999,
                backgroundColor: THEME.accent,
                shadowColor: '#19221F',
                shadowOpacity: 0.18,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 3,
              }}>
              <AppText className="text-[12px] font-semibold" style={{ color: '#FFFFFF' }}>
                {liveUnreadChipLabel(unreadAbove.count)}
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {/*
          Jump to newest. Sits just above the composer so the keyboard never covers it, and carries a
          count only for messages that arrived while they were reading up here.
        */}
        {notAtEnd ? (
          <View
            pointerEvents="box-none"
            style={{ position: 'absolute', right: 14, bottom: 12 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={liveJumpLabel(newBelow)}
              onPress={jumpToLiveEdge}
              hitSlop={8}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: THEME.surface,
                borderWidth: 1,
                borderColor: THEME.border,
                shadowColor: '#19221F',
                shadowOpacity: 0.16,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
                elevation: 4,
              }}>
              <AppText className="text-[17px]" style={{ color: THEME.textPrimary, marginTop: -2 }}>
                ↓
              </AppText>
            </Pressable>
            {newBelow > 0 ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 20,
                  height: 20,
                  paddingHorizontal: 5,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: THEME.accent,
                }}>
                <AppText className="text-[11px] font-bold" style={{ color: '#FFFFFF' }}>
                  {newBelow > 99 ? '99+' : String(newBelow)}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}
        </View>
      )}

      {canCompose ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: THEME.border,
            backgroundColor: THEME.background,
            paddingHorizontal: 10,
            paddingTop: 4,
            paddingBottom: composerPad,
          }}>
          {replyTo ? (
            <View
              className="flex-row items-center"
              style={{ gap: 8, minHeight: 28, marginBottom: 2 }}>
              {replyTo.avatarUrl ? (
                <Avatar uri={replyTo.avatarUrl} name={replyTo.name} size={16} />
              ) : null}
              <AppText
                className="text-[12px]"
                style={{ flex: 1, minWidth: 0, color: THEME.textMuted }}
                numberOfLines={1}>
                {liveQuoteLine(replyTo.name, replyTo.preview)}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel reply"
                onPress={() => setReplyTo(null)}
                style={{ minHeight: 28, minWidth: 28, alignItems: 'center', justifyContent: 'center' }}>
                <AppText className="text-[16px] font-semibold" style={{ color: THEME.textMuted }}>
                  ×
                </AppText>
              </Pressable>
            </View>
          ) : editing ? (
            <View
              className="flex-row items-center"
              style={{ gap: 8, minHeight: 28, marginBottom: 2 }}>
              <AppText
                className="text-[12px]"
                style={{ flex: 1, minWidth: 0, color: THEME.textMuted }}
                numberOfLines={1}>
                {copy('live.edit')}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel edit"
                onPress={() => setEditing(null)}
                style={{ minHeight: 28, minWidth: 28, alignItems: 'center', justifyContent: 'center' }}>
                <AppText className="text-[16px] font-semibold" style={{ color: THEME.textMuted }}>
                  ×
                </AppText>
              </Pressable>
            </View>
          ) : null}
          <InlineComposer
            key={editing ? `edit-${editing.id}` : 'live'}
            bar
            autoFocus={Boolean(replyTo || editing)}
            placeholder={placeholder ?? copy('live.placeholder')}
            submitLabel={editing ? copy('live.save') : (sendLabel ?? copy('live.send'))}
            submitting={Boolean(composing || editPost.isPending)}
            audience={composeAudience}
            memberIds={memberIds}
            draftKey={`live:${composeSource}`}
            initialText={editing ? liveEditPrefill(editing) : undefined}
            replyTo={editing ? null : replyTo?.mention}
            onExpandedChange={(open) => {
              // Only follows the newest row for someone already parked there; a reader scrolled up
              // keeps their place when the keyboard opens.
              if (open && !replyTo) {
                pinToLiveEdge(false, 'composer-open');
              }
            }}
            onSubmit={async (content, mentionedUserIds) => {
              try {
                await submitLine(content, mentionedUserIds, replyTo?.postId);
                setReplyTo(null);
              } catch (error) {
                Alert.alert('Couldn’t post that', getErrorMessage(error));
              }
            }}
          />
        </View>
      ) : (
        <View style={{ height: composerPad }} />
      )}
    </View>
  );
}

/** Two centered lines at the timestamp's size. Full width, never a bubble. */
function LiveDayBreakRow({ dateLine, dayLine }: { dateLine: string; dayLine: string | null }) {
  return (
    <View
      accessibilityRole="header"
      accessibilityLabel={dayLine ? `${dateLine}. ${dayLine}` : dateLine}
      style={{ paddingHorizontal: 16, paddingVertical: 2, alignItems: 'center' }}>
      <AppText className="text-[11px]" style={{ color: THEME.textMuted, textAlign: 'center' }}>
        {dateLine}
      </AppText>
      {dayLine ? (
        <AppText className="text-[11px]" style={{ color: THEME.textMuted, textAlign: 'center' }}>
          {dayLine}
        </AppText>
      ) : null}
    </View>
  );
}

function mentionFromAuthor(
  author: PostWithMeta['author'],
  authorId?: string | null,
): MentionChip | null {
  const userId = safeUserId(author, authorId);
  const username = author?.username?.trim();
  if (!username && !userId) {
    return null;
  }
  return {
    userId: userId ?? username ?? '',
    username: username || userId || 'someone',
    label: authorLabel(author),
    visibleName: author?.display_name?.trim() || authorLabel(author),
  };
}

function commentAsLivePost(comment: CommentWithAuthor, parent: PostWithMeta): PostWithMeta {
  const authorId = safeUserId(comment.author, comment.author_id) ?? comment.author_id ?? '';
  return {
    id: comment.id,
    author_id: authorId,
    author: comment.author,
    challenge_id: parent.challenge_id,
    content: comment.content,
    media_urls: commentMediaUrls(comment.content),
    created_at: comment.created_at,
    edited_at: comment.edited_at,
    deleted_at: comment.deleted_at,
    mentions: comment.mentions,
    reactions: comment.reactions,
    comments: [],
    source: 'challenge',
    parent_id: parent.id,
  };
}
