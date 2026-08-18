import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { FeedList } from '@/components/feed/FeedList';
import { ProfileBadges } from '@/components/profile/ProfileBadges';
import { ProfileChallengeRow } from '@/components/profile/ProfileChallengeRow';
import { ProfileEarnings } from '@/components/profile/ProfileEarnings';
import { MascotState } from '@/components/mascot/MascotState';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Glyph, GLYPH, type GlyphId } from '@/components/ui/Glyph';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useFollowState, useToggleFollow } from '@/hooks/useFollow';
import {
  useCreateComment,
  useAuthorFeed,
  useDeletePost,
  useToggleReaction,
} from '@/hooks/useFeed';
import { useBadgeProgress } from '@/hooks/useBadges';
import { usePublicProfile } from '@/hooks/usePublicProfile';
import { WalletBar } from '@/components/wallet/WalletBar';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

const TABS = [
  { value: 'posts', label: 'Posts' },
  { value: 'hosted', label: 'Hosted' },
  { value: 'play', label: 'Challenges' },
] as const;

type ProfileTab = (typeof TABS)[number]['value'];

const PROFILE_SCREEN_EDGES = ['left', 'right'] as const;

const PROFILE_HEADER_BASE = {
  headerShown: true,
  headerBackTitle: 'Back',
  headerTintColor: THEME.textPrimary,
  headerStyle: { backgroundColor: THEME.background },
  headerShadowVisible: false,
} as const;

