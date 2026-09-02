import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Platform, RefreshControl, ScrollView, View, type ViewToken } from 'react-native';

import { CheckinStackCard } from '@/components/feed/CheckinStackCard';
import { Composer } from '@/components/feed/Composer';
import { PostCard } from '@/components/feed/PostCard';
import { VisiblePostsProvider } from '@/components/feed/PostMediaCarousel';
import { MascotState } from '@/components/mascot/MascotState';
import { useTourOptional } from '@/components/tour/TourContext';
import { AppText } from '@/components/ui/AppText';
import { useCopyTone } from '@/hooks/useCopy';
import { copy } from '@/lib/copy';
import { HOME_FEED_SPLASH_MS, shouldShowHomeSplash } from '@/lib/homeFeed';
import { isHomeCheckinStack, stackHomeCheckinPosts, type HomeCheckinStack } from '@/lib/multiCheckin';
import { FEED_COLUMN_MAX, TAB_BAR_CONTENT_INSET, THEME } from '@/lib/theme';
import type { ComposeInput, PostWithMeta, ReactionType } from '@/lib/types';

type HomeFeedRow =
  | { kind: 'post'; id: string; post: PostWithMeta }
  | { kind: 'stack'; id: string; stack: HomeCheckinStack; posts: PostWithMeta[] };

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
  stickyAbove?: ReactNode;
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
  homeChrome?: boolean;
  midFeedRail?: ReactNode;
  isFetchingNextPage?: boolean;
  onEndReached?: () => void;
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
  homeChrome?: boolean;
  onReact: FeedListProps['onReact'];
  onComment?: FeedListProps['onComment'];
};

