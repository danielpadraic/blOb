import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';

import { FeedList } from '@/components/feed/FeedList';
import { ProfileChallengeRow } from '@/components/profile/ProfileChallengeRow';
import { ProfileMediaGrid } from '@/components/profile/ProfileMediaGrid';
import {
  ProfileRouteErrorBoundary,
  ProfileSafeBoundary,
  ProfileSectionBoundary,
} from '@/components/profile/ProfileSafeBoundary';
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
import { useBlockedUserIds, useUnblockUser } from '@/hooks/usePostModeration';
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
import { confirmDestructive } from '@/lib/confirm';
import { canPostOnProfile } from '@/lib/profileWall';
import { directMessageHref } from '@/lib/routes';
import { personDisplayName } from '@/lib/social';
import { isCreatorAccount } from '@/lib/creator';
import { isOfficialAccount, isAdminViewer } from '@/lib/official';
import { ADMIN_HREF } from '@/lib/routes';
import { THEME, themeShadow } from '@/lib/theme';
import { measureInWindowSafe } from '@/lib/measureWindow';
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

function idleQuery<T>(data: T) {
  return {
    data,
    isLoading: false,
    isPending: false,
    isError: false,
    error: null as Error | null,
    refetch: async () => undefined,
  };
}

function idleMutation() {
  return {
    isPending: false,
    mutate: ((_arg?: unknown, _opts?: unknown) => undefined) as never,
    mutateAsync: async (_arg?: unknown) => undefined,
  };
}

const readPublicProfile =
  typeof usePublicProfile === 'function' ? usePublicProfile : (_handle?: string) => idleQuery(undefined);
const readAuthorFeed =
  typeof useAuthorFeed === 'function' ? useAuthorFeed : (_id?: string | null) => idleQuery([]);
const readFriendship =
  typeof useFriendshipStatus === 'function' ? useFriendshipStatus : (_id?: string | null) => idleQuery(undefined);
const readFriendCount =
  typeof useFriendCount === 'function' ? useFriendCount : (_id?: string | null) => idleQuery(undefined as number | undefined);
const readFollowState =
  typeof useFollowState === 'function'
    ? useFollowState
    : (_id?: string | null) => ({ isSelf: false, isFollowing: false, followers: 0, following: 0, isLoading: false });
const readToggleFollow =
  typeof useToggleFollow === 'function' ? useToggleFollow : (_id?: string | null) => idleMutation();
const readSendFriendRequest =
  typeof useSendFriendRequest === 'function' ? useSendFriendRequest : () => idleMutation();
const readAcceptFriendRequest =
  typeof useAcceptFriendRequest === 'function' ? useAcceptFriendRequest : () => idleMutation();
const readUnfriend = typeof useUnfriend === 'function' ? useUnfriend : () => idleMutation();
const readToggleReaction =
  typeof useToggleReaction === 'function' ? useToggleReaction : () => idleMutation();
const readCreateComment =
  typeof useCreateComment === 'function' ? useCreateComment : () => idleMutation();
const readCreatePost = typeof useCreatePost === 'function' ? useCreatePost : () => idleMutation();

function officialOf(profile: Parameters<typeof isOfficialAccount>[0]) {
  const fn = isOfficialAccount;
  return typeof fn === 'function' ? fn(profile) : false;
}

function creatorOf(profile: Parameters<typeof isCreatorAccount>[0]) {
  const fn = isCreatorAccount;
  return typeof fn === 'function' ? fn(profile) : false;
}

function mediaOnProfile(
  posts: Parameters<typeof collectProfileMedia>[0],
  ownerId: string,
  viewerId?: string | null,
) {
  const fn = collectProfileMedia;
  if (typeof fn !== 'function') {
    return [];
  }
  try {
    return fn(posts, ownerId, viewerId);
  } catch {
    return [];
  }
}

function wallOpen(input: Parameters<typeof canPostOnProfile>[0]) {
  const fn = canPostOnProfile;
  if (typeof fn !== 'function') {
    return false;
  }
  try {
    return fn(input);
  } catch {
    return false;
  }
}

