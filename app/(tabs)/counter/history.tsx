import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useLiveCounters, useSavedCounters } from '@/hooks/useCounter';
import { formatCounterDate } from '@/lib/counter/session';
import type { CounterSummary } from '@/lib/counter/types';
import { counterHref } from '@/lib/routes';
import { tabBarLift, THEME, themeShadow } from '@/lib/theme';

export default function CounterHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'live' | 'saved'>('saved');
  const live = useLiveCounters();
  const saved = useSavedCounters();
  const rows = tab === 'live' ? (live.data ?? []) : (saved.data ?? []);

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES}>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8 }}>
        {(['live', 'saved'] as const).map((item) => (
          <Pressable
            key={item}
            onPress={() => setTab(item)}
            style={{
              minHeight: 36,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: tab === item ? THEME.accentSoft : THEME.surface,
              borderWidth: 1,
              borderColor: tab === item ? THEME.accent : THEME.border,
              justifyContent: 'center',
            }}>
            <AppText style={{ fontWeight: '800', color: tab === item ? THEME.accent : THEME.textPrimary }}>
              {item === 'live' ? 'Live' : 'Saved'}
            </AppText>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: tabBarLift(insets.bottom, 'sticky') + 16, gap: 10 }}>
        {rows.length === 0 ? (
          <AppText style={{ color: THEME.textMuted }}>
            {tab === 'live' ? 'No live counters yet.' : 'Nothing saved yet.'}
          </AppText>
        ) : null}
        {rows.map((row) => (
          <HistoryCard key={row.id} row={row} onPress={() => router.push(counterHref(row.id))} />
        ))}
      </ScrollView>
    </Screen>
  );
}

function HistoryCard({ row, onPress }: { row: CounterSummary; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.title}
      onPress={onPress}
      style={{
        padding: 14,
        borderRadius: 16,
        backgroundColor: THEME.surface,
        borderWidth: 1,
        borderColor: THEME.border,
        ...themeShadow('card'),
      }}>
      <AppText style={{ fontSize: 16, fontWeight: '800', color: THEME.textPrimary }}>{row.title}</AppText>
      <AppText style={{ marginTop: 2, fontSize: 12, color: THEME.textMuted }}>
        {formatCounterDate(row.counterDate)}
      </AppText>
      {row.line ? <AppText style={{ marginTop: 6, fontSize: 13, color: THEME.textPrimary }}>{row.line}</AppText> : null}
    </Pressable>
  );
}
