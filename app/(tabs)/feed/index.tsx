import { FeedRails, FeedStories } from '@/components/feed/FeedDiscovery';
import { FeedList } from '@/components/feed/FeedList';
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

export default function FeedScreen() {
  const { user } = useAuth();
  const feed = useFeed();
  const createPost = useCreatePost();
  const deletePost = useDeletePost();
  const toggleReaction = useToggleReaction();
  const createComment = useCreateComment();

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} className="px-4 pt-1">
      <FeedList
        posts={feed.data ?? []}
        isLoading={feed.isLoading}
        isRefreshing={feed.isRefetching && !feed.isLoading}
        error={feed.error instanceof Error ? feed.error.message : null}
        currentUserId={user?.id}
        emptyTitle="Quiet in here"
        emptyBody="Be the first blob to check in. Share a workout, a win, or a dare."
        composerPlaceholder="What’s the play today?"
        headerTop={<FeedStories />}
        headerExtra={<FeedRails />}
        composing={createPost.isPending}
        commenting={createComment.isPending}
        onRefresh={() => void feed.refetch()}
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
