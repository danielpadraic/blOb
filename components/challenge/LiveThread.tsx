import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  RefreshControl,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';

import { LiveBubble } from '@/components/challenge/LiveBubble';
import { LiveFailBanner, LiveRowBoundary, LiveSafeBoundary } from '@/components/challenge/LiveSafeBoundary';
import { InlineComposer } from '@/components/feed/InlineComposer';
import { WhoReactedSheet, type WhoReactedTarget } from '@/components/feed/WhoReactedSheet';
import { LiftPickerSheet } from '@/components/lift/LiftPickerSheet';
import type { LiftSessionSummary } from '@/lib/lift/types';
import { MascotState } from '@/components/mascot/MascotState';
import { useSocialSheetsOptional } from '@/components/social/SocialSheets';
import { useKeyboardHeight } from '@/components/ui/KeyboardFormShell';
import { liveComposerInset, liveComposerKeyboardOpen } from '@/lib/liveComposerInset';
import { setLiveComposerKeyboardOpen } from '@/lib/liveComposerKeyboard';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { useEditPost } from '@/hooks/usePostEdit';
import { useLiveThreadReads } from '@/hooks/useLiveThreadReads';
import { useQueryClient } from '@tanstack/react-query';
import { copy } from '@/lib/copy';
import {
  insertLiveDayBreaks,
  liveDayBreakFingerprint,
  type LiveDayBreakChallenge,
} from '@/lib/liveDayBreak';
import {
  buildLiveThreadRows,
  findLiveHighlightIndex,
  findLiveParent,
  liveChatText,
  liveRowKey,
  isLiveCheckinPost,
  liveComposeFromInline,
  liveEditMediaUrls,
  liveEditPrefill,
  liveQuoteLine,
  liveQuotePreview,
  EMPTY_LIVE_POSTS,
  reuseLiveThreadRows,
  seedLiveFeedPosts,
  type LiveThreadRow,
} from '@/lib/liveThread';
import {
  clearLiveInitialScroll,
  hasLiveInitialScroll,
  liveLandingFocus,
  markLiveInitialScroll,
  peekSentLiveCheckin,
  takeSentLiveCheckin,
} from '@/lib/liveLanding';
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
import {
  COMMENT_UNAVAILABLE,
  LIVE_COMMENT_HIGHLIGHT_MS,
  commentTargetHardMissing,
} from '@/lib/commentHighlight';
import type { MentionChip } from '@/lib/mentions';
import { authorLabel, resolveLiveAuthor, safeUserId } from '@/lib/safeIds';
import { THEME } from '@/lib/theme';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { backfillLatestFitnessOcr } from '@/lib/health/runPostSendOcr';
import { dedupeLivePostsByCheckinId, logUnexpectedLiveReset } from '@/lib/liveFeedPatch';
import { stopAllLiveMedia } from '@/lib/cameraSession';
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
  /** Live tab is on screen. Leaving clears the @chip, not the draft. */
  focused?: boolean;
  onRefresh?: () => void;
  onRetry?: () => void;
  onCompose: (input: ComposeInput) => Promise<unknown> | void;
  onReact: (post: PostWithMeta, type: ReactionType, commentId?: string | null) => void;
};

const EMPTY_LIVE_ROWS: LiveThreadRow[] = [];

function LiveQuietEmpty({ title, body }: { title: string; body: string }) {
  return <MascotState kind="empty" title={title} body={body || undefined} compact />;
}

