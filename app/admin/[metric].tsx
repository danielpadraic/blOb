import { format } from 'date-fns';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { MascotState } from '@/components/mascot/MascotState';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useAdminPulseList } from '@/hooks/useAdmin';
import { type AdminPulseMetric, type AdminPulseRow, type AdminRange } from '@/lib/admin';
import { challengeDetailHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';

const TITLES: Record<AdminPulseMetric, string> = {
  accounts: 'New accounts',
  dau: 'DAU',
  joins: 'Challenge joins',
  checkins: 'Submitted check-ins',
  filling: 'Official filling',
  live: 'Official live',
  errors: 'Errors',
};

function asMetric(value: string | undefined): AdminPulseMetric | null {
  if (
    value === 'accounts' ||
    value === 'dau' ||
    value === 'joins' ||
    value === 'checkins' ||
    value === 'filling' ||
    value === 'live' ||
    value === 'errors'
  ) {
    return value;
  }
  return null;
}

function asRange(value: string | undefined): AdminRange {
  return value === '7d' ? '7d' : 'today';
}

function when(at?: string | null): string {
  if (!at) {
    return '';
  }
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return format(date, 'MMM d, h:mm a');
}

function person(row: AdminPulseRow): string {
  if (row.username) {
    return `@${row.username}`;
  }
  if (row.display_name) {
    return row.display_name;
  }
  return row.user_id ? row.user_id.slice(0, 8) : '—';
}

export default function AdminMetricScreen() {
  const params = useLocalSearchParams<{ metric?: string; range?: string }>();
  const metric = asMetric(Array.isArray(params.metric) ? params.metric[0] : params.metric);
  const range = asRange(Array.isArray(params.range) ? params.range[0] : params.range);
  const router = useRouter();
  const list = useAdminPulseList(metric ?? 'accounts', range, Boolean(metric));

  if (!metric) {
    return (
      <Screen>
        <MascotState kind="error" title="Unknown metric" compact />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: TITLES[metric] }} />
      <View className="gap-3 pb-6 pt-1">
        {list.isLoading && !list.data ? (
          <MascotState kind="loading" title="Loading…" compact />
        ) : list.error ? (
          <MascotState
            kind="error"
            title="Couldn’t load that list"
            body="Try again in a moment."
            actionLabel="Retry"
            onAction={() => void list.refetch()}
            compact
          />
        ) : (list.data ?? []).length === 0 ? (
          <MascotState kind="empty" title="Nothing here yet" compact />
        ) : (
          (list.data ?? []).map((row, index) => {
            const key = `${row.user_id ?? ''}-${row.challenge_id ?? ''}-${row.at ?? index}-${index}`;
            return (
              <Card key={key} padded={false}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    if (row.challenge_id) {
                      router.push(challengeDetailHref(row.challenge_id));
                      return;
                    }
                    if (row.username) {
                      router.push({
                        pathname: '/profile/u/[username]',
                        params: { username: row.username },
                      });
                    }
                  }}
                  className="px-4 py-3"
                  style={{ minHeight: 56, justifyContent: 'center' }}>
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="min-w-0 flex-1">
                      <AppText className="text-[15px] font-bold text-charcoal" numberOfLines={1}>
                        {row.title ?? person(row)}
                      </AppText>
                      <AppText className="mt-0.5 text-[13px]" style={{ color: THEME.textMuted }} numberOfLines={2}>
                        {row.title ? person(row) : row.message ?? row.route ?? ''}
                      </AppText>
                    </View>
                    <AppText className="text-[11px] text-muted">{when(row.at)}</AppText>
                  </View>
                </Pressable>
              </Card>
            );
          })
        )}
      </View>
    </Screen>
  );
}
