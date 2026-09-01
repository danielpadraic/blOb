import { useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useLoggableChallenges } from '@/hooks/useLoggableChallenge';
import { copy } from '@/lib/copy';
import {
  mergeMultiCheckinRows,
  nextEmptyCheckinId,
  parseDoneIds,
  rememberMultiCheckinSnapshot,
  type MultiCheckinRow,
  type MultiCheckinState,
} from '@/lib/multiCheckin';
import { checkinSubmitHref, TABS_HREF } from '@/lib/routes';
import { tabBarLift, THEME, themeShadow } from '@/lib/theme';

const STATE_COPY: Record<MultiCheckinState, string> = {
  empty: copy('checkin.multiEmpty'),
  started: copy('checkin.multiStarted'),
  complete: copy('checkin.multiComplete'),
};

export default function MultiCheckinScreen() {
  const params = useLocalSearchParams<{ done?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const loggable = useLoggableChallenges();
  const doneIds = parseDoneIds(params.done);

  useFocusEffect(
    useCallback(() => {
      void loggable.refetch();
    }, [loggable.refetch]),
  );

  for (const item of loggable.data ?? []) {
    rememberMultiCheckinSnapshot({
      id: item.id,
      title: item.title,
      task: String(item.taskLabel ?? item.task ?? '').trim(),
      remainingProofLabels: item.remainingProofLabels ?? [],
    });
  }
  const rows = useMemo(
    () => mergeMultiCheckinRows(loggable.data ?? [], doneIds),
    [loggable.data, doneIds],
  );
  const nextId = nextEmptyCheckinId(rows, doneIds[doneIds.length - 1] ?? null);

  function openSubmit(id: string) {
    router.push(checkinSubmitHref(id, { from: 'multi', done: doneIds }));
  }

  return (
    <Screen scroll padded edges={TAB_ROOT_EDGES} contentPaddingBottom={tabBarLift(insets.bottom) + 88}>
      <AppText className="mb-3 text-[22px] font-extrabold text-charcoal">{copy('checkin.multiTitle')}</AppText>
      <View style={{ gap: 10 }}>
        {rows.map((row) => (
          <HubRow key={row.id} row={row} onPress={() => openSubmit(row.id)} />
        ))}
      </View>
      <View
        style={{
          marginTop: 20,
          flexDirection: 'row',
          gap: 10,
          paddingBottom: tabBarLift(insets.bottom, 'sticky'),
        }}>
        <View style={{ flex: 1 }}>
          <Button title={copy('checkin.multiDone')} variant="primary" onPress={() => router.replace(TABS_HREF)} />
        </View>
        {nextId ? (
          <View style={{ flex: 1 }}>
            <Button title={copy('checkin.multiNext')} variant="mint" onPress={() => openSubmit(nextId)} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function HubRow({ row, onPress }: { row: MultiCheckinRow; onPress: () => void }) {
  const complete = row.state === 'complete';
  const started = row.state === 'started';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.title}, ${STATE_COPY[row.state]}`}
      onPress={onPress}
      style={{
        backgroundColor: THEME.surface,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: THEME.border,
        paddingHorizontal: 16,
        paddingVertical: 14,
        minHeight: 72,
        opacity: complete ? 0.72 : 1,
        ...themeShadow(),
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText className="text-[16px] font-extrabold text-charcoal" numberOfLines={1}>
            {row.title}
          </AppText>
          {row.task ? (
            <AppText className="mt-0.5 text-[13px] text-muted" numberOfLines={1}>
              {row.task}
            </AppText>
          ) : null}
          {row.remainingProofLabels.length > 0 && !complete ? (
            <AppText className="mt-1 text-[12px] text-muted" numberOfLines={2}>
              {row.remainingProofLabels.join(' · ')}
            </AppText>
          ) : null}
        </View>
        <View
          style={{
            backgroundColor: started || complete ? THEME.accentSoft : THEME.surface2,
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}>
          <AppText
            className="text-[12px] font-bold"
            style={{ color: started || complete ? THEME.accent : THEME.textMuted }}>
            {STATE_COPY[row.state]}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}
