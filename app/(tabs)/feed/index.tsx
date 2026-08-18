import { View } from 'react-native';

import { ChallengeRail } from '@/components/feed/ChallengeRail';
import { FeedEmptyState } from '@/components/feed/FeedEmptyState';
import { FeedHeader } from '@/components/feed/FeedHeader';
import { FeedList } from '@/components/feed/FeedList';
import { ReelsRow } from '@/components/feed/ReelsRow';
import { StoryTray } from '@/components/feed/StoryTray';
import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useAuth } from '@/hooks/useAuth';
import {
  useCreateComment,
  useCreatePost,
  useDeletePost,
  useFeed,
  useToggleReaction,
} from '@/hooks/useFeed';
import { useActiveStories } from '@/hooks/useSocial';

export default function FeedScreen() {
  const { user } = useAuth();
  const feed = useFeed();
  const stories = useActiveStories();
  const createPost = useCreatePost();
  const createComment = useCreateComment();
  const deletePost = useDeletePost();
  const toggleReaction = useToggleReaction();
  const posts = feed.data ?? [];
  const refreshing = (feed.isRefetching || stories.isRefetching) && !feed.isLoading;

  function onRefresh() {
    void feed.refetch();
    void stories.refetch();
  }

  if (feed.error) {
    return (
      <Screen padded={false} edges={TAB_ROOT_EDGES} className="px-4 pt-1">
        <FeedHeader />
        <MascotState
          kind="error"
          title="Feed took a tumble"
          body={feed.error instanceof Error ? feed.error.message : 'Try again in a moment.'}
          actionLabel="Try again"
          onAction={() => void feed.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} className="px-4 pt-1">
      <FeedList
        posts={posts}
        isLoading={feed.isLoading}
        isRefreshing={refreshing}
        currentUserId={user?.id}
        emptyTitle="The arena is quiet"
        emptyBody="Join a challenge, find a friend, or host one — that’s how the feed fills up."
        composerPlaceholder="Share a check-in…"
        composing={createPost.isPending}
        commenting={createComment.isPending}
        headerTop={
          <View>
            <FeedHeader />
            <StoryTray />
          </View>
        }
        headerExtra={
          <View className="gap-3">
            <ReelsRow />
            <ChallengeRail />
          </View>
        }
        empty={<FeedEmptyState compact />}
        onRefresh={onRefresh}
        onRetry={() => void feed.refetch()}
        onCompose={(input) => createPost.mutateAsync(input)}
        onReact={(post, type, commentId) => toggleReaction.mutate({ post, type, commentId })}
        onComment={(post, content, parentId) =>
          createComment.mutateAsync({ postId: post.id, content, parentId })
        }
        onDelete={(post) => deletePost.mutateAsync(post.id)}
      />
    </Screen>
  );
}
