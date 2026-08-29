import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format, isToday, isYesterday } from 'date-fns';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { MascotState } from '@/components/mascot/MascotState';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/hooks/useAuth';
import { useMarkNotificationsRead, useNotifications } from '@/hooks/useNotifications';
import { useResolveStartRoll } from '@/hooks/useChallenge';
import { useAcceptCircleInvite, useDeclineCircleInvite } from '@/hooks/useCircles';
import { useAcceptFriendRequest, useRejectFriendRequest } from '@/hooks/useSocial';
import {
  highFiveChallengeId,
  highFiveMemberIds,
  highFivePrefill,
  notificationHasHighFive,
  openHighFiveConversation,
} from '@/lib/highFive';
import {
  friendRequestFromUserId,
  isCoinGrantAlert,
  isPersonAlert,
  notificationCircleId,
  notificationGlyph,
  notificationHref,
} from '@/lib/notifications';
import { circleDetailHref, conversationHref } from '@/lib/routes';
import { personDisplayName } from '@/lib/social';
import { THEME } from '@/lib/theme';
import { copy } from '@/lib/copy';
import type { AppNotification } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { formatFeedTime } from '@/utils/format';
import { useCopyTone } from '@/hooks/useCopy';

type AlertsPanelProps = {
  compact?: boolean;
  onClose?: () => void;
};

type ListRow =
  | { kind: 'day'; id: string; label: string }
  | { kind: 'item'; id: string; item: AppNotification };

function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  if (isToday(date)) {
    return 'Today';
  }
  if (isYesterday(date)) {
    return 'Yesterday';
  }
  return format(date, 'EEE, MMM d');
}

function groupByDay(items: AppNotification[]): ListRow[] {
  const rows: ListRow[] = [];
  let last = '';
  for (const item of items) {
    const label = dayLabel(item.created_at);
    if (label && label !== last) {
      last = label;
      rows.push({ kind: 'day', id: `day-${label}-${item.id}`, label });
    }
    rows.push({ kind: 'item', id: item.id, item });
  }
  return rows;
}

