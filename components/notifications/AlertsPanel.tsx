import { useCallback, useMemo } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format, isToday, isYesterday } from 'date-fns';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { MascotState } from '@/components/mascot/MascotState';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import {
  useMarkNotificationsRead,
  useNotifications,
} from '@/hooks/useNotifications';
import { isCoinGrantAlert, isPersonAlert, notificationGlyph, notificationHref } from '@/lib/notifications';
import { personDisplayName } from '@/lib/social';
import { THEME } from '@/lib/theme';
import { copy } from '@/lib/copy';
import type { AppNotification } from '@/lib/types';
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
  const list = useNotifications();
  const markRead = useMarkNotificationsRead();
  const tone = useCopyTone();
  const items = list.data ?? [];
  const unreadCount = items.filter((item) => !item.read_at).length;
  const rows = useMemo(() => groupByDay(items), [items]);

  const onOpen = useCallback(
    (item: AppNotification) => {
      if (!item.read_at) {
        markRead.mutate([item.id]);
      }
      onClose?.();
      const href = notificationHref(item);
      if (href) {
        router.push(href);
      }
    },
    [markRead, onClose, router],
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
              <NotificationRow item={row.item} onPress={() => onOpen(row.item)} />
            )
          }
        />
      )}
    </View>
  );
}

function NotificationArt({ item }: { item: AppNotification }) {
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
}: {
  item: AppNotification;
  onPress: () => void;
}) {
  const unread = !item.read_at;
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
            numberOfLines={2}>
            {item.title}
          </AppText>
          <AppText className="text-[11px] text-muted">{formatFeedTime(item.created_at)}</AppText>
        </View>
        {item.body ? (
          <AppText className="mt-0.5 text-sm leading-5 text-muted" numberOfLines={2}>
            {item.body}
          </AppText>
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
