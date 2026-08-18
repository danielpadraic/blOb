import { View } from 'react-native';

import { ProfileLink } from '@/components/profile/ProfileLink';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { MascotState } from '@/components/mascot/MascotState';
import { useCopyTone } from '@/hooks/useCopy';
import { copy } from '@/lib/copy';
import type { PostWithMeta } from '@/lib/types';
import { formatFeedTime } from '@/utils/format';

type ChallengeFeedPreviewProps = {
  posts: PostWithMeta[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

export function ChallengeFeedPreview({
  posts,
  isLoading,
  error,
  onRetry,
}: ChallengeFeedPreviewProps) {
  const tone = useCopyTone();
  if (isLoading) {
    return (
      <MascotState
        kind="loading"
        title="Checking the challenge feed"
        body="Looking for posts from people already in."
      />
    );
  }

  if (error) {
    return (
      <MascotState
        kind="error"
        title={copy('home.error', tone)}
        body={error}
        actionLabel="Try again"
        onAction={onRetry}
      />
    );
  }

  if (posts.length === 0) {
    return (
      <MascotState
        kind="empty"
        title="Quiet in this challenge"
        body="No posts yet. After you join, this is where check-ins from this challenge will land."
      />
    );
  }

  return (
    <View className="gap-3">
      {posts.map((post) => {
        const name = post.author?.display_name ?? post.author?.username ?? 'blob';
        return (
          <Card key={post.id} className="gap-2">
            <ProfileLink username={post.author?.username} userId={post.author_id}>
              <AppText className="font-semibold text-charcoal">{name}</AppText>
            </ProfileLink>
            <AppText className="text-xs text-muted">{formatFeedTime(post.created_at)}</AppText>
            {post.content ? (
              <AppText className="leading-6 text-ink">{post.content}</AppText>
            ) : (
              <AppText className="text-muted">Shared a check-in.</AppText>
            )}
          </Card>
        );
      })}
    </View>
  );
}