export function AlertsPanel({ compact = false, onClose }: AlertsPanelProps) {
  const router = useRouter();
  const { user } = useAuth();
  const list = useNotifications();
  const markRead = useMarkNotificationsRead();
  const resolveRoll = useResolveStartRoll();
  const acceptFriend = useAcceptFriendRequest();
  const denyFriend = useRejectFriendRequest();
  const acceptCircle = useAcceptCircleInvite();
  const declineCircle = useDeclineCircleInvite();
  const tone = useCopyTone();
  const [highFiveBusyId, setHighFiveBusyId] = useState<string | null>(null);
  const items = list.data ?? [];
  const unreadCount = items.filter((item) => !item.read_at).length;
  const rows = useMemo(() => groupByDay(items), [items]);

  const onFriendRequest = useCallback(
    (item: AppNotification, action: 'confirm' | 'deny') => {
      const fromUserId = friendRequestFromUserId(item);
      if (!fromUserId) {
        return;
      }
      const busy =
        (acceptFriend.isPending && acceptFriend.variables === fromUserId) ||
        (denyFriend.isPending && denyFriend.variables === fromUserId);
      if (busy) {
        return;
      }
      const mark = () => {
        if (!item.read_at) {
          markRead.mutate([item.id]);
        }
      };
      if (action === 'confirm') {
        acceptFriend.mutate(fromUserId, {
          onSuccess: mark,
          onError: (error) => Alert.alert('Couldn’t confirm that request', getErrorMessage(error)),
        });
        return;
      }
      denyFriend.mutate(fromUserId, {
        onSuccess: mark,
        onError: (error) => Alert.alert('Couldn’t deny that request', getErrorMessage(error)),
      });
    },
    [acceptFriend, denyFriend, markRead],
  );

  const onCircleInvite = useCallback(
    (item: AppNotification, action: 'confirm' | 'deny') => {
      const circleId = notificationCircleId(item.data);
      if (!circleId) {
        return;
      }
      const busy = acceptCircle.isPending || declineCircle.isPending;
      if (busy) {
        return;
      }
      const mark = () => {
        if (!item.read_at) {
          markRead.mutate([item.id]);
        }
      };
      if (action === 'confirm') {
        acceptCircle.mutate(circleId, {
          onSuccess: () => {
            mark();
            onClose?.();
            router.push(circleDetailHref(circleId, { tab: 'feed' }));
          },
          onError: (error) => Alert.alert('Couldn’t join that Circle', getErrorMessage(error)),
        });
        return;
      }
      declineCircle.mutate(circleId, {
        onSuccess: mark,
        onError: (error) => Alert.alert('Couldn’t decline that invite', getErrorMessage(error)),
      });
    },
    [acceptCircle, declineCircle, markRead, onClose, router],
  );

  const onHighFive = useCallback(
    async (item: AppNotification) => {
      const challengeId = highFiveChallengeId(item);
      const members = highFiveMemberIds(item);
      if (!challengeId || members.length === 0 || highFiveBusyId) {
        return;
      }
      setHighFiveBusyId(item.id);
      try {
        if (!item.read_at) {
          markRead.mutate([item.id]);
        }
        const conversation = await openHighFiveConversation(challengeId, members, user?.id);
        onClose?.();
        router.push(
          conversationHref(conversation.id, {
            focus: true,
            draft: highFivePrefill(item),
          }),
        );
      } catch (error) {
        Alert.alert('Couldn’t open that chat', getErrorMessage(error));
      } finally {
        setHighFiveBusyId(null);
      }
    },
    [highFiveBusyId, markRead, onClose, router, user?.id],
  );

  const onOpen = useCallback(
    (item: AppNotification) => {
      if (notificationHasHighFive(item)) {
        void onHighFive(item);
        return;
      }
      if (!item.read_at) {
        markRead.mutate([item.id]);
      }
      onClose?.();
      const href = notificationHref(item);
      if (href) {
        router.push(href);
      }
    },
    [markRead, onClose, onHighFive, router],
  );

  return (
    <View className={compact ? 'px-3 pt-3' : undefined}>
      <View className="mb-2 flex-row items-center justify-between">
        <AppText className="text-[18px] font-extrabold text-charcoal">Alerts</AppText>
        {unreadCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => markRead.mutate(undefined)}
            hitSlop={8}>
            <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
              Mark all read
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {list.isLoading ? (
        <MascotState compact={compact} kind="loading" title={copy('alerts.loading')} />
      ) : list.error ? (
        <MascotState
          compact={compact}
          kind="error"
          title={copy('alerts.error')}
          body={list.error instanceof Error ? list.error.message : 'Try again in a moment.'}
          actionLabel="Retry"
          onAction={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <MascotState compact={compact} kind="empty" title={copy('alerts.empty', tone)} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: compact ? 12 : 24 }}
          style={compact ? { maxHeight: 340 } : undefined}
          onRefresh={() => void list.refetch()}
          refreshing={list.isRefetching && !list.isLoading}
          renderItem={({ item: row }) =>
            row.kind === 'day' ? (
              <AppText
                className="mb-1 mt-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                {row.label}
              </AppText>
            ) : (
              <NotificationRow
                item={row.item}
                onPress={() => onOpen(row.item)}
                highFivePending={highFiveBusyId === row.item.id}
                onHighFive={() => void onHighFive(row.item)}
                friendActionPending={
                  (acceptFriend.isPending &&
                    acceptFriend.variables === friendRequestFromUserId(row.item)) ||
                  (denyFriend.isPending &&
                    denyFriend.variables === friendRequestFromUserId(row.item))
                }
                onFriendRequest={(action) => onFriendRequest(row.item, action)}
                circleActionPending={
                  (acceptCircle.isPending && acceptCircle.variables === notificationCircleId(row.item.data)) ||
                  (declineCircle.isPending && declineCircle.variables === notificationCircleId(row.item.data))
                }
                onCircleInvite={(action) => onCircleInvite(row.item, action)}
                onResolveStart={(keep) => {
                  const challengeId = row.item.data?.challenge_id;
                  if (!challengeId || resolveRoll.isPending) {
                    return;
                  }
                  if (!row.item.read_at) {
                    markRead.mutate([row.item.id]);
                  }
                  const startsAt = row.item.data?.starts_at ?? new Date().toISOString();
                  resolveRoll.mutate({
                    challengeId,
                    startsAt,
                    mode: keep ? 'keep' : 'shorten',
                  });
                }}
              />
            )
          }
        />
      )}
    </View>
  );
}