export { ProfileRouteErrorBoundary as ErrorBoundary };

export default function PublicProfileScreen() {
  return (
    <ProfileSafeBoundary>
      <PublicProfileBody />
    </ProfileSafeBoundary>
  );
}

function PublicProfileBody() {
  const params = useLocalSearchParams<{ username: string; posted?: string }>();
  const handle = Array.isArray(params.username) ? params.username[0] : params.username;
  const postedId = Array.isArray(params.posted) ? params.posted[0] : params.posted;
  const router = useRouter();
  const { user } = useAuth();
  const tone = useCopyTone();
  const bundle = readPublicProfile(handle);
  const [tab, setTab] = useState<ProfileTab>('posts');
  const [toast, setToast] = useState<string | null>(null);

  const profile = bundle.data?.profile;
  const posts = readAuthorFeed(profile?.id);
  const friendship = readFriendship(profile?.id);
  const friendCountQuery = readFriendCount(profile?.id);
  const follow = readFollowState(profile?.id);
  const toggleFollow = readToggleFollow(profile?.id);
  const sendRequest = readSendFriendRequest();
  const acceptRequest = readAcceptFriendRequest();
  const unfriend = readUnfriend();
  const toggleReaction = readToggleReaction();
  const createComment = readCreateComment();
  const createPost = readCreatePost();
  const social = useSocialSheetsOptional();
  const bugReport = useBugReport();
  const blockedIds = useBlockedUserIds();
  const unblock = useUnblockUser();
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
  const official = officialOf(profile);
  const relation = friendship.data;
  const publicPosts = Array.isArray(posts.data) ? posts.data : [];
  const photos = mediaOnProfile(publicPosts, profile.id, user?.id);
  const hosted = Array.isArray(bundle.data.hosted) ? bundle.data.hosted : [];
  const participating = Array.isArray(bundle.data.participating) ? bundle.data.participating : [];
  let publicChallenges = [] as typeof hosted;
  try {
    const hiddenFn = profileChallengeIsHiddenFromOthers;
    const seeFn = viewerCanSeeShowcase;
    publicChallenges = [...hosted, ...participating].filter((item, index, list) => {
      if (list.findIndex((row) => row.challenge.id === item.challenge.id) !== index) {
        return false;
      }
      if (isSelf) {
        return true;
      }
      if (typeof hiddenFn === 'function' && hiddenFn(item.challenge)) {
        return false;
      }
      const visibility = item.competed
        ? item.participation?.profile_visibility
        : item.challenge.profile_visibility;
      if (typeof seeFn !== 'function') {
        return false;
      }
      return seeFn({
        viewerId: user?.id,
        ownerId: profile.id,
        visibility,
        friends: relation?.status === 'accepted',
      });
    });
  } catch {
    publicChallenges = [];
  }
  const friendCount = friendCountQuery.data;
  const blocked =
    relation?.status === 'blocked' || (blockedIds.data ?? []).includes(profile.id);
  const canPost = wallOpen({
    viewerId: user?.id,
    host: profile,
    friends: relation?.status === 'accepted',
    followingCreator: follow.isFollowing,
    blocked,
  });

  function confirmUnfriend() {
    if (!profile || unfriend.isPending) {
      return;
    }
    confirmDestructive({
      title: 'Unfriend?',
      confirmLabel: 'Unfriend',
      onConfirm: () => {
        unfriend.mutate(profile.id, {
          onError: (error) => Alert.alert('Couldn’t unfriend', getErrorMessage(error)),
        });
      },
    });
  }

  function followAction() {
    const mutate = toggleFollow.mutate;
    if (!profile || toggleFollow.isPending || typeof mutate !== 'function') {
      return;
    }
    if (follow.isFollowing) {
      confirmDestructive({
        title: 'Unfollow?',
        confirmLabel: 'Unfollow',
        onConfirm: () => {
          toggleFollow.mutate(false, {
            onError: (error) => Alert.alert('Couldn’t unfollow', getErrorMessage(error)),
          });
        },
      });
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
                    measureInWindowSafe(menuRef.current, (rect) => {
                      const openMenu = bugReport.openMenu;
                      if (typeof openMenu !== 'function') {
                        return;
                      }
                      openMenu(rect, { admin: isAdminViewer(profile) });
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
                      measureInWindowSafe(menuRef.current, (rect) => {
                        const toggle = social?.toggleProfileMenu;
                        if (typeof toggle !== 'function') {
                          return;
                        }
                        toggle(profile.id, rect, name);
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
                {blocked ? (
                  <>
                    <View
                      className="items-center justify-center px-3"
                      style={{
                        minHeight: 32,
                        borderRadius: 12,
                        backgroundColor: THEME.surface2,
                      }}>
                      <AppText
                        className="text-[13px] font-extrabold"
                        style={{ color: THEME.textMuted }}>
                        {copy('block.blockedLabel')}
                      </AppText>
                    </View>
                    <Button
                      title={copy('block.unblock')}
                      size="sm"
                      variant="outline"
                      loading={unblock.isPending}
                      onPress={() =>
                        confirmDestructive({
                          title: `${copy('block.unblock')} ${name}?`,
                          confirmLabel: copy('block.unblock'),
                          onConfirm: () =>
                            unblock.mutate(profile.id, {
                              onError: (error) =>
                                Alert.alert(copy('block.unblockFailed'), getErrorMessage(error)),
                            }),
                        })
                      }
                    />
                  </>
                ) : (
                  <>
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
                    {creatorOf(profile) || officialOf(profile) ? (
                      <Button
                        title={follow.isFollowing ? 'Following' : 'Follow'}
                        size="sm"
                        variant="outline"
                        loading={toggleFollow.isPending}
                        onPress={followAction}
                      />
                    ) : null}
                    <Button
                      title="Message"
                      size="sm"
                      variant="outline"
                      onPress={() => router.push(directMessageHref(profile.id))}
                    />
                  </>
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
          <ProfileSectionBoundary
            label="Couldn’t load posts."
            onRetry={() => {
              const refetch = posts.refetch;
              if (typeof refetch === 'function') {
                void refetch();
              }
            }}>
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
            onCompose={(input) => {
              const run = createPost.mutateAsync;
              if (typeof run !== 'function') {
                return;
              }
              return run(input);
            }}
            commenting={createComment.isPending}
            onRetry={() => {
              const refetch = posts.refetch;
              if (typeof refetch === 'function') {
                void refetch();
              }
            }}
            onReact={(post, type, commentId) => {
              const run = toggleReaction.mutate;
              if (typeof run !== 'function') {
                return;
              }
              run({ post, type, commentId });
            }}
            onComment={(post, content, parentId, mentionedUserIds, mentionChips) => {
              const run = createComment.mutateAsync;
              if (typeof run !== 'function') {
                return Promise.resolve();
              }
              return run({
                postId: post.id,
                content,
                parentId,
                mentionedUserIds,
                mentionChips,
              });
            }}
          />
          </ProfileSectionBoundary>
        ) : null}

        {tab === 'photos' ? (
          <ProfileSectionBoundary label="Couldn’t load photos.">
            <ProfileMediaGrid items={photos} posts={publicPosts} />
          </ProfileSectionBoundary>
        ) : null}

        {tab === 'challenges' ? (
          <ProfileSectionBoundary label="Couldn’t load challenges.">
          {publicChallenges.length === 0 ? (
            <MascotState kind="empty" title={copy('profile.challengesEmpty')} compact />
          ) : (
            <View className="gap-1.5">
              {publicChallenges.map((item) => (
                <ProfileChallengeRow key={item.challenge.id} item={item} canEdit={isSelf} />
              ))}
            </View>
          )}
          </ProfileSectionBoundary>
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

