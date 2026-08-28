import { memo, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { FlatList, Platform, RefreshControl, ScrollView, View } from 'react-native';

import { Composer } from '@/components/feed/Composer';
import { PostCard } from '@/components/feed/PostCard';
import { MascotState } from '@/components/mascot/MascotState';
import { useTourOptional } from '@/components/tour/TourContext';
import { AppText } from '@/components/ui/AppText';
import { useCopyTone } from '@/hooks/useCopy';
import { copy } from '@/lib/copy';
import { FEED_COLUMN_MAX, TAB_BAR_CONTENT_INSET, THEME } from '@/lib/theme';
import type { ComposeInput, PostWithMeta, ReactionType } from '@/lib/types';

type FeedListProps = {
  posts: PostWithMeta[];
  isLoading?: boolean;
  isRefreshing?: boolean;
  error?: string | null;
  currentUserId?: string;
  emptyTitle: string;
  emptyBody: string;
  composerPlaceholder?: string;
  canCompose?: boolean;
  composing?: boolean;
  commenting?: boolean;
  embedded?: boolean;
  headerTop?: ReactNode;
  headerExtra?: ReactNode;
  empty?: ReactNode;
  highlightPostId?: string;
  onHighlightedLayout?: (y: number) => void;
  hideAudience?: boolean;
  composeSource?: ComposeInput['source'];
  wallHost?: { id: string; name?: string | null; username?: string | null } | null;
  defaultAudience?: ComposeInput['audience'];
  draftKey?: string;
  onRefresh?: () => void;
  onRetry?: () => void;
  onCompose?: (input: ComposeInput) => Promise<unknown> | void;
  onReact: (post: PostWithMeta, type: ReactionType, commentId?: string | null) => void;
  onComment?: (
    post: PostWithMeta,
    content: string,
    parentId?: string | null,
    mentionedUserIds?: string[],
  ) => Promise<unknown> | void;
};

type FeedRowProps = {
  post: PostWithMeta;
  currentUserId?: string;
  hideAudience?: boolean;
  challengeFeed?: boolean;
  highlighted?: boolean;
  onReact: FeedListProps['onReact'];
  onComment?: FeedListProps['onComment'];
};

const FeedRow = memo(function FeedRow({
  post,
  currentUserId,
  hideAudience,
  challengeFeed,
  highlighted,
  onReact,
  onComment,
}: FeedRowProps) {
  const handleReact = useCallback(
    (type: ReactionType, commentId?: string | null) => {
      onReact(post, type, commentId);
    },
    [onReact, post],
  );
  const handleComment = useMemo(() => {
    if (!onComment) {
      return undefined;
    }
    return (content: string, parentId?: string | null, mentionedUserIds?: string[]) =>
      onComment(post, content, parentId, mentionedUserIds);
  }, [onComment, post]);

  return (
    <PostCard
      post={post}
      currentUserId={currentUserId}
      hideAudience={hideAudience}
      challengeFeed={challengeFeed}
      highlighted={highlighted}
      onReact={handleReact}
      onComment={handleComment}
    />
  );
});

export function FeedList({
  posts,
  isLoading,
  isRefreshing,
  error,
  currentUserId,
  emptyTitle,
  emptyBody,
  composerPlaceholder,
  canCompose = true,
  composing,
  commenting: _commenting,
  embedded,
  headerTop,
  headerExtra,
  empty,
  highlightPostId,
  onHighlightedLayout,
  hideAudience,
  composeSource,
  wallHost,
  defaultAudience,
  draftKey,
  onRefresh,
  onRetry,
  onCompose,
  onReact,
  onComment,
}: FeedListProps) {
  const listRef = useRef<FlatList<PostWithMeta>>(null);
  const tour = useTourOptional();
  const tourLocked = Boolean(tour?.active);
  const tone = useCopyTone();
  const visiblePosts = useMemo(() => posts.filter((post) => !post.deleted_at), [posts]);
  const challengeFeed = composeSource === 'challenge';
  const scrolledTo = useRef<string | null>(null);

  useEffect(() => {
    if (!highlightPostId || scrolledTo.current === highlightPostId) {
      return;
    }
    const index = visiblePosts.findIndex((post) => post.id === highlightPostId);
    if (index < 0) {
      return;
    }
    const timer = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.12 });
        scrolledTo.current = highlightPostId;
      } catch {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [highlightPostId, visiblePosts]);

  const onComposeSubmit = useCallback(
    async (input: ComposeInput) => {
      if (!onCompose) {
        return;
      }
      await onCompose({
        ...input,
        source: composeSource ?? input.source ?? 'feed',
        wallHostId: input.wallHostId ?? wallHost?.id ?? null,
      });
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    },
    [composeSource, onCompose, wallHost?.id],
  );

  const composer = useMemo(() => {
    if (!canCompose || !onCompose) {
      return null;
    }
    return (
      <Composer
        placeholder={composerPlaceholder}
        submitting={composing}
        hideAudience={hideAudience}
        wallHost={wallHost}
        defaultAudience={defaultAudience}
        draftKey={draftKey ?? (challengeFeed ? 'challenge' : 'home')}
        onSubmit={onComposeSubmit}
      />
    );
  }, [
    canCompose,
    challengeFeed,
    composerPlaceholder,
    composing,
    defaultAudience,
    draftKey,
    hideAudience,
    onCompose,
    onComposeSubmit,
    wallHost,
  ]);

  const listHeader = useMemo(
    () => (
      <View className="gap-3">
        {headerTop}
        {headerExtra}
        {!embedded ? (
          <View className="flex-row items-end justify-between pt-1">
            <AppText className="text-[18px] font-extrabold text-charcoal">Feed</AppText>
            <AppText className="text-[12px] text-muted">Latest</AppText>
          </View>
        ) : null}
      </View>
    ),
    [embedded, headerExtra, headerTop],
  );

  const renderItem = useCallback(
    ({ item }: { item: PostWithMeta }) => (
      <View className="mt-3">
        <FeedRow
          post={item}
          currentUserId={currentUserId}
          hideAudience={hideAudience}
          challengeFeed={challengeFeed}
          highlighted={highlightPostId === item.id}
          onReact={onReact}
          onComment={onComment}
        />
      </View>
    ),
    [challengeFeed, currentUserId, hideAudience, highlightPostId, onComment, onReact],
  );

  if (error) {
    return (
      <MascotState
        kind="error"
        title={copy('home.error', tone)}
        actionLabel="Try again"
        onAction={onRetry}
      />
    );
  }

  const webColumn =
    Platform.OS === 'web'
      ? { width: '100%' as const, maxWidth: FEED_COLUMN_MAX, alignSelf: 'center' as const }
      : null;

  if (isLoading) {
    return (
      <View className="gap-3" style={[embedded ? undefined : { flex: 1 }, webColumn]}>
        <View pointerEvents={tourLocked ? 'none' : 'auto'}>{composer}</View>
        {listHeader}
        <MascotState kind="loading" title={copy('home.loading', tone)} compact={embedded} />
      </View>
    );
  }

  if (embedded) {
    return (
      <View className="gap-3">
        {listHeader}
        {composer}
        {visiblePosts.length === 0 ? (
          empty ?? <MascotState kind="empty" title={emptyTitle} body={emptyBody} compact />
        ) : (
          visiblePosts.map((post) => (
            <View
              key={post.id}
              onLayout={(event) => {
                if (highlightPostId === post.id) {
                  onHighlightedLayout?.(event.nativeEvent.layout.y);
                }
              }}>
              <FeedRow
                post={post}
                currentUserId={currentUserId}
                hideAudience={hideAudience}
                challengeFeed={challengeFeed}
                highlighted={highlightPostId === post.id}
                onReact={onReact}
                onComment={onComment}
              />
            </View>
          ))
        )}
      </View>
    );
  }

  return (
    <View style={[{ flex: 1 }, webColumn]}>
      {composer ? (
        <View pointerEvents={tourLocked ? 'none' : 'auto'} style={{ marginBottom: 12 }}>
          {composer}
        </View>
      ) : null}
      <FlatList
        ref={(node) => {
          listRef.current = node;
          tour?.setHomeScroll(node as unknown as ScrollView);
        }}
        scrollEnabled={!tourLocked}
        data={visiblePosts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToOffset({ offset: Math.max(info.averageItemLength * info.index, 0), animated: true });
          }, 160);
        }}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={() =>
          empty ?? <MascotState kind="empty" title={emptyTitle} body={emptyBody} />
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        windowSize={7}
        maxToRenderPerBatch={5}
        initialNumToRender={5}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={Platform.OS !== 'web'}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CONTENT_INSET, flexGrow: 1 }}
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
    </View>
  );
}
