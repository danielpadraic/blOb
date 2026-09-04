import { useCallback, useEffect, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import { CalloutHomePin } from '@/components/feed/CalloutHomePin';
import { FeedEmptyState } from '@/components/feed/FeedEmptyState';
import { FeedList } from '@/components/feed/FeedList';
import { FeaturedOfficialStrip } from '@/components/feed/FeaturedOfficialStrip';
import { PulseRail } from '@/components/feed/PulseRail';
import { ReelsRow } from '@/components/feed/ReelsRow';
import { StoryTray } from '@/components/feed/StoryTray';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useAuth } from '@/hooks/useAuth';
import { useCopyTone } from '@/hooks/useCopy';
import { useCreateComment, useCreatePost, useFeed, useToggleReaction } from '@/hooks/useFeed';
import { socialKeys } from '@/hooks/useSocial';
import { stopAllLiveMedia } from '@/lib/cameraSession';
import { clearLastOpenChallenge } from '@/lib/challengeNav';
import { copy } from '@/lib/copy';
import { firstSearchParam } from '@/lib/commentDeepLink';
import { homeFeedFirstPaintLoading } from '@/lib/homeFeed';
import { logHomeFirstPaintQueries } from '@/lib/homeFeedVideo';
import { HOME_PULSE_KEY } from '@/lib/homePulse';
import type { MentionChip } from '@/lib/mentions';
import { THEME } from '@/lib/theme';
import type { ComposeInput, PostWithMeta, ReactionType } from '@/lib/types';

export default function FeedScreen() {
  useFocusEffect(
    useCallback(() => {
      stopAllLiveMedia();
      clearLastOpenChallenge();
    }, []),
  );
  useEffect(() => {
    logHomeFirstPaintQueries();
  }, []);
  const { user } = useAuth();
  const tone = useCopyTone();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ postId?: string; commentId?: string; comments?: string }>();
  const highlightPostId = firstSearchParam(params.postId);
  const highlightCommentId = firstSearchParam(params.commentId);
  const feed = useFeed();
  const createPost = useCreatePost();
  const createComment = useCreateComment();
  const toggleReaction = useToggleReaction();
  const posts = feed.data ?? [];
  const showFeedBanner = Boolean(feed.error);
  const refreshing = feed.isRefetching && !feed.isLoading && !feed.isFetchingNextPage;

  const onRefresh = useCallback(() => {
    void feed.refetch();
    void queryClient.invalidateQueries({ queryKey: socialKeys.stories() });
    void queryClient.invalidateQueries({ queryKey: [HOME_PULSE_KEY] });
    void queryClient.invalidateQueries({ queryKey: ['callouts'] });
  }, [feed, queryClient]);

  // Pinned under the top menu: Waves only. Official, Pulse, Callout, Rounds, and Composer scroll.
  const stickyAbove = useMemo(
    () => (
      <View style={{ marginBottom: 6, backgroundColor: THEME.background }}>
        <StoryTray />
      </View>
    ),
    [],
  );

  const headerExtra = useMemo(
    () => (
      <View style={{ gap: 8 }}>
        <FeaturedOfficialStrip />
        <PulseRail />
        <CalloutHomePin />
        <ReelsRow />
      </View>
    ),
    [],
  );

  const headerTop = useMemo(
    () =>
      showFeedBanner && posts.length > 0 ? (
        <View className="flex-row items-center" style={{ marginBottom: 8, gap: 10, minHeight: 44 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText className="text-[13px] text-muted">{copy('home.refreshFailed')}</AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry"
            onPress={() => void feed.refetch()}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
              Retry
            </AppText>
          </Pressable>
        </View>
      ) : undefined,
    [feed, posts.length, showFeedBanner],
  );

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
    (
      post: PostWithMeta,
      content: string,
      parentId?: string | null,
      mentionedUserIds?: string[],
      mentionChips?: MentionChip[],
    ) =>
      createComment.mutateAsync({
        postId: post.id,
        content,
        parentId,
        mentionedUserIds,
        mentionChips,
      }),
    [createComment],
  );

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} className="px-4">
      <FeedList
        posts={posts}
        isLoading={homeFeedFirstPaintLoading({
          postCount: posts.length,
          isPending: feed.isLoading,
          isFetched: feed.isFetched,
          failed: Boolean(feed.error),
        })}
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
        stickyAbove={stickyAbove}
        headerTop={headerTop}
        headerExtra={headerExtra}
        empty={<FeedEmptyState compact />}
        onRefresh={onRefresh}
        onRetry={() => void feed.refetch()}
        highlightPostId={highlightPostId}
        highlightCommentId={highlightCommentId}
        onCompose={onCompose}
        onReact={onReact}
        onComment={onComment}
      />
    </Screen>
  );
}
