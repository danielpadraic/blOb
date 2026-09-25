import { useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
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
import { pushCheckinPickerRow } from '@/lib/challengeNav';
import { useOfficialCoinStatus } from '@/hooks/useOfficialCoin';
import {
  isOfficialCoinChallenge,
  OFFICIAL_COIN_ALREADY_TODAY,
  OFFICIAL_COIN_CHECKIN_LABEL,
  OFFICIAL_COIN_SPONSOR_LINE,
} from '@/lib/officialCoin';
import { challengeDetailHref, LOBBY_HREF, TABS_HREF } from '@/lib/routes';
import { tabBarLift, THEME, themeShadow } from '@/lib/theme';

const STATE_COPY: Record<MultiCheckinState, string> = {
  not_started: copy('checkin.multiEmpty'),
  in_progress: copy('checkin.multiStarted'),
  complete: copy('checkin.multiComplete'),
};

const CHIP: Record<MultiCheckinState, { bg: string; fg: string }> = {
  not_started: { bg: 'rgba(154, 59, 59, 0.14)', fg: THEME.danger },
  in_progress: { bg: THEME.calloutSoft, fg: '#6B4E12' },
  complete: { bg: THEME.accentSoft, fg: THEME.accent },
};

export default function MultiCheckinScreen() {
  const params = useLocalSearchParams<{ done?: string; notice?: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const loggable = useLoggableChallenges();
  const officialCoin = useOfficialCoinStatus();
  const doneIds = parseDoneIds(params.done);
  // Extras never block Send: a failed extra lands as a line, not an error screen.
  const notice = String((Array.isArray(params.notice) ? params.notice[0] : params.notice) ?? '').trim();

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
  // One Official Check-In fills both house rooms, so the picker shows one row
  // for the pair instead of a Weekly and a Monthly that do the same thing.
  const coinStatus = officialCoin.status;
  const coinWeeklyId = coinStatus.weekly?.challenge.id ?? '';
  const otherLoggable = useMemo(
    () => (loggable.data ?? []).filter((row) => !isOfficialCoinChallenge(row)),
    [loggable.data],
  );
  const coinRow = useMemo(
    () => (loggable.data ?? []).find((row) => row.id === coinWeeklyId) ?? null,
    [coinWeeklyId, loggable.data],
  );
  const coinDone = coinStatus.checkedInToday || doneIds.includes(coinWeeklyId);
  const showCoinRow = Boolean(coinStatus.joined && coinWeeklyId);

  const rows = useMemo(
    () => mergeMultiCheckinRows(otherLoggable, doneIds.filter((id) => id !== coinWeeklyId)),
    [coinWeeklyId, doneIds, otherLoggable],
  );
  const nextId = nextEmptyCheckinId(rows, doneIds[doneIds.length - 1] ?? null);

  function openSubmit(id: string) {
    const picked = (loggable.data ?? []).find((row) => row.id === id) ?? { id };
    pushCheckinPickerRow(router, picked, 'checkin-pick', { from: 'multi', done: doneIds }, pathname);
  }

  function openOfficialCoin() {
    if (!coinWeeklyId) {
      return;
    }
    if (coinDone) {
      router.push(
        challengeDetailHref(coinWeeklyId, 'lobby', null, {
          tab: 'overview',
          notice: OFFICIAL_COIN_ALREADY_TODAY,
        }),
      );
      return;
    }
    openSubmit(coinWeeklyId);
  }

  return (
    <Screen scroll padded edges={TAB_ROOT_EDGES} contentPaddingBottom={tabBarLift(insets.bottom) + 88}>
      <AppText className="mb-3 text-[22px] font-extrabold text-charcoal">{copy('checkin.multiTitle')}</AppText>
      {notice ? (
        <View
          style={{
            marginBottom: 12,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: THEME.border,
            backgroundColor: THEME.surface,
          }}>
          <AppText className="text-[13px] leading-5" style={{ color: THEME.textMuted }}>
            {notice}
          </AppText>
        </View>
      ) : null}
      {showCoinRow ? (
        <View style={{ marginBottom: 10 }}>
          <OfficialCheckinRow
            done={coinDone}
            remainingProofLabels={coinRow?.remainingProofLabels ?? []}
            onPress={openOfficialCoin}
          />
        </View>
      ) : null}
      {rows.length === 0 && !showCoinRow && !loggable.isLoading ? (
        /* + Check In with nothing loggable explains itself instead of closing the menu. */
        <View
          style={{
            gap: 10,
            padding: 16,
            borderRadius: THEME.radius,
            borderWidth: 1,
            borderColor: THEME.border,
            backgroundColor: THEME.surface,
            ...themeShadow(),
          }}>
          <AppText className="text-[16px] font-extrabold text-charcoal">
            {copy('checkin.noneTitle')}
          </AppText>
          <AppText className="text-[14px] leading-5" style={{ color: THEME.textMuted }}>
            {copy('checkin.noneBody')}
          </AppText>
          <Button
            title={copy('checkin.noneBrowse')}
            variant="primary"
            onPress={() => router.replace(LOBBY_HREF)}
          />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {rows.map((row) => (
            <HubRow key={row.id} row={row} onPress={() => openSubmit(row.id)} />
          ))}
        </View>
      )}
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

/**
 * House chrome. One row for the pair of Official Coin rooms, sponsored by blOb,
 * visibly different from a private or user-made challenge.
 */
function OfficialCheckinRow({
  done,
  remainingProofLabels,
  onPress,
}: {
  done: boolean;
  remainingProofLabels: string[];
  onPress: () => void;
}) {
  const state = done ? OFFICIAL_COIN_ALREADY_TODAY : copy('checkin.multiEmpty');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${OFFICIAL_COIN_CHECKIN_LABEL}, ${state}`}
      onPress={onPress}
      style={{
        backgroundColor: THEME.surface,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: THEME.accent,
        paddingHorizontal: 16,
        paddingVertical: 14,
        minHeight: 72,
        ...themeShadow(),
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText className="text-[16px] font-extrabold text-charcoal" numberOfLines={1}>
            {OFFICIAL_COIN_CHECKIN_LABEL}
          </AppText>
          <AppText className="mt-0.5 text-[13px]" style={{ color: THEME.accent }} numberOfLines={1}>
            {OFFICIAL_COIN_SPONSOR_LINE}
          </AppText>
          <AppText className="mt-1 text-[12px] text-muted" numberOfLines={2}>
            {done
              ? 'Weekly and Monthly are both stamped for today.'
              : remainingProofLabels.length > 0
                ? remainingProofLabels.join(' · ')
                : 'Fills the Weekly and Monthly rooms in one go.'}
          </AppText>
        </View>
        <View
          style={{
            backgroundColor: done ? THEME.accentSoft : THEME.calloutSoft,
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}>
          <AppText
            className="text-[12px] font-bold"
            style={{ color: done ? THEME.accent : '#6B4E12' }}>
            {done ? copy('checkin.multiComplete') : copy('checkin.multiEmpty')}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

function HubRow({ row, onPress }: { row: MultiCheckinRow; onPress: () => void }) {
  const complete = row.state === 'complete';
  const chip = CHIP[row.state];
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
            backgroundColor: chip.bg,
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}>
          <AppText className="text-[12px] font-bold" style={{ color: chip.fg }}>
            {STATE_COPY[row.state]}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}