export function LiveThread({
  posts = EMPTY_LIVE_POSTS,
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
  focused = true,
  onRefresh,
  onRetry,
  onCompose,
  onReact,
}: LiveThreadProps) {
  const keyboardHeight = useKeyboardHeight();
  const keyboardOpen = liveComposerKeyboardOpen(keyboardHeight);
  useEffect(() => {
    const liveKeys = Boolean(focused && keyboardOpen);
    setLiveComposerKeyboardOpen(liveKeys);
    return () => {
      if (liveKeys) {
        setLiveComposerKeyboardOpen(false);
      }
    };
  }, [focused, keyboardOpen]);
  const social = useSocialSheetsOptional();
  const editPost = useEditPost();
  const listRef = useRef<FlatList<LiveThreadRow>>(null);
  const highlightedOnce = useRef<string | null>(null);
  const [replyTo, setReplyTo] = useState<LiveReplyTarget | null>(null);
  const [editing, setEditing] = useState<PostWithMeta | null>(null);
  const [missingComment, setMissingComment] = useState(false);
  const [highlightFlash, setHighlightFlash] = useState(false);
  const [liftOpen, setLiftOpen] = useState(false);
  const [attachedLift, setAttachedLift] = useState<LiftSessionSummary | null>(null);
  const [whoReacted, setWhoReacted] = useState<WhoReactedTarget | null>(null);
  const openWho = useCallback((postId: string, type: ReactionType, commentId?: string | null, reactions?: PostWithMeta['reactions']) => {
    setWhoReacted({ postId, commentId: commentId ?? null, type, reactions });
  }, []);
  const dayBreakFp = liveDayBreakFingerprint(dayBreakChallenge);
  const stableDayBreak = useMemo(
    () => dayBreakChallenge ?? null,
    // Same calendar math → keep the same object so day-breaks and the WeakMap cache do not rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayBreakFp],
  );
  const [rowBanner, setRowBanner] = useState<string | null>(null);
  const onRowError = useCallback((message: string) => {
    setRowBanner((current) => current || message);
  }, []);
  const sourcePosts = posts.length === 0 ? EMPTY_LIVE_POSTS : posts;
  const prevRowsRef = useRef<LiveThreadRow[]>(EMPTY_LIVE_ROWS);
  const thread = useMemo(() => {
    try {
      if (sourcePosts.length === 0) {
        prevRowsRef.current = EMPTY_LIVE_ROWS;
        return { rows: EMPTY_LIVE_ROWS, error: null as string | null };
      }
      const seeded = seedLiveFeedPosts(sourcePosts);
      const built = buildLiveThreadRows(dedupeLivePostsByCheckinId(seeded));
      const withDays = stableDayBreak ? insertLiveDayBreaks(built, stableDayBreak) : built;
      const rows = reuseLiveThreadRows(prevRowsRef.current, withDays);
      prevRowsRef.current = rows;
      return {
        rows,
        error: null as string | null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'Couldn’t load Live.');
      console.log('[blob:live]', {
        reason: 'build',
        message,
        stack: error instanceof Error ? error.stack : null,
      });
      return { rows: EMPTY_LIVE_ROWS, error: message };
    }
  }, [sourcePosts, stableDayBreak]);
  const rows = thread.rows;
  const buildError = thread.error;

  const challengeIdRef = useRef(readCursorChallengeId);
  challengeIdRef.current = readCursorChallengeId;
  const queryClient = useQueryClient();
  const hadRowsRef = useRef(false);
  const newestPostIdRef = useRef<string | null>(null);
  /**
   * Scroll position is tracked in refs, not state.
   *
   * These are read from scroll and content-size callbacks that fire many times per gesture. Holding
   * them in state would re-render the list on every frame of a drag, which is how the thread ends up
   * fighting the user in the first place.
   */
  const atEndRef = useRef(false);
  const draggingRef = useRef(false);
  const firstPaintPendingRef = useRef(true);
  /** Last reported offset, used to tell a user's upward scroll from our own downward pin. */
  const lastOffsetRef = useRef(0);
  const emptyList = rows.length === 0;
  const listContentStyle = useMemo(
    () => ({
      flexGrow: 1,
      justifyContent: emptyList ? ('center' as const) : undefined,
      gap: 12,
      paddingTop: 12,
      paddingBottom: 8,
      overflow: 'visible' as const,
    }),
    [emptyList],
  );
  const listLatchedRef = useRef(false);
  if (!isLoading || rows.length > 0 || error || buildError) {
    listLatchedRef.current = true;
  }
  const showBootSpinner = !listLatchedRef.current && Boolean(isLoading);
  useEffect(() => {
    stopAllLiveMedia();
    console.log('[blob:live]', { reason: 'mount', challengeId: challengeIdRef.current ?? null });
    return () => {
      stopAllLiveMedia();
      console.log('[blob:live]', { reason: 'unmount', challengeId: challengeIdRef.current ?? null });
    };
  }, []);
  useEffect(() => {
    const list = posts ?? [];
    const newest = list.reduce<PostWithMeta | null>((found, post) => {
      if (!post?.id) {
        return found;
      }
      if (!found) {
        return post;
      }
      const left = Date.parse(String(found.created_at ?? ''));
      const right = Date.parse(String(post.created_at ?? ''));
      if (right > left) {
        return post;
      }
      if (right === left && String(post.id) > String(found.id)) {
        return post;
      }
      return found;
    }, null);
    if (hadRowsRef.current && list.length === 0) {
      logUnexpectedLiveReset({
        reason: 'reset',
        postId: newestPostIdRef.current,
        checkinId: newest?.checkin_id ?? null,
        mediaCount: 0,
        y: lastOffsetRef.current,
      });
    }
    if (list.length > 0) {
      hadRowsRef.current = true;
    }
    newestPostIdRef.current = newest?.id ?? newestPostIdRef.current;
  }, [posts]);
  useEffect(() => {
    const userId = String(currentUserId ?? '').trim();
    if (!userId) {
      return;
    }
    void backfillLatestFitnessOcr({
      userId,
      queryClient,
    }).catch(() => undefined);
  }, [currentUserId, queryClient]);
  const commentsReady = !isLoading;
  const highlightKey = highlightCommentId
    ? `comment:${highlightCommentId}`
    : highlightPostId
      ? `post:${highlightPostId}`
      : null;

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
      if ((postsRef.current?.length ?? 0) === 0) {
        logLive(`skip-pin-empty:${why}`);
        return;
      }
      if (!shouldPinToLiveEnd({
        atEnd: atEndRef.current,
        dragging: draggingRef.current,
        firstPaintPending: firstPaintPendingRef.current,
      })) {
        logLive(`skip-pin:${why}`);
        return;
      }
      if (why !== 'first-paint' && why !== 'new-post' && why !== 'composer-open') {
        const newest = postsRef.current?.[postsRef.current.length - 1];
        logUnexpectedLiveReset({
          reason: why,
          postId: newest?.id ?? null,
          checkinId: newest?.checkin_id ?? null,
          mediaCount: Array.isArray(newest?.media_urls) ? newest.media_urls.length : 0,
          y: lastOffsetRef.current,
        });
      }
      logLive(`pin:${why}`);
      atEndRef.current = true;
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated });
      });
    },
    [logLive],
  );

  const markReadLatestRef = useRef<() => void>(() => undefined);

  /** The user asked for the newest row, so this one ignores the guard. */
  const jumpToLiveEdge = useCallback(() => {
    logLive('jump-to-newest');
    atEndRef.current = true;
    firstPaintPendingRef.current = false;
    setNotAtEnd(false);
    setNewBelow(0);
    markReadLatestRef.current();
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
    setMissingComment(commentTargetHardMissing(comments, highlightCommentId, commentsReady));
  }, [commentsReady, highlightCommentId, posts]);

  useEffect(() => {
    if (!highlightCommentId && !highlightPostId) {
      setHighlightFlash(false);
      return;
    }
    setHighlightFlash(true);
    const timer = setTimeout(() => setHighlightFlash(false), LIVE_COMMENT_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightCommentId, highlightPostId]);

  const landingChallengeId = readCursorChallengeId ?? '';
  useEffect(() => {
    return () => {
      clearLiveInitialScroll(landingChallengeId);
    };
  }, [landingChallengeId]);

  useEffect(() => {
    if (!focused || rows.length === 0) {
      return;
    }
    if (landingChallengeId && hasLiveInitialScroll(landingChallengeId)) {
      firstPaintPendingRef.current = false;
      return;
    }
    const landing = liveLandingFocus({
      commentId: highlightCommentId,
      postId: highlightPostId,
      sentPostId: peekSentLiveCheckin(landingChallengeId),
    });
    if (landing.commentId || landing.postId) {
      const index = findLiveHighlightIndex(rows, landing.postId, landing.commentId);
      if (index < 0) {
        if (!commentsReady && landing.commentId) {
          return;
        }
        if (!landing.latest) {
          return;
        }
      } else {
        highlightedOnce.current = highlightKey;
        firstPaintPendingRef.current = false;
        markLiveInitialScroll(landingChallengeId);
        takeSentLiveCheckin(landingChallengeId);
        const timer = setTimeout(() => {
          try {
            listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.35 });
          } catch {
            // Keep the targeted index. Do not bounce to newest or Day 1.
          }
        }, 80);
        return () => clearTimeout(timer);
      }
    }
    firstPaintPendingRef.current = true;
    pinToLiveEdge(false, 'first-paint');
    if (landingChallengeId) {
      takeSentLiveCheckin(landingChallengeId);
    }
    // `rows` is deliberately absent: this effect must run when the thread opens or a link targets a
    // message, never every time a row arrives or a reaction changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentsReady, focused, highlightCommentId, highlightKey, highlightPostId, landingChallengeId, pinToLiveEdge, rows.length === 0]);

  const lastNewestIdRef = useRef<string | null>(null);
  useEffect(() => {
    let newestId: string | null = null;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      if (row.kind === 'post') {
        newestId = row.post.id;
        break;
      }
    }
    const previous = lastNewestIdRef.current;
    lastNewestIdRef.current = newestId;
    if (previous && newestId && newestId !== previous) {
      pinToLiveEdge(false, 'new-post');
    }
  }, [pinToLiveEdge, rows]);

  // Keep pinning until the newest row is on screen. A single scrollToEnd on a half-measured
  // list is how Live parked on Day 2. Stop only when the user scrolls up or time runs out
  // after we have actually landed.
  useEffect(() => {
    const retry = setInterval(() => {
      if (firstPaintPendingRef.current && !draggingRef.current) {
        pinToLiveEdge(false, 'first-paint');
      }
    }, 350);
    const stop = setTimeout(() => {
      if (firstPaintPendingRef.current && atEndRef.current) {
        firstPaintPendingRef.current = false;
        markLiveInitialScroll(landingChallengeId);
      }
      firstPaintPendingRef.current = false;
    }, 2200);
    return () => {
      clearInterval(retry);
      clearTimeout(stop);
    };
  }, [landingChallengeId, pinToLiveEdge]);

  const reads = useLiveThreadReads(readCursorChallengeId);
  markReadLatestRef.current = () => {
    const latestAt = rows[rows.length - 1]?.createdAt;
    if (latestAt) {
      reads.markRead(latestAt);
    }
  };
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
        markLiveInitialScroll(landingChallengeId);
      }
      lastOffsetRef.current = contentOffset.y;
      if (end !== atEndRef.current) {
        atEndRef.current = end;
        setNotAtEnd(!end);
      }
      if (end) {
        // Parked at the newest row. Do not retire the opening pin here — a half-measured list
        // reports "at the end" while still sitting on Day 2.
        bottomAnchorRef.current = rows[rows.length - 1]?.id ?? null;
        if (!firstPaintPendingRef.current) {
          markLiveInitialScroll(landingChallengeId);
        }
        const latestAt = rows[rows.length - 1]?.createdAt;
        if (latestAt) {
          reads.markRead(latestAt);
        }
        if (newBelow !== 0) {
          setNewBelow(0);
        }
      }
    },
    [landingChallengeId, newBelow, reads, rows],
  );

  // New rows arriving while the reader is scrolled up become a count on the jump control, never a
  // scroll. Their viewport does not move.
  useEffect(() => {
    if (atEndRef.current) {
      return;
    }
    setNewBelow(liveNewBelowCount(rows, bottomAnchorRef.current, currentUserId, reads.cursor));
  }, [currentUserId, reads.cursor, rows]);

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
      if (!split.text && split.mediaUrls.length === 0 && !attachedLift) {
        return;
      }
      await onCompose({
        content: split.text,
        mediaUrls: split.mediaUrls,
        source: composeSource,
        audience: composeAudience,
        mentionedUserIds,
        parentId: parentId ?? null,
        liftSessionId: attachedLift?.id ?? null,
      });
      setAttachedLift(null);
      setReplyTo(null);
      // Sending is an explicit act: the author always lands on their own new message.
      jumpToLiveEdge();
    },
    [attachedLift, composeAudience, composeSource, editPost, editing, jumpToLiveEdge, onCompose],
  );

  const [composerOpen, setComposerOpen] = useState(false);

  const collapseComposer = useCallback(() => {
    Keyboard.dismiss();
    setComposerOpen(false);
  }, []);

  const startReply = useCallback((target: LiveReplyTarget) => {
    setEditing(null);
    setReplyTo(target);
    setComposerOpen(true);
  }, []);

  useEffect(() => {
    if (focused) {
      return;
    }
    setReplyTo(null);
    setComposerOpen(false);
    Keyboard.dismiss();
  }, [focused]);

  const startEdit = useCallback((post: PostWithMeta) => {
    if (isLiveCheckinPost(post) && post.challenge_id) {
      social?.openEdit(post);
      return;
    }
    setReplyTo(null);
    setEditing(post);
  }, [social]);

  const renderItem = useCallback(
    ({ item, index }: { item: LiveThreadRow; index: number }) => {
      const bubble = (() => {
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
              highlighted={highlightFlash && highlightCommentId === item.comment.id}
              quote={{
                name: parentAuthor.name,
                text: liveQuotePreview(item.parent) || liveChatText(item.parent.content, item.parent.media_urls),
                avatarUrl: parentAuthor.avatarUrl,
              }}
              reactions={item.comment.deleted_at ? [] : item.comment.reactions}
              onReact={(type) => onReact(item.parent, type, item.comment.id)}
              onOpenWho={(type) =>
                openWho(item.parent.id, type, item.comment.id, item.comment.reactions)
              }
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
            highlighted={highlightFlash && highlightPostId === item.post.id && !highlightCommentId}
            quote={quote}
            onReact={(type) => onReact(item.post, type)}
            onOpenWho={(type) => openWho(item.post.id, type, null, item.post.reactions)}
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
      })();
      return (
        <LiveRowBoundary postId={liveRowKey(item, index)} onError={onRowError}>
          {bubble}
        </LiveRowBoundary>
      );
    },
    [canCompose, currentUserId, highlightCommentId, highlightFlash, highlightPostId, onReact, onRowError, openWho, posts, social, startEdit, startReply],
  );

  const renderQuietEmpty = useCallback(
    () => (
      <Pressable accessibilityRole="button" onPress={collapseComposer}>
        <LiveQuietEmpty title={emptyTitle} body={emptyBody} />
      </Pressable>
    ),
    [collapseComposer, emptyBody, emptyTitle],
  );

  const composerPad = liveComposerInset({
    keyboardHeight,
    closedPad: Math.max(footerReserve, 0),
    layoutAlreadyAvoidsKeyboard: Platform.OS === 'android',
  });
  const composerHRef = useRef(0);

  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        backgroundColor: THEME.background,
      }}>
      {showBootSpinner ? (
        <MascotState kind="loading" title={loadingTitle ?? 'Loading Live'} compact />
      ) : (
        <View style={{ flex: 1, minHeight: 0 }}>
        {buildError || rowBanner || (error && emptyList) ? (
          <LiveFailBanner
            message={buildError || rowBanner || error || ''}
            onRetry={() => {
              setRowBanner(null);
              onRetry?.();
            }}
          />
        ) : null}
        <LiveSafeBoundary>
        <FlatList
          ref={listRef}
          data={rows}
          extraData={currentUserId ?? ''}
          keyExtractor={(item) => liveRowKey(item)}
          renderItem={renderItem}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          nestedScrollEnabled
          automaticallyAdjustKeyboardInsets={false}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => {
            draggingRef.current = true;
            firstPaintPendingRef.current = false;
            collapseComposer();
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
            if (emptyList) {
              return;
            }
            if (highlightKey && highlightedOnce.current === highlightKey) {
              return;
            }
            if (!firstPaintPendingRef.current) {
              return;
            }
            // Keep pinning until the newest row is actually on screen. Marking the visit
            // “scrolled” on the first incomplete scrollToEnd is how Live parked on Day 2.
            pinToLiveEdge(false, 'first-paint');
          }}
          onScrollToIndexFailed={() => {
            if (emptyList) {
              return;
            }
            if (highlightKey && highlightedOnce.current === highlightKey) {
              return;
            }
            if (firstPaintPendingRef.current) {
              pinToLiveEdge(false, 'first-paint');
            }
          }}
          contentContainerStyle={listContentStyle}
          ListEmptyComponent={renderQuietEmpty}
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

        </LiveSafeBoundary>
        </View>
      )}

      {notAtEnd ? (
        <View style={{ alignItems: 'center', paddingTop: 2, paddingBottom: 2 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={liveJumpLabel(newBelow)}
            onPress={jumpToLiveEdge}
            hitSlop={8}
            style={{
              minHeight: 32,
              paddingHorizontal: 12,
              borderRadius: 999,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: THEME.primary,
            }}>
            <Glyph name={GLYPH.chevronDown} color="#FFFFFF" size={14} />
            {newBelow > 0 ? (
              <AppText className="text-[12px] font-semibold" style={{ color: '#FFFFFF' }}>
                {newBelow > 99 ? '99+' : newBelow}
              </AppText>
            ) : null}
          </Pressable>
        </View>
      ) : null}

      {canCompose ? (
        <View
          onLayout={(event) => {
            const next = event.nativeEvent.layout.height;
            if (next === composerHRef.current) {
              return;
            }
            composerHRef.current = next;
            if (atEndRef.current) {
              pinToLiveEdge(false, 'composer-open');
            }
          }}
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
            idleOneLine
            expanded={composerOpen}
            attachedLift={editing ? null : attachedLift}
            onAttachLift={editing ? undefined : () => setLiftOpen(true)}
            onRemoveLift={() => setAttachedLift(null)}
            autoFocus={Boolean(replyTo || editing)}
            placeholder={placeholder ?? copy('live.placeholder')}
            submitLabel={editing ? copy('live.save') : (sendLabel ?? copy('live.send'))}
            submitting={Boolean(composing || editPost.isPending)}
            audience={composeAudience}
            memberIds={memberIds}
            draftKey={`live:${readCursorChallengeId || composeSource}`}
            initialText={editing ? liveEditPrefill(editing) : undefined}
            // Quote chip is the reply. Never seed @.
            replyTo={null}
            onExpandedChange={setComposerOpen}
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

      <LiftPickerSheet
        visible={liftOpen}
        onClose={() => setLiftOpen(false)}
        onPick={(session) => {
          setAttachedLift(session);
          setLiftOpen(false);
        }}
      />
      <WhoReactedSheet
        target={
          whoReacted
            ? {
                ...whoReacted,
                reactions: whoReacted.commentId
                  ? posts.find((post) => post.id === whoReacted.postId)?.comments?.find(
                      (comment) => comment.id === whoReacted.commentId,
                    )?.reactions ?? whoReacted.reactions
                  : posts.find((post) => post.id === whoReacted.postId)?.reactions ??
                    whoReacted.reactions,
              }
            : null
        }
        currentUserId={currentUserId}
        onToggle={(type) => {
          if (!whoReacted) {
            return;
          }
          const post = posts.find((row) => row.id === whoReacted.postId);
          if (!post) {
            return;
          }
          onReact(post, type, whoReacted.commentId);
        }}
        onClose={() => setWhoReacted(null)}
      />
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
