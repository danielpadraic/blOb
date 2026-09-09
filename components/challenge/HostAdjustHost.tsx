import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';

import {
  ChallengeMenuPopover,
  ChallengeOverflowButton,
  type ChallengeOverflowAction,
  type MenuAnchor,
} from '@/components/challenge/ChallengeOverflowMenu';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useChallenge } from '@/hooks/useChallenge';
import { copy } from '@/lib/copy';
import {
  challengeIsEndedForAdjust,
  challengeIsOfficialLocked,
  challengeTracksMissesForExcuse,
  hostAdjustErrorMessage,
  parseHostAdjustDays,
  parseHostAdjustResult,
  participantCanBeAdjusted,
  viewerCanAdjustBoard,
  type HostAdjustAction,
  type HostAdjustDay,
  type HostAdjustResult,
} from '@/lib/hostAdjust';
import { supabase } from '@/lib/supabase';
import { THEME } from '@/lib/theme';
import type { ChallengeParticipantWithProfile } from '@/lib/types';
import { firstRouteParam } from '@/lib/challengeLoad';
import { getErrorMessage } from '@/utils/errors';

type Target = { userId: string; displayName: string };

type HostAdjustContextValue = {
  canAdjust: boolean;
  isActor: boolean;
  showExcuse: boolean;
  openRowMenu: (target: Target, anchor: MenuAnchor) => void;
};

const HostAdjustContext = createContext<HostAdjustContextValue>({
  canAdjust: false,
  isActor: false,
  showExcuse: false,
  openRowMenu: () => {},
});

export function useHostAdjustUi(): HostAdjustContextValue {
  return useContext(HostAdjustContext);
}

async function fetchModeratorIds(challengeId: string, viewerId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('challenge_moderators')
    .select('user_id')
    .eq('challenge_id', challengeId)
    .eq('user_id', viewerId);
  if (error) {
    return [];
  }
  return (data ?? []).map((row) => String((row as { user_id: string }).user_id));
}

function patchParticipant(
  queryClient: ReturnType<typeof useQueryClient>,
  challengeId: string,
  result: HostAdjustResult,
) {
  queryClient.setQueriesData<ChallengeParticipantWithProfile[]>(
    { queryKey: ['challenge-participants', challengeId] },
    (current) =>
      (current ?? []).map((row) =>
        row.user_id === result.user_id
          ? {
              ...row,
              days_completed: result.days_completed,
              status: (result.status as ChallengeParticipantWithProfile['status']) || row.status,
              eliminated_at:
                result.status === 'eliminated'
                  ? row.eliminated_at ?? new Date().toISOString()
                  : result.status === 'joined' || result.status === 'active' || result.status === 'completed'
                    ? null
                    : row.eliminated_at,
            }
          : row,
      ),
  );
}

export function HostAdjustProvider({ children }: { children: ReactNode }) {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = firstRouteParam(params.id);
  const { user } = useAuth();
  const challengeQuery = useChallenge(id);
  const challenge = challengeQuery.data ?? null;
  const mods = useQuery({
    queryKey: ['challenge-moderators', id, user?.id],
    enabled: Boolean(id && user?.id && challenge?.created_by !== user?.id),
    queryFn: () => fetchModeratorIds(id!, user!.id),
  });
  const isActor = Boolean(
    user?.id &&
      challenge &&
      !challengeIsOfficialLocked(challenge) &&
      !challengeIsEndedForAdjust(challenge) &&
      (challenge.created_by === user.id || Boolean(mods.data?.includes(user.id))),
  );
  const canAdjust = viewerCanAdjustBoard(challenge, user?.id, mods.data);
  const showExcuse = challengeTracksMissesForExcuse(challenge);

  const [menu, setMenu] = useState<(Target & { anchor: MenuAnchor }) | null>(null);
  const [sheet, setSheet] = useState<{
    target: Target;
    action: HostAdjustAction;
    day?: HostAdjustDay;
  } | null>(null);

  const openRowMenu = useCallback((target: Target, anchor: MenuAnchor) => {
    setMenu({ ...target, anchor });
  }, []);

  const value = useMemo(
    () => ({ canAdjust, isActor, showExcuse, openRowMenu }),
    [canAdjust, isActor, openRowMenu, showExcuse],
  );

  return (
    <HostAdjustContext.Provider value={value}>
      {children}
      {canAdjust && id && challenge ? (
        <HostAdjustSheets
          challengeId={id}
          menu={menu}
          sheet={sheet}
          showExcuse={showExcuse}
          onCloseMenu={() => setMenu(null)}
          onOpenSheet={(next) => {
            setMenu(null);
            setSheet(next);
          }}
          onCloseSheet={() => setSheet(null)}
        />
      ) : null}
    </HostAdjustContext.Provider>
  );
}

