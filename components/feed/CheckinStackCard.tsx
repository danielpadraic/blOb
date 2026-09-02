import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { PostCard } from '@/components/feed/PostCard';
import { InChallengeChip } from '@/components/feed/OriginChip';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { useChallengeFeedPreview } from '@/hooks/useChallenge';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import type { HomeCheckinStack } from '@/lib/multiCheckin';
import { THEME } from '@/lib/theme';
import type { PostWithMeta, ReactionType } from '@/lib/types';

type CheckinStackCardProps = {
  stack: HomeCheckinStack;
  posts: PostWithMeta[];
  currentUserId?: string;
  highlighted?: boolean;
  startExpanded?: boolean;
  onReact: (post: PostWithMeta, type: ReactionType, commentId?: string | null) => void;
  onComment?: (
    post: PostWithMeta,
    content: string,
    parentId?: string | null,
    mentionedUserIds?: string[],
  ) => Promise<unknown> | void;
};

export function CheckinStackCard({
  stack,
  posts,
  currentUserId,
  highlighted,
  startExpanded,
  onReact,
  onComment,
}: CheckinStackCardProps) {
  const [expanded, setExpanded] = useState(Boolean(startExpanded));
  const first = posts[0];
  const name =
    first?.author?.display_name?.trim() ||
    (first?.author?.username ? `@${first.author.username}` : 'Someone');

  return (
    <Card
      padded={false}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: THEME.radius,
        borderWidth: highlighted ? 1.5 : 1,
        borderColor: highlighted ? THEME.accent : THEME.border,
        overflow: 'visible',
      }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={stack.copy}
        onPress={() => setExpanded((open) => !open)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Avatar
          uri={first?.author?.avatar_url}
          name={name}
          size={32}
        />
        <AppText
          className="font-semibold text-charcoal"
          style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 20 }}
          numberOfLines={2}>
          {stack.copy}
        </AppText>
      </Pressable>
      <View className="flex-row flex-wrap" style={{ gap: 8, marginTop: 8 }}>
        {stack.items.map((item) => (
          <StackOriginChip key={item.postId} item={item} />
        ))}
      </View>
      {expanded
        ? posts.map((post) => (
            <View key={post.id} style={{ marginTop: 10 }}>
              <PostCard
                post={post}
                currentUserId={currentUserId}
                homeFeed
                highlighted={highlighted && post.id === stack.firstPostId}
                onReact={(type, commentId) => onReact(post, type, commentId)}
                onComment={
                  onComment
                    ? (content, parentId, mentionedUserIds) =>
                        onComment(post, content, parentId, mentionedUserIds)
                    : undefined
                }
              />
            </View>
          ))
        : null}
    </Card>
  );
}

function StackOriginChip({
  item,
}: {
  item: HomeCheckinStack['items'][number];
}) {
  const preview = useChallengeFeedPreview(item.challengeId);
  const card = preview.data?.id === item.challengeId ? preview.data : null;
  return (
    <InChallengeChip
      challengeId={item.challengeId}
      title={item.title || (card ? challengeDisplayTitle(card) : null)}
      titleOnly
      visibility={card?.visibility}
      challengeLane={card?.challenge_lane}
      isOfficial={card?.is_official}
      createdBy={card?.created_by}
      snapshot={card}
      postId={item.postId}
      tab="feed"
    />
  );
}
