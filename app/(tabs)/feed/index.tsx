import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import { FeedEmptyState } from '@/components/feed/FeedEmptyState';
import { FeedList } from '@/components/feed/FeedList';
import { ReelsRow } from '@/components/feed/ReelsRow';
import { StoryTray } from '@/components/feed/StoryTray';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useAuth } from '@/hooks/useAuth';
import { useCopyTone } from '@/hooks/useCopy';
import { useCreateComment, useCreatePost, useFeed, useToggleReaction } from '@/hooks/useFeed';
import { rawFeedError } from '@/lib/feedError';
import { socialKeys } from '@/hooks/useSocial';
import { stopAllLiveMedia } from '@/lib/cameraSession';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import type { ComposeInput, PostWithMeta, ReactionType } from '@/lib/types';

export default function FeedScreen() {
  useFocusEffect(
    useCallback(() => {
      stopAllLiveMedia();
    }, []),
  );
  const { user } = useAuth();
  const tone = useCopyTone();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ postId?: string }>();
  const highlightPostId = Array.isArray(params.postId) ? params.postId[0] : params.postId;
  const feed = useFeed();
  const createPost = useCreatePost();
  const createComment = useCreateComment();
  const toggleReaction = useToggleReaction();
  const posts = feed.data ?? [];
  const feedWarning = feed.warning ?? (feed.error ? rawFeedError(feed.error) : null);
  const showFeedBanner = Boolean(feed.error || feedWarning);
  const refreshing = feed.isRefetching && !feed.isLoading && !feed.isFetchingNextPage;

  const onRefresh = useCallback(() => {
    void feed.refetch();
    void queryClient.invalidateQueries({ queryKey: socialKeys.stories() });
  }, [feed, queryClient]);

  const onCompose = useCallback(
    (input: ComposeInput) => createPost.mutateAsync(input),
    [createPost],
  );
  const onReact = useCallback(
    (post: PostWithMeta, type: ReactionType, commentId?: string | null) => {
      toggleReaction.mutate({ post, type, commentId });
    },
    [toggleReaction],
  );
  const onComment = useCallback(
    (post: PostWithMeta, content: string, parentId?: string | null, mentionedUserIds?: string[]) =>
      createComment.mutateAsync({ postId: post.id, content, parentId, mentionedUserIds }),
    [createComment],
  );

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} className="px-4">
      <FeedList
        posts={posts}
        isLoading={Boolean(feed.isLoading && posts.length === 0)}
        isRefreshing={refreshing}
        isFetchingNextPage={feed.isFetchingNextPage}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) {
            void feed.fetchNextPage();
          }
        }}
        error={feed.error ? copy('home.refreshFailed') : null}
        currentUserId={user?.id}
        emptyTitle={copy('home.empty', tone)}
        emptyBody=""
        composerPlaceholder={copy('home.shareThoughts')}
        homeChrome
        draftKey="home"
        composing={createPost.isPending}
        stickyAbove={
          <View style={{ marginBottom: 6 }}>
            <StoryTray />
          </View>
        }
        headerTop={
          showFeedBanner ? (
            <View style={{ marginBottom: 8, gap: 4 }}>
              <View className="flex-row items-center" style={{ gap: 10, minHeight: 44 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText className="text-[13px] text-muted">{copy('home.refreshFailed')}</AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                  onPress={() => void feed.refetch()}
                  style={{ minHeight: 44, justifyContent: 'center' }}>
                  <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
                    Try again
                  </AppText>
                </Pressable>
              </View>
              {feedWarning ? (
                <AppText
                  className="text-[12px]"
                  numberOfLines={1}
                  style={{ color: THEME.textMuted }}>
                  {feedWarning}
                </AppText>
              ) : null}
            </View>
          ) : undefined
        }
        headerExtra={<ReelsRow />}
        empty={<FeedEmptyState compact />}
        onRefresh={onRefresh}
        onRetry={() => void feed.refetch()}
        highlightPostId={highlightPostId}
        onCompose={onCompose}
        onReact={onReact}
        onComment={onComment}
      />
    </Screen>
  );
}
