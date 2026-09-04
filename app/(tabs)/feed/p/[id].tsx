import { Stack, useLocalSearchParams } from 'expo-router';

import { PostCard } from '@/components/feed/PostCard';
import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useCreateComment, usePost, useToggleReaction } from '@/hooks/useFeed';
import { firstSearchParam } from '@/lib/commentDeepLink';
import { TAB_STACK_SCREEN_OPTIONS } from '@/lib/routes';

export default function PostThreadScreen() {
  const params = useLocalSearchParams<{ id: string; commentId?: string; comments?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const commentId = firstSearchParam(params.commentId);
  const { user } = useAuth();
  const post = usePost(id);
  const toggleReaction = useToggleReaction();
  const createComment = useCreateComment();

  return (
    <Screen>
      <Stack.Screen options={{ ...TAB_STACK_SCREEN_OPTIONS, title: 'Post' }} />
      {post.isLoading ? (
        <MascotState kind="loading" title="Loading post" compact />
      ) : !post.data ? (
        <AppText className="mt-8 text-center text-[15px] text-muted">This post isn’t available.</AppText>
      ) : (
        <PostCard
          post={post.data}
          currentUserId={user?.id}
          commenting={createComment.isPending}
          highlightCommentId={commentId}
          startThreadOpen
          onReact={(type, commentIdArg) =>
            toggleReaction.mutate({ post: post.data!, type, commentId: commentIdArg })
          }
          onComment={(content, parentId, mentionedUserIds, mentionChips) =>
            createComment.mutateAsync({
              postId: post.data!.id,
              content,
              parentId,
              mentionedUserIds,
              mentionChips,
            })
          }
        />
      )}
    </Screen>
  );
}
