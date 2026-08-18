import { Stack } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';

import { PostCard } from '@/components/feed/PostCard';
import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useCreateComment, usePost, useToggleReaction } from '@/hooks/useFeed';
import { TAB_STACK_SCREEN_OPTIONS } from '@/lib/routes';

export default function PostThreadScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
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
          onReact={(type, commentId) => toggleReaction.mutate({ post: post.data!, type, commentId })}
          onComment={(content, parentId) =>
            createComment.mutateAsync({ postId: post.data!.id, content, parentId })
          }
        />
      )}
    </Screen>
  );
}
