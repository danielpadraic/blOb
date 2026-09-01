import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveBubble } from '@/components/challenge/LiveBubble';
import { createStickyFooterPad } from '@/components/challenge/create/wizardUi';
import { InlineComposer } from '@/components/feed/InlineComposer';
import { MascotState } from '@/components/mascot/MascotState';
import { useKeyboardOverlap } from '@/components/ui/KeyboardFormShell';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import {
  LIVE_CHIP_DONE,
  LIVE_CHIP_STARTING,
  buildLiveThreadRows,
  findLiveParent,
  liveChatText,
  isLiveCheckinPost,
  liveComposeFromInline,
  liveQuotePreview,
  type LiveThreadRow,
} from '@/lib/liveThread';
import type { MentionChip } from '@/lib/mentions';
import { authorLabel } from '@/lib/safeIds';
import { tabBarLift, THEME } from '@/lib/theme';
import type { CommentWithAuthor, ComposeInput, PostWithMeta, ReactionType } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

type LiveReplyTarget = {
  postId: string;
  name: string;
  preview: string;
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
  footerReserve?: number;
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
  footerReserve = 0,
  onRefresh,
  onRetry,
  onCompose,
  onReact,
}: LiveThreadProps) {
  const insets = useSafeAreaInsets();
  const keyboardOverlap = useKeyboardOverlap();
  const keyboardOpen = keyboardOverlap > 0;
  const listRef = useRef<FlatList<LiveThreadRow>>(null);
  const highlightedOnce = useRef<string | null>(null);
  const [replyTo, setReplyTo] = useState<LiveReplyTarget | null>(null);
  const rows = useMemo(() => buildLiveThreadRows(posts), [posts]);
  const lastId = rows.at(-1)?.id;

  const pinToLiveEdge = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (rows.length === 0) {
      return;
    }
    if (
      highlightPostId &&
      highlightPostId !== lastId &&
      highlightedOnce.current !== highlightPostId
    ) {
      const index = rows.findIndex((row) => row.id === highlightPostId);
      if (index >= 0) {
        highlightedOnce.current = highlightPostId;
        const timer = setTimeout(() => {
          try {
            listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.85 });
          } catch {
            pinToLiveEdge(false);
          }
        }, 80);
        return () => clearTimeout(timer);
      }
    }
    pinToLiveEdge(false);
  }, [highlightPostId, lastId, pinToLiveEdge, rows]);

  const submitLine = useCallback(
    async (content: string, mentionedUserIds: string[] = [], parentId?: string | null) => {
      const split = liveComposeFromInline(content);
      if (!split.text && split.mediaUrls.length === 0) {
        return;
      }
      await onCompose({
        content: split.text,
        mediaUrls: split.mediaUrls,
        source: 'challenge',
        audience: 'public',
        mentionedUserIds,
        parentId: parentId ?? null,
      });
      setReplyTo(null);
      pinToLiveEdge(true);
    },
    [onCompose, pinToLiveEdge],
  );

  const submitChip = useCallback(
    async (line: string) => {
      if (composing) {
        return;
      }
      try {
        await submitLine(line);
      } catch (error) {
        Alert.alert('Couldn’t post that', getErrorMessage(error));
      }
    },
    [composing, submitLine],
  );

  const startReply = useCallback((target: LiveReplyTarget) => {
    setReplyTo(target);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: LiveThreadRow }) => {
      if (item.kind === 'comment') {
        const display = commentAsLivePost(item.comment, item.parent);
        return (
          <View style={{ paddingHorizontal: 16, overflow: 'visible' }}>
            <LiveBubble
              post={display}
              currentUserId={currentUserId}
              quote={{
                name: authorLabel(item.parent.author),
                text: liveQuotePreview(item.parent) || liveChatText(item.parent.content, item.parent.media_urls),
              }}
              reactions={item.comment.reactions}
              onReact={(type) => onReact(item.parent, type, item.comment.id)}
              onReply={
                canCompose
                  ? () =>
                      startReply({
                        postId: item.parent.id,
                        name: authorLabel(item.comment.author),
                        preview: liveChatText(item.comment.content) || 'Message',
                        mention: mentionFromAuthor(item.comment.author, item.comment.author_id),
                      })
                  : undefined
              }
            />
          </View>
        );
      }

      const parent = findLiveParent(posts, item.post.parent_id);
      const quote =
        parent && !isLiveCheckinPost(item.post)
          ? {
              name: authorLabel(parent.author),
              text: liveQuotePreview(parent),
            }
          : null;
      return (
        <View style={{ paddingHorizontal: 16, overflow: 'visible' }}>
          <LiveBubble
            post={item.post}
            currentUserId={currentUserId}
            highlighted={highlightPostId === item.post.id}
            quote={quote}
            onReact={(type) => onReact(item.post, type)}
            onReply={
              canCompose
                ? () =>
                    startReply({
                      postId: item.post.id,
                      name: authorLabel(item.post.author),
                      preview: liveQuotePreview(item.post) || 'Message',
                      mention: mentionFromAuthor(item.post.author, item.post.author_id),
                    })
                : undefined
            }
          />
        </View>
      );
    },
    [canCompose, currentUserId, highlightPostId, onReact, posts, startReply],
  );

  const composerPad = createStickyFooterPad(
    keyboardOpen,
    tabBarLift(insets.bottom, 'sticky') + 8 + Math.max(footerReserve, 0),
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
        <MascotState kind="loading" title="Loading Live" compact />
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            if (
              highlightPostId &&
              highlightPostId !== lastId &&
              highlightedOnce.current === highlightPostId
            ) {
              return;
            }
            listRef.current?.scrollToEnd({ animated: false });
          }}
          onScrollToIndexFailed={() => pinToLiveEdge(false)}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'flex-end',
            gap: 12,
            paddingTop: 12,
            paddingBottom: 12,
            overflow: 'visible',
          }}
          ListEmptyComponent={
            <MascotState kind="empty" title={emptyTitle} body={emptyBody} compact />
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
      )}

      {canCompose ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: THEME.border,
            backgroundColor: THEME.background,
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: composerPad,
          }}>
          <View className="mb-2 flex-row" style={{ gap: 8 }}>
            <LiveChip
              label={LIVE_CHIP_STARTING}
              disabled={Boolean(composing)}
              onPress={() => void submitChip(LIVE_CHIP_STARTING)}
            />
            <LiveChip
              label={LIVE_CHIP_DONE}
              disabled={Boolean(composing)}
              onPress={() => void submitChip(LIVE_CHIP_DONE)}
            />
          </View>
          {replyTo ? (
            <View
              className="mb-2 flex-row items-center"
              style={{
                gap: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 12,
                backgroundColor: THEME.surface,
                borderWidth: 1,
                borderColor: THEME.border,
              }}>
              <View style={{ flex: 1, minWidth: 0, borderLeftWidth: 2, borderLeftColor: THEME.accent, paddingLeft: 8 }}>
                <AppText className="text-[11px] font-semibold" style={{ color: THEME.accent }} numberOfLines={1}>
                  {replyTo.name}
                </AppText>
                <AppText className="text-[12px]" style={{ color: THEME.textMuted }} numberOfLines={1}>
                  {replyTo.preview}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel reply"
                onPress={() => setReplyTo(null)}
                style={{ minHeight: 32, minWidth: 32, alignItems: 'center', justifyContent: 'center' }}>
                <AppText className="text-[16px] font-semibold" style={{ color: THEME.textMuted }}>
                  ×
                </AppText>
              </Pressable>
            </View>
          ) : null}
          <InlineComposer
            key={replyTo?.postId ?? 'live'}
            pinned
            autoFocus={Boolean(replyTo)}
            placeholder={copy('live.placeholder')}
            submitLabel={copy('live.send')}
            submitting={composing}
            audience="public"
            replyTo={replyTo?.mention}
            onSubmit={async (content, mentionedUserIds) => {
              try {
                await submitLine(content, mentionedUserIds, replyTo?.postId);
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

const LiveChip = memo(function LiveChip({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 32,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: THEME.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
      }}>
      <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
        {label}
      </AppText>
    </Pressable>
  );
});

function mentionFromAuthor(
  author: PostWithMeta['author'],
  authorId: string,
): MentionChip | null {
  const username = author?.username?.trim();
  if (!username && !authorId) {
    return null;
  }
  return {
    userId: authorId,
    username: username || authorId,
    label: authorLabel(author),
  };
}

function commentAsLivePost(comment: CommentWithAuthor, parent: PostWithMeta): PostWithMeta {
  return {
    id: comment.id,
    author_id: comment.author_id,
    author: comment.author,
    challenge_id: parent.challenge_id,
    content: comment.content,
    media_urls: [],
    created_at: comment.created_at,
    mentions: comment.mentions,
    reactions: comment.reactions,
    comments: [],
    source: 'challenge',
    parent_id: parent.id,
  };
}