const FeedRow = memo(function FeedRow({
  post,
  currentUserId,
  hideAudience,
  challengeFeed,
  highlighted,
  homeChrome,
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
      homeFeed={homeChrome}
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
  stickyAbove,
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
  homeChrome,
  midFeedRail,
  isFetchingNextPage,
  onEndReached,
  onRefresh,
  onRetry,
  onCompose,
  onReact,
  onComment,
}: FeedListProps) {
  const listRef = useRef<FlatList<HomeFeedRow>>(null);
  const [visibleIds, setVisibleIds] = useState<ReadonlySet<string>>(() => new Set());
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const ids = new Set<string>();
    for (const row of viewableItems) {
      const item = row.item as HomeFeedRow;
      if (item.kind === 'stack') {
        item.posts.forEach((post) => {
          if (post?.id) {
            ids.add(post.id);
          }
        });
      } else if (item.post?.id) {
        ids.add(item.post.id);
      }
    }
    setVisibleIds(ids);
  }).current;
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: homeChrome ? 50 : 35,
    minimumViewTime: 80,
  }).current;
  const tour = useTourOptional();
  const tourLocked = Boolean(tour?.active);
  const tone = useCopyTone();
  const visiblePosts = useMemo(
    () => posts.filter((post) => Boolean(post?.id) && !post.deleted_at),
    [posts],
  );
  const feedRows = useMemo<HomeFeedRow[]>(() => {
    if (!homeChrome) {
      return visiblePosts.map((post) => ({ kind: 'post', id: post.id, post }));
    }
    const byId = new Map(visiblePosts.map((post) => [post.id, post]));
    const rows: HomeFeedRow[] = [];
    for (const item of stackHomeCheckinPosts(visiblePosts)) {
      if (isHomeCheckinStack(item)) {
        const children = item.postIds
          .map((id) => byId.get(id))
          .filter((post): post is PostWithMeta => Boolean(post));
        if (children.length < 2) {
          for (const post of children) {
            rows.push({ kind: 'post', id: post.id, post });
          }
          continue;
        }
        rows.push({
          kind: 'stack',
          id: `stack:${item.firstPostId}`,
          stack: item,
          posts: children,
        });
        continue;
      }
      const post = byId.get(item.id);
      if (post) {
        rows.push({ kind: 'post', id: post.id, post });
      }
    }
    return rows;
  }, [homeChrome, visiblePosts]);
  const challengeFeed = composeSource === 'challenge' || composeSource === 'circle';
  const scrolledTo = useRef<string | null>(null);
  const [slowSplash, setSlowSplash] = useState(false);

  useEffect(() => {
    if (!homeChrome || visiblePosts.length > 0) {
      setSlowSplash(false);
      return;
    }
    if (!isLoading) {
      return;
    }
    const timer = setTimeout(() => setSlowSplash(true), HOME_FEED_SPLASH_MS);
    return () => clearTimeout(timer);
  }, [homeChrome, isLoading, visiblePosts.length]);

  const showHomeSplash = Boolean(
    homeChrome &&
      shouldShowHomeSplash({
        postCount: visiblePosts.length,
        isLoading,
        failed: Boolean(error),
        waitedMs: slowSplash ? HOME_FEED_SPLASH_MS : 0,
      }),
  );

  useEffect(() => {
    if (!highlightPostId || scrolledTo.current === highlightPostId) {
      return;
    }
    const index = feedRows.findIndex((row) =>
      row.kind === 'stack' ? row.stack.postIds.includes(highlightPostId) : row.post.id === highlightPostId,
    );
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
  }, [feedRows, highlightPostId]);

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
        key={homeChrome ? 'home-composer' : draftKey ?? 'composer'}
        placeholder={composerPlaceholder}
        submitting={composing}
        hideAudience={hideAudience}
        wallHost={wallHost}
        defaultAudience={defaultAudience}
        draftKey={draftKey ?? (challengeFeed ? 'challenge' : 'home')}
        idleUntilFocus={homeChrome}
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
    homeChrome,
    onCompose,
    onComposeSubmit,
    wallHost,
  ]);

  const listHeader = useMemo(
    () => (
      <View className={homeChrome ? 'gap-2' : 'gap-3'}>
        {headerTop}
        {headerExtra}
        {!embedded && !homeChrome ? (
          <View className="flex-row items-end justify-between pt-1">
            <AppText className="text-[18px] font-extrabold text-charcoal">Feed</AppText>
            <AppText className="text-[12px] text-muted">Latest</AppText>
          </View>
        ) : null}
      </View>
    ),
    [embedded, headerExtra, headerTop, homeChrome],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: HomeFeedRow; index: number }) => (
      <View className={homeChrome ? 'mt-2' : 'mt-3'}>
        {item.kind === 'stack' ? (
          <CheckinStackCard
            stack={item.stack}
            posts={item.posts}
            currentUserId={currentUserId}
            highlighted={Boolean(highlightPostId && item.stack.postIds.includes(highlightPostId))}
            startExpanded={Boolean(highlightPostId && item.stack.postIds.includes(highlightPostId))}
            onReact={onReact}
            onComment={onComment}
          />
        ) : (
          <FeedRow
            post={item.post}
            currentUserId={currentUserId}
            hideAudience={hideAudience}
            challengeFeed={challengeFeed}
            highlighted={highlightPostId === item.post.id}
            homeChrome={homeChrome}
            onReact={onReact}
            onComment={onComment}
          />
        )}
        {homeChrome && midFeedRail && index === 1 ? (
          <View className="mt-2">{midFeedRail}</View>
        ) : null}
      </View>
    ),
    [challengeFeed, currentUserId, hideAudience, highlightPostId, homeChrome, midFeedRail, onComment, onReact],
  );

  if (error && !homeChrome && !headerTop && !stickyAbove) {
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

  if (isLoading && !homeChrome) {
    return (
      <View className="gap-3" style={[embedded ? undefined : { flex: 1 }, webColumn]}>
        {stickyAbove}
        {composer && !homeChrome ? (
          <View pointerEvents={tourLocked ? 'none' : 'auto'}>{composer}</View>
        ) : null}
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
      {stickyAbove}
      {composer ? (
        <View
          pointerEvents={tourLocked ? 'none' : 'auto'}
          style={{ marginBottom: homeChrome ? 8 : 12 }}>
          {composer}
        </View>
      ) : null}
      <VisiblePostsProvider ids={visibleIds}>
        <FlatList
        ref={(node) => {
          listRef.current = node;
          tour?.setHomeScroll(node as unknown as ScrollView);
        }}
        scrollEnabled={!tourLocked}
        data={feedRows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onEndReached={() => {
          if (!onEndReached || isFetchingNextPage) {
            return;
          }
          onEndReached();
        }}
        onEndReachedThreshold={homeChrome ? 0.5 : 0.2}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="items-center py-3">
              <ActivityIndicator color={THEME.accent} />
            </View>
          ) : null
        }
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToOffset({ offset: Math.max(info.averageItemLength * info.index, 0), animated: true });
          }, 160);
        }}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <HomeListEmpty
            homeChrome={homeChrome}
            showHomeSplash={showHomeSplash}
            isLoading={isLoading}
            error={error}
            empty={empty}
            emptyTitle={emptyTitle}
            emptyBody={emptyBody}
            onRetry={onRetry}
          />
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
            ? ({ flex: 1, overflowY: 'auto', overflowX: 'hidden', overscrollBehaviorX: 'none' } as object)
            : { flex: 1 }
        }
        />
      </VisiblePostsProvider>
    </View>
  );
}

const HomeListEmpty = memo(function HomeListEmpty({
  homeChrome,
  showHomeSplash,
  isLoading,
  error,
  empty,
  emptyTitle,
  emptyBody,
  onRetry,
}: {
  homeChrome?: boolean;
  showHomeSplash: boolean;
  isLoading?: boolean;
  error?: string | null;
  empty?: ReactNode;
  emptyTitle: string;
  emptyBody: string;
  onRetry?: () => void;
}) {
  if (homeChrome) {
    if (showHomeSplash) {
      return (
        <MascotState
          kind={error ? 'error' : 'loading'}
          title={copy('home.loadingSlow')}
          actionLabel="Retry"
          onAction={onRetry}
        />
      );
    }
    if (isLoading) {
      return <HomeFeedPlaceholders />;
    }
    if (error) {
      return null;
    }
  }
  return empty ?? <MascotState kind="empty" title={emptyTitle} body={emptyBody} />;
});

function HomeFeedPlaceholders() {
  return (
    <View className="mt-2" style={{ gap: 10 }}>
      {[0, 1, 2].map((key) => (
        <View
          key={key}
          style={{
            height: 132,
            borderRadius: THEME.radius,
            backgroundColor: THEME.surface,
            borderWidth: 1,
            borderColor: THEME.border,
          }}
        />
      ))}
    </View>
  );
}
