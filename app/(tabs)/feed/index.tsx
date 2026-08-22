import { useCallback } from 'react';
import { View } from 'react-native';

import { FeaturedOfficialStrip } from '@/components/feed/FeaturedOfficialStrip';
import { FeedEmptyState } from '@/components/feed/FeedEmptyState';
import { FeedList } from '@/components/feed/FeedList';
import { RecommendedProfiles } from '@/components/feed/RecommendedProfiles';
import { ReelsRow } from '@/components/feed/ReelsRow';
import { StoryTray } from '@/components/feed/StoryTray';
import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useAuth } from '@/hooks/useAuth';
import { useCopyTone } from '@/hooks/useCopy';
import { useFeaturedOfficialChallenge } from '@/hooks/useChallenge';
import {
  useCreateComment,
  useCreatePost,
  useFeed,
  useToggleReaction,
} from '@/hooks/useFeed';
import { useActiveStories } from '@/hooks/useSocial';
import { copy } from '@/lib/copy';
import type { ComposeInput, PostWithMeta, ReactionType } from '@/lib/types';

export default function FeedScreen() {
  const { user } = useAuth();
  const tone = useCopyTone();
  const feed = useFeed();
  const stories = useActiveStories();
  const featured = useFeaturedOfficialChallenge();
  const createPost = useCreatePost();
  const createComment = useCreateComment();
  const toggleReaction = useToggleReaction();
  const posts = feed.data ?? [];
  const refreshing = (feed.isRefetching || stories.isRefetching) && !feed.isLoading;

  const onRefresh = useCallback(() => {
    void feed.refetch();
    void stories.refetch();
    void featured.refetch();
  }, [featured, feed, stories]);

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

  if (feed.error) {
    return (
      <Screen padded={false} edges={TAB_ROOT_EDGES} className="px-4">
        <MascotState
          kind="error"
          title={copy('home.error', tone)}
          actionLabel="Try again"
          onAction={() => void feed.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} className="px-4">
      <FeedList
        posts={posts}
        isLoading={feed.isLoading}
        isRefreshing={refreshing}
        currentUserId={user?.id}
        emptyTitle={copy('home.empty', tone)}
        emptyBody=""
        composerPlaceholder={copy('home.composer', tone)}
        composing={createPost.isPending}
        headerTop={<FeaturedOfficialStrip />}
        headerExtra={
          <View className="gap-2">
            <StoryTray />
            <ReelsRow />
            <RecommendedProfiles />
          </View>
        }
        empty={<FeedEmptyState compact />}
        onRefresh={onRefresh}
        onRetry={() => void feed.refetch()}
        onCompose={onCompose}
        onReact={onReact}
        onComment={onComment}
      />
    </Screen>
  );
}
