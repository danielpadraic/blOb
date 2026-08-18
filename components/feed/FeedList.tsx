import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { Composer } from '@/components/feed/Composer';
import { PostCard } from '@/components/feed/PostCard';
import { MascotState } from '@/components/mascot/MascotState';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
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
  onRefresh?: () => void;
  onRetry?: () => void;
  onCompose?: (input: ComposeInput) => Promise<unknown> | void;
  onReact: (post: PostWithMeta, type: ReactionType, commentId?: string | null) => void;
  onComment?: (
    post: PostWithMeta,
    content: string,
    parentId?: string | null,
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
  onRefresh,
  onRetry,
  onCompose,
  onReact,
  onComment,
}: FeedListProps) {
  if (error) {
    return (
      <MascotState
        kind="error"
        title="Feed took a tumble"
        body={error}
        actionLabel="Try again"
        onAction={onRetry}
      />
    );
  }

  const body = (
    <>
      {headerTop}
      {headerExtra}

      {canCompose && onCompose ? (
        <Composer
          placeholder={composerPlaceholder}
          submitting={composing}
          onSubmit={onCompose}
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
          title="Warming up the feed"
          body="Your blob is gathering the latest check-ins."
          compact={embedded}
        />
      ) : posts.length === 0 ? (
        empty ?? <MascotState kind="empty" title={emptyTitle} body={emptyBody} compact={embedded} />
      ) : (
        <View className="gap-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={currentUserId}
              commenting={commenting}
              onReact={(type, commentId) => onReact(post, type, commentId)}
              onComment={
                onComment
                  ? (content, parentId) => onComment(post, content, parentId)
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
      className="flex-1"
      contentContainerClassName="gap-3 pb-8"
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
