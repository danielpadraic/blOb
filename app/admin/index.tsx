import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { MascotState } from '@/components/mascot/MascotState';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AppText } from '@/components/ui/AppText';
import { AdminWallets } from '@/components/admin/AdminWallets';
import { useAdminPulse } from '@/hooks/useAdmin';
import { type AdminPulseMetric, type AdminRange } from '@/lib/admin';
import { ADMIN_ERRORS_HREF, ADMIN_REPORTS_HREF, adminMetricHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import { useState } from 'react';

const RANGE_OPTIONS = [
  { value: 'today' as const, label: 'Today' },
  { value: '7d' as const, label: '7 days' },
];

type PulseCard = {
  metric: AdminPulseMetric;
  label: string;
  hint: string;
  value: number;
};

export default function AdminPulseScreen() {
  const router = useRouter();
  const [range, setRange] = useState<AdminRange>('today');
  const pulse = useAdminPulse(range, true);

  const cards: PulseCard[] = [
    { metric: 'accounts', label: 'New accounts', hint: range === '7d' ? 'Last 7 days' : 'Today', value: pulse.data?.accounts ?? 0 },
    { metric: 'dau', label: 'DAU', hint: 'Opened or wrote', value: pulse.data?.dau ?? 0 },
    { metric: 'joins', label: 'Challenge joins', hint: range === '7d' ? 'Last 7 days' : 'Today', value: pulse.data?.joins ?? 0 },
    { metric: 'checkins', label: 'Submitted check-ins', hint: range === '7d' ? 'Last 7 days' : 'Today', value: pulse.data?.checkins ?? 0 },
    { metric: 'filling', label: 'Official filling', hint: 'Right now', value: pulse.data?.filling ?? 0 },
    { metric: 'live', label: 'Official live', hint: 'Right now', value: pulse.data?.live ?? 0 },
    { metric: 'errors', label: 'Errors', hint: 'Last 24h', value: pulse.data?.errors ?? 0 },
  ];

  return (
    <Screen scroll>
      <View className="gap-4 pb-6 pt-1">
        <View className="flex-row items-center justify-between">
          <AppText className="text-[22px] font-extrabold text-charcoal">Pulse</AppText>
          <View className="flex-row items-center gap-4">
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(ADMIN_ERRORS_HREF)}
              style={{ minHeight: 44, justifyContent: 'center' }}>
              <AppText className="text-[14px] font-semibold" style={{ color: THEME.accent }}>
                Errors
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(ADMIN_REPORTS_HREF)}
              style={{ minHeight: 44, justifyContent: 'center' }}>
              <AppText className="text-[14px] font-semibold" style={{ color: THEME.accent }}>
                Reports
              </AppText>
            </Pressable>
          </View>
        </View>

        <SegmentedControl
          value={range}
          options={RANGE_OPTIONS}
          onChange={setRange}
          accessibilityLabel="Pulse range"
        />

        {pulse.isLoading && !pulse.data ? (
          <MascotState kind="loading" title="Loading counts…" compact />
        ) : pulse.error ? (
          <MascotState
            kind="error"
            title="Couldn’t load Pulse"
            body="Try again in a moment."
            actionLabel="Retry"
            onAction={() => void pulse.refetch()}
            compact
          />
        ) : (
          <View className="gap-3">
            {cards.map((card) => (
              <Pressable
                key={card.metric}
                accessibilityRole="button"
                onPress={() => {
                  if (card.metric === 'errors') {
                    router.push(ADMIN_ERRORS_HREF);
                    return;
                  }
                  router.push(adminMetricHref(card.metric, range));
                }}>
                <Card>
                  <View className="flex-row items-end justify-between">
                    <View className="min-w-0 flex-1 pr-3">
                      <AppText className="text-[15px] font-bold text-charcoal">{card.label}</AppText>
                      <AppText className="mt-0.5 text-[12px] text-muted">{card.hint}</AppText>
                    </View>
                    <AppText className="text-[28px] font-extrabold leading-8 text-charcoal">
                      {card.value}
                    </AppText>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}

        {pulse.data?.start ? (
          <AppText className="text-center text-[11px] text-muted">
            Since {format(new Date(pulse.data.start), 'MMM d, h:mm a')} (Chicago)
          </AppText>
        ) : null}

        <AdminWallets />
      </View>
    </Screen>
  );
}