function NotificationArt({ item }: { item: AppNotification }) {
  if (item.type === 'bob_encouragement') {
    return (
      <View className="h-10 w-10 items-center justify-center">
        <BlobMascot variant="wave" size={40} />
      </View>
    );
  }
  if (isCoinGrantAlert(item)) {
    return (
      <View className="h-10 w-10 items-center justify-center">
        <CurrencyMark
          currency={item.data?.currency === 'bucks' ? 'bucks' : 'coins'}
          size={36}
        />
      </View>
    );
  }
  if (isPersonAlert(item) && item.actor) {
    return (
      <Avatar
        uri={item.actor.avatar_url}
        name={personDisplayName(item.actor)}
        size={40}
      />
    );
  }
  return (
    <View
      className="h-10 w-10 items-center justify-center rounded-full"
      style={{ backgroundColor: THEME.surface2 }}>
      <AppText className="text-[18px]">{notificationGlyph(item.type, item.data)}</AppText>
    </View>
  );
}

function NotificationRow({
  item,
  onPress,
  onResolveStart,
  onFriendRequest,
  friendActionPending,
  onCircleInvite,
  circleActionPending,
  onHighFive,
  highFivePending,
}: {
  item: AppNotification;
  onPress: () => void;
  onResolveStart?: (keep: boolean) => void;
  onFriendRequest?: (action: 'confirm' | 'deny') => void;
  friendActionPending?: boolean;
  onCircleInvite?: (action: 'confirm' | 'deny') => void;
  circleActionPending?: boolean;
  onHighFive?: () => void;
  highFivePending?: boolean;
}) {
  const unread = !item.read_at;
  const tone = useCopyTone();
  const keepDays = Math.max(Number(item.data?.keep_days) || 0, 1);
  const showRoll = item.type === 'start_rolled' && Boolean(item.data?.challenge_id) && onResolveStart;
  const canShorten = item.data?.can_shorten !== false;
  const showFriendActions =
    item.type === 'friend_request' && unread && Boolean(friendRequestFromUserId(item)) && onFriendRequest;
  const showCircleActions =
    item.type === 'circle_invite' && unread && Boolean(notificationCircleId(item.data)) && onCircleInvite;
  const showHighFive = notificationHasHighFive(item) && Boolean(onHighFive);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="mb-2 flex-row items-start px-3 py-3"
      style={{
        backgroundColor: THEME.surface,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: THEME.border,
      }}>
      <NotificationArt item={item} />
      <View className="ml-3 flex-1">
        <View className="flex-row items-center justify-between gap-2">
          <AppText
            className={`flex-1 text-charcoal ${unread ? 'font-bold' : 'font-medium'}`}
            numberOfLines={item.type === 'bob_encouragement' || showHighFive ? 4 : 2}>
            {item.title}
          </AppText>
          <AppText className="text-[11px] text-muted">{formatFeedTime(item.created_at)}</AppText>
        </View>
        {item.body ? (
          <AppText className="mt-0.5 text-sm leading-5 text-muted" numberOfLines={2}>
            {item.body}
          </AppText>
        ) : null}
        {showRoll ? (
          <View className="mt-2 flex-row flex-wrap gap-2">
            <Pressable
              accessibilityRole="button"
              onPress={(event) => {
                event.stopPropagation();
                onResolveStart(true);
              }}
              className="rounded-full px-3"
              style={{ minHeight: 36, justifyContent: 'center', backgroundColor: THEME.primary }}>
              <AppText className="text-[13px] font-semibold" style={{ color: THEME.primaryForeground }}>
                {copy('challenge.keepDays', tone, { n: keepDays })}
              </AppText>
            </Pressable>
            {canShorten ? (
              <Pressable
                accessibilityRole="button"
                onPress={(event) => {
                  event.stopPropagation();
                  onResolveStart(false);
                }}
                className="rounded-full px-3"
                style={{
                  minHeight: 36,
                  justifyContent: 'center',
                  backgroundColor: THEME.surface,
                  borderWidth: 1,
                  borderColor: THEME.border,
                }}>
                <AppText className="text-[13px] font-semibold" style={{ color: THEME.textPrimary }}>
                  {copy('challenge.shortenDay')}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {showFriendActions ? (
          <View className="mt-2 flex-row flex-wrap gap-2">
            <Pressable
              accessibilityRole="button"
              disabled={friendActionPending}
              onPress={(event) => {
                event.stopPropagation();
                onFriendRequest('confirm');
              }}
              className="rounded-full px-3"
              style={{ minHeight: 36, justifyContent: 'center', backgroundColor: THEME.primary }}>
              <AppText className="text-[13px] font-semibold" style={{ color: THEME.primaryForeground }}>
                Confirm
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={friendActionPending}
              onPress={(event) => {
                event.stopPropagation();
                onFriendRequest('deny');
              }}
              className="rounded-full px-3"
              style={{
                minHeight: 36,
                justifyContent: 'center',
                backgroundColor: THEME.surface,
                borderWidth: 1,
                borderColor: THEME.border,
              }}>
              <AppText className="text-[13px] font-semibold" style={{ color: THEME.textPrimary }}>
                Deny
              </AppText>
            </Pressable>
          </View>
        ) : null}
        {showHighFive ? (
          <View className="mt-2 flex-row flex-wrap gap-2">
            <Pressable
              accessibilityRole="button"
              disabled={highFivePending}
              onPress={(event) => {
                event.stopPropagation();
                onHighFive?.();
              }}
              className="rounded-full px-3"
              style={{ minHeight: 36, justifyContent: 'center', backgroundColor: THEME.primary }}>
              <AppText className="text-[13px] font-semibold" style={{ color: THEME.primaryForeground }}>
                High-five
              </AppText>
            </Pressable>
          </View>
        ) : null}
        {showCircleActions ? (
          <View className="mt-2 flex-row flex-wrap gap-2">
            <Pressable
              accessibilityRole="button"
              disabled={circleActionPending}
              onPress={(event) => {
                event.stopPropagation();
                onCircleInvite('confirm');
              }}
              className="rounded-full px-3"
              style={{ minHeight: 44, justifyContent: 'center', backgroundColor: THEME.primary }}>
              <AppText className="text-[13px] font-semibold" style={{ color: THEME.primaryForeground }}>
                Accept
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={circleActionPending}
              onPress={(event) => {
                event.stopPropagation();
                onCircleInvite('deny');
              }}
              className="rounded-full px-3"
              style={{
                minHeight: 44,
                justifyContent: 'center',
                backgroundColor: THEME.surface,
                borderWidth: 1,
                borderColor: THEME.border,
              }}>
              <AppText className="text-[13px] font-semibold" style={{ color: THEME.textPrimary }}>
                Decline
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </View>
      {unread ? (
        <View
          className="ml-2 mt-2 h-2 w-2 rounded-full"
          style={{ backgroundColor: THEME.accent }}
        />
      ) : null}
    </Pressable>
  );
}
