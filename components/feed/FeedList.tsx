import type { ReactNode } from 'react';
import { useRef } from 'react';
import { Platform, RefreshControl, ScrollView, View } from 'react-native';

import { Composer } from '@/components/feed/Composer';
import { PostCard } from '@/components/feed/PostCard';
import { MascotState } from '@/components/mascot/MascotState';
import { useTourOptional } from '@/components/tour/TourContext';
import { AppText } from '@/components/ui/AppText';
import { useCopyTone } from '@/hooks/useCopy';
import { copy } from '@/lib/copy';
import { TAB_BAR_CONTENT_INSET, THEME } from '@/lib/theme';
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
  hideAudience?: boolean;
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
  commenting,
  embedded,
  headerTop,
  headerExtra,
  empty,
  highlightPostId,
  hideAudience,
  onRefresh,
  onRetry,
  onCompose,
  onReact,
  onComment,
}: FeedListProps) {
  const scrollRef = useRef<ScrollView>(null);
  const tour = useTourOptional();
  const tone = useCopyTone();

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

  const visiblePosts = posts.filter((post) => !post.deleted_at);
  const body = (
    <>
      {headerTop}
      {headerExtra}

      {canCompose && onCompose ? (
        <Composer
          placeholder={composerPlaceholder}
          submitting={composing}
          hideAudience={hideAudience}
          onSubmit={async (input) => {
            await onCompose(input);
            scrollRef.current?.scrollTo({ y: 0 });
          }}
        />
      ) : null}

      {!embedded ? (
        <View className="flex-row items-end justify-between pt-1">
          <AppText className="text-[18px] font-extrabold text-charcoal">Feed</AppText>
          <AppText className="text-[12px] text-muted">Latest</AppText>
        </View>
      ) : null}

      {isLoading ? (
        <MascotState
          kind="loading"
          title={copy('home.loading', tone)}
          compact={embedded}
        />
      ) : visiblePosts.length === 0 ? (
        empty ?? <MascotState kind="empty" title={emptyTitle} body={emptyBody} compact={embedded} />
      ) : (
        <View className="gap-3">
          {visiblePosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={currentUserId}
              hideAudience={hideAudience}
              commenting={commenting}
              highlighted={highlightPostId === post.id}
              onReact={(type, commentId) => onReact(post, type, commentId)}
              onComment={
                onComment
                  ? (content, parentId, mentionedUserIds) =>
                      onComment(post, content, parentId, mentionedUserIds)
                  : undefined
              }
            />
          ))}
        </View>
      )}
    </>
  );

  if (embedded) {
    return <View className="gap-3">{body}</View>;
  }

  return (
    <ScrollView
      ref={(node) => {
        scrollRef.current = node;
        tour?.setHomeScroll(node);
      }}
      className="flex-1"
      style={
        Platform.OS === 'web'
          ? ({ flex: 1, overflowY: 'auto', overflowX: 'hidden' } as object)
          : { flex: 1 }
      }
      contentContainerClassName="gap-3"
      contentContainerStyle={{ paddingBottom: TAB_BAR_CONTENT_INSET, flexGrow: 0 }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(isRefreshing)}
            onRefresh={onRefresh}
            tintColor={THEME.accent}
          />
        ) : undefined
      }
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {body}
    </ScrollView>
  );
}
