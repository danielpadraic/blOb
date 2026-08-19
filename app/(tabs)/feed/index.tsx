import { View } from 'react-native';

import { OfficialPitchHost } from '@/components/challenge/OfficialPitchHost';
import { ChallengeRail } from '@/components/feed/ChallengeRail';
import { FeedEmptyState } from '@/components/feed/FeedEmptyState';
import { FeedHeader } from '@/components/feed/FeedHeader';
import { FeedList } from '@/components/feed/FeedList';
import { RecommendedProfiles } from '@/components/feed/RecommendedProfiles';
import { ReelsRow } from '@/components/feed/ReelsRow';
import { StoryTray } from '@/components/feed/StoryTray';
import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useAuth } from '@/hooks/useAuth';
import { useCopyTone } from '@/hooks/useCopy';
import {
  useCreateComment,
  useCreatePost,
  useFeed,
  useToggleReaction,
} from '@/hooks/useFeed';
import { useActiveStories } from '@/hooks/useSocial';
import { copy } from '@/lib/copy';

export default function FeedScreen() {
  const { user } = useAuth();
  const tone = useCopyTone();
  const feed = useFeed();
  const stories = useActiveStories();
  const createPost = useCreatePost();
  const createComment = useCreateComment();
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
          title={copy('home.error', tone)}
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
        emptyTitle={copy('home.empty', tone)}
        emptyBody=""
        composerPlaceholder={copy('home.composer', tone)}
        composing={createPost.isPending}
        commenting={createComment.isPending}
        headerTop={
          <View className="gap-3">
            <OfficialPitchHost />
            <ChallengeRail />
          </View>
        }
        headerExtra={
          <View className="gap-3">
            <FeedHeader />
            <StoryTray />
            <ReelsRow />
            <RecommendedProfiles />
          </View>
        }
        empty={<FeedEmptyState compact />}
        onRefresh={onRefresh}
        onRetry={() => void feed.refetch()}
        onCompose={(input) => createPost.mutateAsync(input)}
        onReact={(post, type, commentId) => toggleReaction.mutate({ post, type, commentId })}
        onComment={(post, content, parentId, mentionedUserIds) =>
          createComment.mutateAsync({ postId: post.id, content, parentId, mentionedUserIds })
        }
      />
    </Screen>
  );
}
