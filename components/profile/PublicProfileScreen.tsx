import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';

import { FeedList } from '@/components/feed/FeedList';
import { ProfileChallengeRow } from '@/components/profile/ProfileChallengeRow';
import { ProfileMediaGrid } from '@/components/profile/ProfileMediaGrid';
import { OfficialMark } from '@/components/profile/OfficialMark';
import { MascotState } from '@/components/mascot/MascotState';
import { useSocialSheetsOptional } from '@/components/social/SocialSheets';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useFollowState, useToggleFollow } from '@/hooks/useFollow';
import { useCopyTone } from '@/hooks/useCopy';
import {
  useCreateComment,
  useAuthorFeed,
  useCreatePost,
  useToggleReaction,
} from '@/hooks/useFeed';
import { usePublicProfile } from '@/hooks/usePublicProfile';
import {
  useAcceptFriendRequest,
  useFriendCount,
  useFriendshipStatus,
  useSendFriendRequest,
  useUnfriend,
} from '@/hooks/useSocial';
import { copy } from '@/lib/copy';
import { collectProfileMedia } from '@/lib/profileMedia';
import {
  firstGivenName,
  profileChallengeIsHiddenFromOthers,
  viewerCanSeeShowcase,
} from '@/lib/profileShowcase';
import { canPostOnProfile } from '@/lib/profileWall';
import { directMessageHref } from '@/lib/routes';
import { personDisplayName } from '@/lib/social';
import { isCreatorAccount } from '@/lib/creator';
import { isOfficialAccount, isAdminViewer } from '@/lib/official';
import { ADMIN_HREF } from '@/lib/routes';
import { THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';
import { useBugReport } from '@/components/bug/BugReportHost';

const TABS = [
  { value: 'posts', label: 'Posts' },
  { value: 'photos', label: 'Photos & Videos' },
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
  const { user } = useAuth();
  const tone = useCopyTone();
  const bundle = usePublicProfile(handle);
  const [tab, setTab] = useState<ProfileTab>('posts');
  const [toast, setToast] = useState<string | null>(null);

  const profile = bundle.data?.profile;
  const posts = useAuthorFeed(profile?.id);
  const friendship = useFriendshipStatus(profile?.id);
  const friendCountQuery = useFriendCount(profile?.id);
  const follow = useFollowState(profile?.id);
  const toggleFollow = useToggleFollow(profile?.id);
  const sendRequest = useSendFriendRequest();
  const acceptRequest = useAcceptFriendRequest();
  const unfriend = useUnfriend();
  const toggleReaction = useToggleReaction();
  const createComment = useCreateComment();
  const createPost = useCreatePost();
  const social = useSocialSheetsOptional();
  const bugReport = useBugReport();
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
  const relation = friendship.data;
  const publicPosts = posts.data ?? [];
  const photos = collectProfileMedia(publicPosts, profile.id, user?.id);
  const publicChallenges = [
    ...bundle.data.hosted,
    ...bundle.data.participating,
  ].filter((item, index, list) => {
    if (list.findIndex((row) => row.challenge.id === item.challenge.id) !== index) {
      return false;
    }
    if (isSelf) {
      return true;
    }
    if (profileChallengeIsHiddenFromOthers(item.challenge)) {
      return false;
    }
    const visibility = item.competed
      ? item.participation?.profile_visibility
      : item.challenge.profile_visibility;
    return viewerCanSeeShowcase({
      viewerId: user?.id,
      ownerId: profile.id,
      visibility,
      friends: relation?.status === 'accepted',
    });
  });
  const friendCount = friendCountQuery.data;
  const canPost = canPostOnProfile({
    viewerId: user?.id,
    host: profile,
    friends: relation?.status === 'accepted',
    followingCreator: follow.isFollowing,
    blocked: relation?.status === 'blocked',
  });

  function confirmUnfriend() {
    if (!profile || unfriend.isPending) {
      return;
    }
    Alert.alert('Unfriend?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unfriend',
        style: 'destructive',
        onPress: () => {
          unfriend.mutate(profile.id, {
            onError: (error) => Alert.alert('Couldn’t unfriend', getErrorMessage(error)),
          });
        },
      },
    ]);
  }

  function followAction() {
    if (!profile || toggleFollow.isPending) {
      return;
    }
    if (follow.isFollowing) {
      Alert.alert('Unfollow?', '', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow',
          onPress: () => {
            toggleFollow.mutate(false, {
              onError: (error) => Alert.alert('Couldn’t unfollow', getErrorMessage(error)),
            });
          },
        },
      ]);
      return;
    }
    toggleFollow.mutate(true, {
      onError: (error) => Alert.alert('Couldn’t follow', getErrorMessage(error)),
    });
  }

  function friendAction() {
    if (!profile || isSelf || official) {
      return;
    }
    if (relation?.status === 'accepted') {
      confirmUnfriend();
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
          headerRight: isSelf
            ? () => (
                <Pressable
                  ref={menuRef}
                  collapsable={false}
                  accessibilityRole="button"
                  accessibilityLabel="Profile menu"
                  hitSlop={8}
                  onPress={() => {
                    menuRef.current?.measureInWindow((x, y, width, height) => {
                      bugReport.openMenu({ x, y, width, height }, { admin: isAdminViewer(profile) });
                    });
                  }}
                  style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Glyph name={GLYPH.more} color={THEME.textPrimary} size={18} />
                </Pressable>
              )
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
        {profile.cover_url ? (
          <Image
            source={{ uri: profile.cover_url }}
            style={{ width: '100%', height: 148, borderRadius: 20, backgroundColor: THEME.surface }}
          />
        ) : null}
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
              <Count
                label="Friends"
                value={
                  friendCount == null && (friendCountQuery.isPending || friendCountQuery.isError)
                    ? null
                    : (friendCount ?? 0)
                }
                onPress={isSelf ? () => router.push('/friends') : undefined}
              />
              <Count label="Posts" value={publicPosts.length} />
              <Count label="Challenges" value={publicChallenges.length} />
            </View>
            {isSelf ? (
              <View className="mt-2 flex-row flex-wrap items-center gap-2">
                <Button title="Edit profile" size="sm" onPress={() => router.push('/profile/edit')} />
                {isAdminViewer(profile) ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Admin"
                    onPress={() => router.push(ADMIN_HREF)}
                    style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
                    <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
                      Admin
                    </AppText>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Report a problem"
                  onPress={() => bugReport.open()}
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
                  <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
                    Report a problem
                  </AppText>
                </Pressable>
              </View>
            ) : (
              <View className="mt-2 flex-row flex-wrap items-center gap-2">
                <Button
                  title={friendTitle}
                  size="sm"
                  variant={
                    official || relation?.status === 'accepted' || relation?.status === 'pending'
                      ? 'outline'
                      : 'primary'
                  }
                  disabled={official}
                  loading={
                    !official &&
                    (sendRequest.isPending || acceptRequest.isPending || unfriend.isPending)
                  }
                  onPress={friendAction}
                />
                {isCreatorAccount(profile) || isOfficialAccount(profile) ? (
                  <Button
                    title={follow.isFollowing ? 'Following' : 'Follow'}
                    size="sm"
                    variant="outline"
                    loading={toggleFollow.isPending}
                    onPress={followAction}
                  />
                ) : null}
                {relation?.status === 'blocked' ? (
                  <AppText className="text-[13px] font-semibold" style={{ color: THEME.textMuted }}>
                    {copy('messages.blocked')}
                  </AppText>
                ) : (
                  <Button
                    title="Message"
                    size="sm"
                    variant="outline"
                    onPress={() => router.push(directMessageHref(profile.id))}
                  />
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Report a problem"
                  onPress={() => bugReport.open()}
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
                  <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
                    Report a problem
                  </AppText>
                </Pressable>
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
            canCompose={canPost || isSelf}
            composing={createPost.isPending}
            composerPlaceholder={
              canPost
                ? copy('wall.writeOn', tone, { name: firstGivenName(profile) })
                : copy('home.composer', tone)
            }
            wallHost={
              canPost
                ? { id: profile.id, name, username: profile.username }
                : null
            }
            defaultAudience={canPost ? 'friends' : undefined}
            onCompose={(input) => createPost.mutateAsync(input)}
            commenting={createComment.isPending}
            onRetry={() => void posts.refetch()}
            onReact={(post, type, commentId) => toggleReaction.mutate({ post, type, commentId })}
            onComment={(post, content, parentId, mentionedUserIds, mentionChips) =>
              createComment.mutateAsync({
                postId: post.id,
                content,
                parentId,
                mentionedUserIds,
                mentionChips,
              })
            }
          />
        ) : null}

        {tab === 'photos' ? <ProfileMediaGrid items={photos} posts={publicPosts} /> : null}

        {tab === 'challenges' ? (
          publicChallenges.length === 0 ? (
            <MascotState kind="empty" title={copy('profile.challengesEmpty')} compact />
          ) : (
            <View className="gap-1.5">
              {publicChallenges.map((item) => (
                <ProfileChallengeRow key={item.challenge.id} item={item} canEdit={isSelf} />
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

function Count({
  label,
  value,
  onPress,
}: {
  label: string;
  value: number | null;
  onPress?: () => void;
}) {
  const body = (
    <View>
      <AppText className="text-[15px] font-extrabold text-charcoal">
        {value == null ? ' ' : value}
      </AppText>
      <AppText className="text-[11px] text-muted">{label}</AppText>
    </View>
  );
  if (!onPress) {
    return body;
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${value ?? 0} ${label}`} onPress={onPress}>
      {body}
    </Pressable>
  );
}