export default function PublicProfileScreen() {
  const params = useLocalSearchParams<{ username: string }>();
  const handle = Array.isArray(params.username) ? params.username[0] : params.username;
  const router = useRouter();
  const { user } = useAuth();
  const bundle = usePublicProfile(handle);
  const [tab, setTab] = useState<ProfileTab>('posts');

  const profile = bundle.data?.profile;
  const follow = useFollowState(profile?.id);
  const toggleFollow = useToggleFollow(profile?.id);
  const posts = useAuthorFeed(profile?.id);
  const toggleReaction = useToggleReaction();
  const createComment = useCreateComment();
  const deletePost = useDeletePost();
  const badgesQuery = useBadgeProgress(profile?.id);
  const headerTitle = profile?.username ? `@${profile.username}` : 'Profile';
  const headerOptions = useMemo(
    () => ({
      ...PROFILE_HEADER_BASE,
      title: headerTitle,
      headerRight: () => (
        <View className="pr-1">
          <WalletBar />
        </View>
      ),
    }),
    [headerTitle],
  );

  if (bundle.isLoading) {
    return (
      <Screen>
        <Stack.Screen options={headerOptions} />
        <MascotState kind="loading" title="Finding that blob" compact />
      </Screen>
    );
  }

  if (bundle.error || !profile || !bundle.data) {
    return (
      <Screen>
        <Stack.Screen options={headerOptions} />
        <MascotState
          kind="error"
          title="Couldn’t load that profile"
          body={bundle.error instanceof Error ? bundle.error.message : 'Try another blob.'}
          actionLabel="Retry"
          onAction={() => void bundle.refetch()}
          compact
        />
      </Screen>
    );
  }

  const name = profile.display_name ?? profile.username;
  const stats = bundle.data.stats;
  const isSelf = follow.isSelf;
  const badges = badgesQuery.data ?? [];

  return (
    <Screen scroll edges={PROFILE_SCREEN_EDGES}>
      <Stack.Screen options={headerOptions} />

      <View className="gap-3 pb-4 pt-2">
        <View className="flex-row items-start gap-3">
          <View
            className="items-center justify-center rounded-full"
            style={{
              width: 80,
              height: 80,
              backgroundColor: THEME.accentSoft,
              padding: 3,
            }}>
            <Avatar uri={profile.avatar_url} name={name} size={74} />
          </View>
          <View className="min-w-0 flex-1">
            <AppText className="text-[20px] font-bold leading-6 text-charcoal" numberOfLines={1}>
              {name}
            </AppText>
            <AppText className="text-[13px] text-muted">@{profile.username}</AppText>
            <View className="mt-1.5 flex-row items-center gap-3">
              <FollowStat icon={GLYPH.people} value={follow.followers} label="followers" />
              <FollowStat icon={GLYPH.person} value={follow.following} label="following" />
            </View>
            {isSelf ? (
              <View className="mt-2 self-start">
                <Button title="Edit in You" size="sm" variant="outline" onPress={() => router.push('/profile')} />
              </View>
            ) : (
              <View className="mt-2 flex-row flex-wrap gap-2">
                <Button
                  title={follow.isFollowing ? 'Following' : 'Follow'}
                  size="sm"
                  variant={follow.isFollowing ? 'outline' : 'secondary'}
                  loading={toggleFollow.isPending}
                  onPress={() =>
                    toggleFollow.mutate(!follow.isFollowing, {
                      onError: (error) =>
                        Alert.alert('Couldn’t update follow', getErrorMessage(error)),
                    })
                  }
                />
                <Button
                  title="Call out"
                  size="sm"
                  variant="outline"
                  onPress={() =>
                    router.push({
                      pathname: '/challenges/callout/create',
                      params: { username: profile.username },
                    })
                  }
                />
              </View>
            )}
          </View>
        </View>

        {profile.bio ? (
          <AppText className="text-[14px] leading-5 text-ink">{profile.bio}</AppText>
        ) : (
          <AppText className="text-[13px] text-muted">This blob is the strong, silent type.</AppText>
        )}

        <Card padded={false}>
          <View className="flex-row">
            <StatCell glyph={GLYPH.check} label="Completed" value={String(stats.completedCount)} />
            <StatCell glyph={GLYPH.flag} label="Hosted" value={String(stats.hostedCount)} borderLeft />
            <StatCell
              glyph={GLYPH.streak}
              label="Best run"
              value={stats.bestRun > 0 ? `${stats.bestRun}d` : '—'}
              borderLeft
            />
          </View>
        </Card>

        <ProfileEarnings coins={stats.coinsEarned} bucks={stats.bucksEarned} />

        <ProfileBadges badges={badges} />

        <SegmentedControl value={tab} options={TABS} onChange={setTab} accessibilityLabel="Profile sections" />

        {tab === 'posts' ? (
          <FeedList
            embedded
            posts={posts.data ?? []}
            isLoading={posts.isLoading}
            error={posts.error instanceof Error ? posts.error.message : null}
            currentUserId={user?.id}
            emptyTitle="No posts yet"
            emptyBody="When they check in, it’ll land here."
            canCompose={false}
            commenting={createComment.isPending}
            onRetry={() => void posts.refetch()}
            onReact={(post, type, commentId) => toggleReaction.mutate({ post, type, commentId })}
            onComment={(post, content, parentId) =>
              createComment.mutateAsync({ postId: post.id, content, parentId })
            }
            onDelete={(post) => deletePost.mutateAsync(post.id)}
          />
        ) : null}

        {tab === 'hosted' ? (
          bundle.data.hosted.length === 0 ? (
            <MascotState
              compact
              kind="empty"
              title="No hosted challenges yet"
              body="When they set the stakes, the lobby will show it here."
            />
          ) : (
            <View className="gap-1.5">
              {bundle.data.hosted.map((item) => (
                <ProfileChallengeRow key={item.challenge.id} item={item} />
              ))}
            </View>
          )
        ) : null}

        {tab === 'play' ? (
          bundle.data.participating.length === 0 ? (
            <MascotState
              compact
              kind="empty"
              title="Not in any challenges"
              body="Call them out, or wait until they buy in."
            />
          ) : (
            <View className="gap-1.5">
              {bundle.data.participating.map((item) => (
                <ProfileChallengeRow key={item.challenge.id} item={item} />
              ))}
            </View>
          )
        ) : null}
      </View>
    </Screen>
  );
}

function FollowStat({
  icon,
  value,
  label,
}: {
  icon: GlyphId;
  value: number;
  label: string;
}) {
  return (
    <View className="flex-row items-center gap-1">
      <Glyph name={icon} color={THEME.textMuted} size={13} />
      <AppText className="text-[12px] text-muted">
        <AppText className="font-semibold text-charcoal">{value}</AppText> {label}
      </AppText>
    </View>
  );
}

function StatCell({
  label,
  value,
  glyph,
  borderLeft,
}: {
  label: string;
  value: string;
  glyph: GlyphId;
  borderLeft?: boolean;
}) {
  return (
    <View
      className="flex-1 px-2 py-2.5"
      style={borderLeft ? { borderLeftWidth: 1, borderLeftColor: THEME.border } : undefined}>
      <View className="items-center">
        <Glyph name={glyph} color={THEME.accent} size={16} />
      </View>
      <AppText className="mt-1 text-center text-[15px] font-bold text-charcoal" numberOfLines={1}>
        {value}
      </AppText>
      <AppText className="mt-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </AppText>
    </View>
  );
}
