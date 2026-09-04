import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveThread } from '@/components/challenge/LiveThread';
import { CircleInviteSheet } from '@/components/circles/CircleInviteSheet';
import { CirclePageTabs, type CirclePageTab } from '@/components/circles/CirclePageTabs';
import { CirclePinsSection } from '@/components/circles/CirclePinsSection';
import { CircleVisibilityPicker } from '@/components/circles/CircleVisibilityPicker';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { MascotState } from '@/components/mascot/MascotState';
import { StackBackButton } from '@/components/navigation/StackBackButton';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { WalletBar } from '@/components/wallet/WalletBar';
import { useAuth } from '@/hooks/useAuth';
import {
  useAcceptCircleInvite,
  useCircle,
  useCircleMembers,
  useLeaveCircle,
  useRemoveCircleMember,
  useUpdateCircleVisibility,
} from '@/hooks/useCircles';
import { useCircleFeed, useCreatePost } from '@/hooks/useFeed';
import { useToggleLiveReaction } from '@/hooks/useLiveReaction';
import { useCopyTone } from '@/hooks/useCopy';
import { copy } from '@/lib/copy';
import { asCirclePageTab, circleDisplayName } from '@/lib/circles';
import { createChallengeHref } from '@/lib/routes';
import { personDisplayName } from '@/lib/social';
import { flexChildMin, tabBarLift, THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

function CircleStackTitle({ name }: { name: string }) {
  if (!name) {
    return null;
  }
  return (
    <View style={{ flex: 1, minWidth: 0, maxWidth: '100%', justifyContent: 'center' }}>
      <AppText
        numberOfLines={1}
        ellipsizeMode="tail"
        className="text-[17px] font-extrabold text-charcoal"
        style={{ minWidth: 0, maxWidth: '100%', flexShrink: 1 }}>
        {name}
      </AppText>
    </View>
  );
}

export default function CirclePageScreen() {
  const params = useLocalSearchParams<{ id?: string; tab?: string; postId?: string; commentId?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const highlightPostId = Array.isArray(params.postId) ? params.postId[0] : params.postId;
  const highlightCommentId = Array.isArray(params.commentId) ? params.commentId[0] : params.commentId;
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tone = useCopyTone();
  const circleQuery = useCircle(id);
  const circle = circleQuery.data;
  const isMember = Boolean(circle?.my_role);
  const isHost = circle?.my_role === 'host';
  const [pageTab, setPageTab] = useState<CirclePageTab>(() =>
    highlightPostId || highlightCommentId ? 'chat' : asCirclePageTab(tabParam),
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const displayTab = asCirclePageTab(pageTab, circle ? isMember : null);
  const roster = useCircleMembers(id, isMember);
  const mentionMemberIds = useMemo(
    () => (roster.data ?? []).map((row) => row.user_id).filter(Boolean),
    [roster.data],
  );
  const feed = useCircleFeed(id);
  const createPost = useCreatePost();
  const toggleLiveReaction = useToggleLiveReaction();
  const accept = useAcceptCircleInvite();
  const leave = useLeaveCircle();
  const removeMember = useRemoveCircleMember(id);
  const setVisibility = useUpdateCircleVisibility(id);

  useEffect(() => {
    if (highlightPostId || highlightCommentId) {
      setPageTab('chat');
      return;
    }
    setPageTab(asCirclePageTab(tabParam, circle ? isMember : null));
  }, [circle, highlightCommentId, highlightPostId, isMember, tabParam]);

  const title = circleDisplayName(circle);
  const memberLabel =
    (circle?.member_count ?? 0) === 1
      ? copy('circles.memberOne')
      : copy('circles.members', tone, { n: circle?.member_count ?? 0 });

  const hostRow = useMemo(
    () => (roster.data ?? []).find((row) => row.role === 'host') ?? null,
    [roster.data],
  );
  const host = circle?.host ?? hostRow?.profile ?? null;

  function fail(error: unknown, fallback: string) {
    Alert.alert(fallback, getErrorMessage(error));
  }

  function onJoin() {
    if (!id) {
      return;
    }
    accept.mutate(id, {
      onSuccess: () => setPageTab('chat'),
      onError: (error) => fail(error, 'Couldn’t join that Circle'),
    });
  }

  function onLeave() {
    if (!id) {
      return;
    }
    Alert.alert(copy('circles.leaveConfirm'), undefined, [
      { text: 'Stay', style: 'cancel' },
      {
        text: copy('circles.leave'),
        style: 'destructive',
        onPress: () =>
          leave.mutate(id, {
            onSuccess: () => router.replace('/friends'),
            onError: (error) => fail(error, copy('circles.lastHost')),
          }),
      },
    ]);
  }

  function onRemove(userId: string) {
    Alert.alert(copy('circles.removeConfirm'), undefined, [
      { text: 'Keep', style: 'cancel' },
      {
        text: copy('circles.removeMember'),
        style: 'destructive',
        onPress: () =>
          removeMember.mutate(userId, {
            onError: (error) => fail(error, 'Couldn’t remove that person'),
          }),
      },
    ]);
  }

  if (!id) {
    return (
      <Screen>
        <MascotState kind="error" title="That Circle isn’t here." />
      </Screen>
    );
  }

  if (circleQuery.isLoading && !circle) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Stack.Screen options={{ title: '', headerLeft: () => <StackBackButton fallback="/friends" />, headerRight: () => <WalletBar compact /> }} />
        <MascotState kind="loading" title={copy('circles.loading', tone)} />
      </Screen>
    );
  }

  if (!circle) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Stack.Screen options={{ title: '', headerLeft: () => <StackBackButton fallback="/friends" />, headerRight: () => <WalletBar compact /> }} />
        <MascotState
          kind="error"
          title="Couldn’t load that Circle"
          actionLabel="Retry"
          onAction={() => void circleQuery.refetch()}
        />
      </Screen>
    );
  }

  const tabClearance = tabBarLift(insets.bottom, 'sticky');

  return (
    <Screen padded={false} edges={['left', 'right']} keyboardAvoiding={displayTab !== 'chat'}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerTitle: () => <CircleStackTitle name={circle.name} />,
          headerBackVisible: false,
          headerLeft: () => <StackBackButton fallback="/friends" />,
          headerRight: () => <WalletBar compact />,
        }}
      />
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <CirclePageTabs value={displayTab} onChange={setPageTab} member={isMember} />
      </View>

      {displayTab === 'chat' && isMember ? (
        <LiveThread
          posts={(feed.data ?? []).filter((post) => post.circle_id === id && post.type !== 'circle_invite')}
          isLoading={feed.isLoading}
          isRefreshing={feed.isRefetching && !feed.isLoading}
          error={feed.error instanceof Error ? feed.error.message : null}
          currentUserId={user?.id}
          emptyTitle={copy('circles.feedEmpty')}
          emptyBody=""
          canCompose
          composing={createPost.isPending}
          highlightPostId={highlightPostId}
          highlightCommentId={highlightCommentId}
          memberIds={mentionMemberIds}
          placeholder={copy('circles.chatComposer')}
          loadingTitle="Loading"
          composeSource="circle"
          composeAudience="friends"
          onRefresh={() => void feed.refetch()}
          onRetry={() => void feed.refetch()}
          onCompose={(input) =>
            createPost.mutateAsync({
              ...input,
              circleId: id,
              source: 'circle',
              type: 'feed',
              audience: 'friends',
            })
          }
          onReact={(post, type, commentId) => toggleLiveReaction.mutate({ post, type, commentId })}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: tabClearance + 24, gap: 14 }}
          refreshControl={
            <RefreshControl
              refreshing={circleQuery.isRefetching && !circleQuery.isLoading}
              onRefresh={() => {
                void circleQuery.refetch();
                if (isMember) {
                  void roster.refetch();
                }
              }}
              tintColor={THEME.circle}
            />
          }>
          {displayTab === 'details' ? (
            <View className="gap-3">
              <View
                style={{
                  height: 160,
                  borderRadius: THEME.radius,
                  overflow: 'hidden',
                  backgroundColor: THEME.circleSoft,
                  ...themeShadow('card'),
                }}>
                {circle.banner_url ? (
                  <Image source={{ uri: circle.banner_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <View className="flex-1 items-center justify-center">
                    <BlobMascot variant="wave" size={88} />
                  </View>
                )}
              </View>
              <AppText className="text-[22px] font-extrabold text-charcoal">{circle.name}</AppText>
              <AppText className="text-[14px] text-muted">{circle.focus}</AppText>
              {circle.description ? (
                <AppText className="text-[15px] leading-6 text-charcoal">{circle.description}</AppText>
              ) : null}
              <CirclePinsSection circleId={id} isHost={isHost} />
              {host ? (
                <ProfileLink username={host.username} userId={host.id} style={{ minHeight: 44 }}>
                  <View className="flex-row items-center" style={{ gap: 10 }}>
                    <Avatar uri={host.avatar_url} name={personDisplayName(host)} size={36} />
                    <View style={flexChildMin()}>
                      <AppText className="text-[14px] font-semibold text-charcoal" numberOfLines={1}>
                        {copy('circles.hostedBy')} {personDisplayName(host)}
                      </AppText>
                    </View>
                  </View>
                </ProfileLink>
              ) : null}
              <AppText className="text-[13px] text-muted">{memberLabel}</AppText>
              {isHost ? (
                <CircleVisibilityPicker
                  value={circle.visibility}
                  onChange={(next) =>
                    setVisibility.mutate(next, {
                      onError: (error) => fail(error, 'Couldn’t update who can find this Circle'),
                    })
                  }
                />
              ) : null}
              {!isMember && !circle.can_join ? (
                <MascotState kind="empty" title={copy('circles.unavailable')} compact />
              ) : null}
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {circle.can_join ? (
                  <Button title={copy('circles.join')} onPress={onJoin} loading={accept.isPending} />
                ) : null}
                {isMember ? (
                  <Button title={copy('circles.invite')} variant="outline" onPress={() => setInviteOpen(true)} />
                ) : null}
                {isMember ? (
                  <Button title={copy('circles.leave')} variant="ghost" onPress={onLeave} />
                ) : null}
              </View>
              {isMember ? (
                <Button
                  title={copy('circles.createChallenge')}
                  onPress={() => router.push(createChallengeHref({ mode: 'simple', circleId: id }))}
                />
              ) : null}
            </View>
          ) : null}

          {displayTab === 'roster' ? (
            isMember ? (
              <View className="gap-3">
                <View className="flex-row items-center justify-between">
                  <AppText className="text-[13px] text-muted">{memberLabel}</AppText>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setInviteOpen(true)}
                    style={{ minHeight: 44, justifyContent: 'center' }}>
                    <AppText className="text-[14px] font-semibold" style={{ color: THEME.circle }}>
                      {copy('circles.invite')}
                    </AppText>
                  </Pressable>
                </View>
                {(roster.data ?? []).map((row) => {
                  const person = row.profile;
                  const label = person ? personDisplayName(person) : 'Member';
                  return (
                    <View key={row.user_id} className="flex-row items-center" style={{ minHeight: 44, gap: 10 }}>
                      <ProfileLink username={person?.username} userId={row.user_id} style={{ flex: 1, minHeight: 44 }}>
                        <View className="flex-row items-center" style={{ gap: 10 }}>
                          <Avatar uri={person?.avatar_url} name={label} size={40} />
                          <View style={flexChildMin()}>
                            <AppText className="text-[15px] font-semibold text-charcoal" numberOfLines={1}>
                              {label}
                            </AppText>
                            <AppText className="text-[12px] text-muted">{row.role === 'host' ? 'Host' : 'Member'}</AppText>
                          </View>
                        </View>
                      </ProfileLink>
                      {isHost && row.user_id !== user?.id ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={copy('circles.removeMember')}
                          onPress={() => onRemove(row.user_id)}
                          style={{ minHeight: 44, minWidth: 72, justifyContent: 'center' }}>
                          <AppText className="text-[13px] font-semibold" style={{ color: THEME.danger }}>
                            {copy('circles.removeMember')}
                          </AppText>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View className="gap-3">
                <AppText className="text-[13px] text-muted">{memberLabel}</AppText>
                {host ? (
                  <ProfileLink username={host.username} userId={host.id} style={{ minHeight: 44 }}>
                    <View className="flex-row items-center" style={{ gap: 10 }}>
                      <Avatar uri={host.avatar_url} name={personDisplayName(host)} size={40} />
                      <View>
                        <AppText className="text-[15px] font-semibold text-charcoal">{personDisplayName(host)}</AppText>
                        <AppText className="text-[12px] text-muted">Host</AppText>
                      </View>
                    </View>
                  </ProfileLink>
                ) : null}
                <MascotState kind="empty" title={copy('circles.joinToSee')} compact />
              </View>
            )
          ) : null}
        </ScrollView>
      )}

      <CircleInviteSheet
        visible={inviteOpen}
        circleId={id}
        circleName={title}
        onClose={() => setInviteOpen(false)}
      />
    </Screen>
  );
}
