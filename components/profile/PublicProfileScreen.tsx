import { Stack, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';

import { FeedList } from '@/components/feed/FeedList';
import { ProfileChallengeRow } from '@/components/profile/ProfileChallengeRow';
import { OfficialMark } from '@/components/profile/OfficialMark';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { MascotState } from '@/components/mascot/MascotState';
import { useSocialSheetsOptional } from '@/components/social/SocialSheets';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useFollowState } from '@/hooks/useFollow';
import { useCopyTone } from '@/hooks/useCopy';
import {
  useCreateComment,
  useAuthorFeed,
  useToggleReaction,
} from '@/hooks/useFeed';
import { usePublicProfile, type ProfileChallenge } from '@/hooks/usePublicProfile';
import {
  useAcceptFriendRequest,
  useFriends,
  useFriendshipStatus,
  useGetOrCreateConversation,
  useSendFriendRequest,
} from '@/hooks/useSocial';
import { copy } from '@/lib/copy';
import { canPostOnProfile } from '@/lib/profileWall';
import { conversationHref } from '@/lib/routes';
import { personDisplayName } from '@/lib/social';
import { isOfficialAccount } from '@/lib/official';
import { THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';
import { mediaKind } from '@/utils/media';

const TABS = [
  { value: 'posts', label: 'Posts' },
  { value: 'about', label: 'About' },
  { value: 'friends', label: 'Friends' },
  { value: 'photos', label: 'Photos' },
  { value: 'challenges', label: 'Challenges' },
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
  const params = useLocalSearchParams<{ username: string; posted?: string }>();
  const handle = Array.isArray(params.username) ? params.username[0] : params.username;
  const postedId = Array.isArray(params.posted) ? params.posted[0] : params.posted;
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const tone = useCopyTone();
  const bundle = usePublicProfile(handle);
  const [tab, setTab] = useState<ProfileTab>('posts');
  const [toast, setToast] = useState<string | null>(null);

  const profile = bundle.data?.profile;
  const posts = useAuthorFeed(profile?.id);
  const friendsQuery = useFriends(profile?.id);
  const friendship = useFriendshipStatus(profile?.id);
  const follow = useFollowState(profile?.id);
  const sendRequest = useSendFriendRequest();
  const acceptRequest = useAcceptFriendRequest();
  const toggleReaction = useToggleReaction();
  const createComment = useCreateComment();
  const startChat = useGetOrCreateConversation();
  const social = useSocialSheetsOptional();
  const menuRef = useRef<View>(null);
  const headerTitle = profile?.username ? `@${profile.username}` : 'Profile';
  const headerOptions = useMemo(
    () => ({
      ...PROFILE_HEADER_BASE,
      title: headerTitle,
    }),
    [headerTitle],
  );

  useEffect(() => {
    if (!postedId || !profile) {
      return;
    }
    setTab('posts');
    const message = copy('wall.posted', tone, { name: personDisplayName(profile) });
    setToast(message);
    const timer = setTimeout(() => {
      setToast((current) => (current === message ? null : current));
    }, 2200);
    return () => clearTimeout(timer);
  }, [postedId, profile, tone]);

  if (bundle.isLoading) {
    return (
      <Screen>
        <Stack.Screen options={headerOptions} />
        <MascotState kind="loading" title={copy('profile.loading', tone)} compact />
      </Screen>
    );
  }

  if (bundle.error || !profile || !bundle.data) {
    return (
      <Screen>
        <Stack.Screen options={headerOptions} />
        <MascotState
          kind="error"
          title={copy('profile.notFound')}
          body={bundle.error instanceof Error ? bundle.error.message : 'Try another username.'}
          actionLabel="Retry"
          onAction={() => void bundle.refetch()}
          compact
        />
      </Screen>
    );
  }

  const name = profile.display_name ?? profile.username;
  const isSelf = Boolean(user?.id && user.id === profile.id);
  const official = isOfficialAccount(profile);
  const publicPosts = posts.data ?? [];
  const photos = publicPosts.flatMap((post) =>
    (post.media_urls ?? []).filter((url) => mediaKind(url) === 'image'),
  );
  const publicChallenges = [
    ...bundle.data.hosted,
    ...bundle.data.participating,
  ].filter((item, index, list) => {
    if (list.findIndex((row) => row.challenge.id === item.challenge.id) !== index) {
      return false;
    }
    return isPublicChallenge(item);
  });
  const friendCount = friendsQuery.data?.length ?? 0;
  const relation = friendship.data;
  const canPost = canPostOnProfile({
    viewerId: user?.id,
    host: profile,
    friends: relation?.status === 'accepted',
    followingCreator: follow.isFollowing,
    blocked: relation?.status === 'blocked',
  });

  function friendAction() {
    if (!profile || isSelf || official) {
      return;
    }
    if (relation?.status === 'accepted') {
      return;
    }
    if (relation?.incoming) {
      acceptRequest.mutate(profile.id, {
        onError: (error) => Alert.alert('Couldn’t accept that request', getErrorMessage(error)),
      });
      return;
    }
    if (relation?.status === 'pending') {
      return;
    }
    sendRequest.mutate(profile.id, {
      onError: (error) => Alert.alert('Couldn’t send that request', getErrorMessage(error)),
    });
  }

  const friendTitle = official
    ? copy('official.friends')
    : relation?.status === 'accepted'
      ? 'Friends'
      : relation?.incoming
        ? 'Accept'
        : relation?.status === 'pending'
          ? 'Request sent'
          : 'Add friend';

  return (
    <Screen scroll edges={PROFILE_SCREEN_EDGES}>
      <Stack.Screen
        options={{
          ...headerOptions,
          headerRight: isSelf || official
            ? undefined
            : () => (
                <Pressable
                  ref={menuRef}
                  collapsable={false}
                  accessibilityRole="button"
                  accessibilityLabel="Profile menu"
                  hitSlop={8}
                  onPress={() => {
                    menuRef.current?.measureInWindow((x, y, width, height) => {
                      social?.toggleProfileMenu(profile.id, { x, y, width, height });
                    });
                  }}
                  style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Glyph name={GLYPH.more} color={THEME.textPrimary} size={18} />
                </Pressable>
              ),
        }}
      />

      <View className="gap-3 pb-4 pt-2">
        <View className="flex-row items-start gap-3">
          <Avatar uri={profile.avatar_url} name={name} size={80} />
          <View className="min-w-0 flex-1">
            <AppText className="text-[20px] font-bold leading-6 text-charcoal" numberOfLines={1}>
              {name}
            </AppText>
            <AppText className="text-[13px] text-muted">@{profile.username}</AppText>
            <View className="mt-1">
              <OfficialMark profile={profile} />
            </View>
            <View className="mt-2 flex-row gap-3">
              <Count label="Friends" value={friendCount} />
              <Count label="Posts" value={publicPosts.length} />
              <Count label="Challenges" value={publicChallenges.length} />
            </View>
            {isSelf ? (
              <View className="mt-2 self-start">
                <Button title="Edit profile" size="sm" onPress={() => router.push('/profile/edit')} />
              </View>
            ) : (
              <View className="mt-2 flex-row flex-wrap gap-2">
                <Button
                  title={friendTitle}
                  size="sm"
                  variant={
                    official || relation?.status === 'accepted' || relation?.status === 'pending'
                      ? 'outline'
                      : 'primary'
                  }
                  disabled={official}
                  loading={!official && (sendRequest.isPending || acceptRequest.isPending)}
                  onPress={friendAction}
                />
                <Button
                  title="Message"
                  size="sm"
                  variant="outline"
                  loading={startChat.isPending}
                  onPress={() => {
                    void startChat.mutateAsync(profile.id).then(
                      (conversation) => router.push(conversationHref(conversation.id)),
                      (error) => Alert.alert('Couldn’t open that chat', getErrorMessage(error)),
                    );
                  }}
                />
                {canPost ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Post"
                    onPress={() => {
                      router.push({
                        pathname: '/feed/compose',
                        params: {
                          wallHostId: profile.id,
                          wallHostName: name,
                          wallHostUsername: profile.username,
                          returnTo: pathname,
                        },
                      });
                    }}
                    className="flex-row items-center justify-center px-3"
                    style={{
                      minHeight: 44,
                      minWidth: 44,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: THEME.border,
                      backgroundColor: THEME.surface,
                    }}>
                    <Glyph name={GLYPH.plus} color={THEME.textPrimary} size={14} />
                    <AppText className="ml-1 text-[14px] font-semibold text-charcoal">Post</AppText>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        </View>

        {profile.bio ? (
          <AppText className="text-[14px] leading-5 text-ink">{profile.bio}</AppText>
        ) : null}

        <SegmentedControl value={tab} options={TABS} onChange={setTab} accessibilityLabel="Profile sections" />

        {tab === 'posts' ? (
          <FeedList
            embedded
            posts={publicPosts}
            isLoading={posts.isLoading}
            error={posts.error instanceof Error ? posts.error.message : null}
            currentUserId={user?.id}
            highlightPostId={postedId}
            emptyTitle={copy('wall.empty', tone)}
            emptyBody=""
            empty={<MascotState kind="empty" title={copy('wall.empty', tone)} compact />}
            canCompose={false}
            commenting={createComment.isPending}
            onRetry={() => void posts.refetch()}
            onReact={(post, type, commentId) => toggleReaction.mutate({ post, type, commentId })}
            onComment={(post, content, parentId, mentionedUserIds) =>
              createComment.mutateAsync({ postId: post.id, content, parentId, mentionedUserIds })
            }
          />
        ) : null}

        {tab === 'about' ? (
          <Card className="gap-2">
            <Row label="Username" value={`@${profile.username}`} />
            <Row label="Bio" value={profile.bio?.trim() || 'No bio yet.'} />
          </Card>
        ) : null}

        {tab === 'friends' ? (
          friendCount === 0 ? (
            <AppText className="py-4 text-center text-[14px] text-muted">{copy('friends.empty', tone)}</AppText>
          ) : (
            <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
              {(friendsQuery.data ?? []).map((row) => {
                const friend = row.profile;
                if (!friend) {
                  return null;
                }
                return (
                  <View key={friend.id} className="w-1/3 p-1">
                    <ProfileLink username={friend.username} userId={friend.id}>
                      <View className="items-center gap-1 py-2">
                        <Avatar
                          uri={friend.avatar_url}
                          name={personDisplayName(friend)}
                          size={64}
                        />
                        <AppText className="text-center text-[12px] font-semibold text-charcoal" numberOfLines={1}>
                          {personDisplayName(friend)}
                        </AppText>
                      </View>
                    </ProfileLink>
                  </View>
                );
              })}
            </View>
          )
        ) : null}

        {tab === 'photos' ? (
          photos.length === 0 ? (
            <AppText className="py-4 text-center text-[14px] text-muted">No photos yet.</AppText>
          ) : (
            <View className="flex-row flex-wrap" style={{ marginHorizontal: -3 }}>
              {photos.map((uri) => (
                <View key={uri} className="w-1/3 p-0.5">
                  <Image source={{ uri }} style={{ width: '100%', aspectRatio: 1, borderRadius: 8 }} />
                </View>
              ))}
            </View>
          )
        ) : null}

        {tab === 'challenges' ? (
          publicChallenges.length === 0 ? (
            <AppText className="py-4 text-center text-[14px] text-muted">No Challenges yet.</AppText>
          ) : (
            <View className="gap-1.5">
              {publicChallenges.map((item) => (
                <ProfileChallengeRow key={item.challenge.id} item={item} />
              ))}
            </View>
          )
        ) : null}
      </View>
      {toast ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 24 }}>
          <View
            className="mx-8 items-center px-4 py-2.5"
            style={{
              backgroundColor: THEME.primary,
              borderRadius: 16,
              ...themeShadow('card'),
            }}>
            <AppText className="text-[13px] font-semibold" style={{ color: THEME.primaryForeground }}>
              {toast}
            </AppText>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function isPublicChallenge(item: ProfileChallenge): boolean {
  if (item.challenge.is_official) {
    return true;
  }
  const visibility = String(item.challenge.visibility ?? 'public').toLowerCase();
  return visibility === 'public' || visibility === 'unlisted';
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <View>
      <AppText className="text-[15px] font-extrabold text-charcoal">{value}</AppText>
      <AppText className="text-[11px] text-muted">{label}</AppText>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <AppText className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</AppText>
      <AppText className="mt-0.5 text-[14px] leading-5 text-charcoal">{value}</AppText>
    </View>
  );
}