function HostAdjustSheets({
  challengeId,
  menu,
  sheet,
  showExcuse,
  onCloseMenu,
  onOpenSheet,
  onCloseSheet,
}: {
  challengeId: string;
  menu: (Target & { anchor: MenuAnchor }) | null;
  sheet: { target: Target; action: HostAdjustAction; day?: HostAdjustDay } | null;
  showExcuse: boolean;
  onCloseMenu: () => void;
  onOpenSheet: (next: { target: Target; action: HostAdjustAction; day?: HostAdjustDay }) => void;
  onCloseSheet: () => void;
}) {
  const queryClient = useQueryClient();
  const days = useQuery({
    queryKey: ['host-adjust-days', challengeId, sheet?.target.userId ?? menu?.userId],
    enabled: Boolean(sheet || menu),
    queryFn: async () => {
      const userId = sheet?.target.userId ?? menu?.userId;
      if (!userId) {
        return parseHostAdjustDays({});
      }
      const { data, error } = await supabase.rpc('host_adjust_board_days', {
        p_challenge_id: challengeId,
        p_user_id: userId,
      });
      if (error) {
        throw new Error(hostAdjustErrorMessage(getErrorMessage(error)));
      }
      return parseHostAdjustDays(data);
    },
  });

  const mutate = useMutation({
    mutationFn: async (input: { target: Target; action: HostAdjustAction; day?: HostAdjustDay }) => {
      const { data, error } = await supabase.rpc('host_adjust_checkin', {
        p_challenge_id: challengeId,
        p_user_id: input.target.userId,
        p_action: input.action,
        p_period_start: input.day?.period_start || new Date().toISOString(),
      });
      if (error) {
        throw new Error(hostAdjustErrorMessage(getErrorMessage(error)));
      }
      return parseHostAdjustResult(data);
    },
    onSuccess: (result) => {
      patchParticipant(queryClient, challengeId, result);
      void queryClient.invalidateQueries({ queryKey: ['challenge-completions', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['period-misses', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['host-adjust-days', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['feed', challengeId] });
      onCloseSheet();
    },
  });

  const actions: ChallengeOverflowAction[] = menu
    ? [
        {
          key: 'count',
          label: copy('board.countMissedDay'),
          onPress: () => onOpenSheet({ target: menu, action: 'count_honor' }),
        },
        ...(showExcuse
          ? [
              {
                key: 'excuse',
                label: copy('board.excuseMiss'),
                onPress: () => onOpenSheet({ target: menu, action: 'excuse_miss' }),
              },
            ]
          : []),
        {
          key: 'remove',
          label: copy('board.removeCountedDay'),
          onPress: () => onOpenSheet({ target: menu, action: 'remove_counted' }),
        },
      ]
    : [];

  const picking =
    sheet && !sheet.day && (sheet.action === 'count_honor' || sheet.action === 'remove_counted');
  const list = sheet?.action === 'remove_counted' ? days.data?.counted ?? [] : days.data?.missed ?? [];
  const confirmDay = sheet?.day;
  const name = sheet?.target.displayName ?? 'Someone';

  return (
    <>
      <ChallengeMenuPopover
        anchor={menu?.anchor ?? null}
        onClose={onCloseMenu}
        actions={actions}
      />
      <ChromeOverlay visible={Boolean(sheet)} onClose={mutate.isPending ? undefined : onCloseSheet}>
        <Pressable
          className="px-5 pb-10 pt-6"
          style={{
            backgroundColor: THEME.background,
            borderTopLeftRadius: THEME.radiusLg,
            borderTopRightRadius: THEME.radiusLg,
            maxHeight: 520,
          }}
          onPress={(event) => event.stopPropagation()}>
          {picking ? (
            <>
              <AppText className="text-2xl font-bold text-charcoal">
                {sheet.action === 'remove_counted'
                  ? copy('board.removeCountedDay')
                  : copy('board.countMissedDay')}
              </AppText>
              <AppText className="mt-2 text-muted">
                {sheet.action === 'remove_counted'
                  ? copy('board.pickCountedDay')
                  : copy('board.pickMissedDay')}
              </AppText>
              {days.error ? (
                <AppText className="mt-3 text-sm text-coral-dark">{getErrorMessage(days.error)}</AppText>
              ) : null}
              <ScrollView style={{ marginTop: 12, maxHeight: 280 }}>
                {list.length === 0 && !days.isPending ? (
                  <AppText className="py-4 text-muted">
                    {sheet.action === 'remove_counted'
                      ? copy('board.noCountedDays')
                      : copy('board.noMissedDays')}
                  </AppText>
                ) : (
                  list.map((day) => (
                    <Pressable
                      key={`${day.period_key}-${day.day_n}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Day ${day.day_n}`}
                      onPress={() => {
                        if (!sheet) {
                          return;
                        }
                        setDayOnSheet(onOpenSheet, sheet, day);
                      }}
                      style={{ minHeight: 44, justifyContent: 'center' }}>
                      <AppText className="text-[16px] font-semibold text-charcoal">
                        Day {day.day_n}
                        {day.honor ? ' · Honor' : ''}
                      </AppText>
                    </Pressable>
                  ))
                )}
              </ScrollView>
              <View className="mt-4">
                <Button title={copy('board.adjustCancel')} variant="ghost" onPress={onCloseSheet} />
              </View>
            </>
          ) : (
            <>
              <AppText className="text-2xl font-bold text-charcoal">
                {sheet?.action === 'excuse_miss'
                  ? copy('board.excuseMiss')
                  : sheet?.action === 'remove_counted'
                    ? copy('board.removeCountedDay')
                    : copy('board.countMissedDay')}
              </AppText>
              <AppText className="mt-2 text-muted">
                {sheet?.action === 'excuse_miss'
                  ? copy('board.excuseMissConfirm', 'gentle', { name })
                  : sheet?.action === 'remove_counted'
                    ? copy('board.removeDayConfirm', 'gentle', {
                        n: confirmDay?.day_n ?? '',
                        name,
                      })
                    : copy('board.countDayConfirm', 'gentle', {
                        n: confirmDay?.day_n ?? '',
                        name,
                      })}
              </AppText>
              {mutate.error ? (
                <AppText className="mt-3 text-sm text-coral-dark">{getErrorMessage(mutate.error)}</AppText>
              ) : null}
              <View className="mt-6 gap-3">
                <Button
                  title={
                    sheet?.action === 'excuse_miss'
                      ? copy('board.excuseMiss')
                      : sheet?.action === 'remove_counted'
                        ? copy('board.removeCountedDay')
                        : copy('board.countDay')
                  }
                  size="lg"
                  loading={mutate.isPending}
                  onPress={() => {
                    if (!sheet) {
                      return;
                    }
                    mutate.mutate(sheet);
                  }}
                />
                <Button
                  title={copy('board.adjustCancel')}
                  variant="ghost"
                  disabled={mutate.isPending}
                  onPress={onCloseSheet}
                />
              </View>
            </>
          )}
        </Pressable>
      </ChromeOverlay>
    </>
  );
}

function setDayOnSheet(
  open: (next: { target: Target; action: HostAdjustAction; day?: HostAdjustDay }) => void,
  sheet: { target: Target; action: HostAdjustAction; day?: HostAdjustDay },
  day: HostAdjustDay,
) {
  open({ ...sheet, day });
}

export function BoardAdjustButton({
  userId,
  displayName,
  status,
}: {
  userId: string;
  displayName: string;
  status?: string | null;
}) {
  const { canAdjust, openRowMenu } = useHostAdjustUi();
  if (!canAdjust || !participantCanBeAdjusted(status)) {
    return null;
  }
  return (
    <ChallengeOverflowButton
      accessibilityLabel="Adjust board"
      onPress={(anchor) => openRowMenu({ userId, displayName }, anchor)}
    />
  );
}
