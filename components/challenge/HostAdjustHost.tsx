import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  ChallengeMenuPopover,
  ChallengeOverflowButton,
  type ChallengeOverflowAction,
  type MenuAnchor,
} from '@/components/challenge/ChallengeOverflowMenu';
import { InlineComposer } from '@/components/feed/InlineComposer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { HouseRemovePersonSheet } from '@/components/challenge/HouseRemovePersonSheet';
import { useAuth } from '@/hooks/useAuth';
import { useChallenge } from '@/hooks/useChallenge';
import { useOfficialOps } from '@/hooks/useOfficialOps';
import { copy } from '@/lib/copy';
import {
  challengeIsEndedForAdjust,
  challengeIsOfficialLocked,
  challengeTracksMissesForExcuse,
  hostAdjustErrorMessage,
  hostAdjustLiveBody,
  hostAdjustLivePostRow,
  parseHostAdjustDays,
  parseHostAdjustResult,
  participantCanBeAdjusted,
  viewerCanAdjustBoard,
  viewerCanHouseRemove,
  type HostAdjustAction,
  type HostAdjustDay,
  type HostAdjustResult,
} from '@/lib/hostAdjust';
import { viewerCanEditBoardScore, viewerCanFriendlyHostAdd } from '@/lib/hostRigor';
import { usesPointsBoard, usesQuantityScoring } from '@/lib/challengeExperience';
import { liveComposeFromInline } from '@/lib/liveThread';
import { supabase } from '@/lib/supabase';
import { THEME } from '@/lib/theme';
import type { ChallengeParticipantWithProfile } from '@/lib/types';
import { firstRouteParam } from '@/lib/challengeLoad';
import { getErrorMessage } from '@/utils/errors';

type Target = { userId: string; displayName: string };

type HostAdjustContextValue = {
  canAdjust: boolean;
  canHouseRemove: boolean;
  canFriendlyRemove: boolean;
  canEditScore: boolean;
  isActor: boolean;
  showExcuse: boolean;
  openRowMenu: (target: Target, anchor: MenuAnchor) => void;
};

const HostAdjustContext = createContext<HostAdjustContextValue>({
  canAdjust: false,
  canHouseRemove: false,
  canFriendlyRemove: false,
  canEditScore: false,
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
  const officialOps = useOfficialOps().data === true;
  const challengeQuery = useChallenge(id);
  const challenge = challengeQuery.data ?? null;
  const mods = useQuery({
    queryKey: ['challenge-moderators', id, user?.id],
    enabled: Boolean(id && user?.id && challenge?.created_by !== user?.id && !officialOps),
    queryFn: () => fetchModeratorIds(id!, user!.id),
  });
  const isActor = Boolean(
    officialOps ||
      (user?.id &&
        challenge &&
        !challengeIsOfficialLocked(challenge) &&
        !challengeIsEndedForAdjust(challenge) &&
        (challenge.created_by === user.id || Boolean(mods.data?.includes(user.id)))),
  );
  const canAdjust = viewerCanAdjustBoard(challenge, user?.id, mods.data, officialOps);
  const canHouseRemove = viewerCanHouseRemove(challenge, officialOps);
  const canFriendlyRemove = viewerCanFriendlyHostAdd({
    challenge,
    viewerId: user?.id,
    officialOps: false,
  });
  const canEditScore =
    viewerCanEditBoardScore({
      challenge,
      viewerId: user?.id,
      officialOps,
    }) &&
    Boolean(challenge && (usesPointsBoard(challenge) || usesQuantityScoring(challenge)));
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
    () => ({
      canAdjust,
      canHouseRemove,
      canFriendlyRemove,
      canEditScore,
      isActor,
      showExcuse,
      openRowMenu,
    }),
    [canAdjust, canEditScore, canFriendlyRemove, canHouseRemove, isActor, openRowMenu, showExcuse],
  );

  return (
    <HostAdjustContext.Provider value={value}>
      {children}
      {(canAdjust || canHouseRemove || canFriendlyRemove || canEditScore) && id && challenge ? (
        <HostAdjustSheets
          challengeId={id}
          menu={menu}
          sheet={sheet}
          showExcuse={showExcuse}
          canAdjust={canAdjust}
          canHouseRemove={canHouseRemove}
          canFriendlyRemove={canFriendlyRemove}
          canEditScore={canEditScore}
          houseDisabled={challengeIsEndedForAdjust(challenge)}
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

function adjustSheetTitle(sheet: { action: HostAdjustAction; day?: HostAdjustDay; target: Target } | null): string {
  const name = sheet?.target.displayName ?? 'Someone';
  const n = sheet?.day?.day_n ?? '';
  if (sheet?.action === 'excuse_miss') {
    return copy('board.excuseMissTitle', 'gentle', { name });
  }
  if (sheet?.action === 'remove_counted') {
    return copy('board.removeDayTitle', 'gentle', { n, name });
  }
  return copy('board.countDayTitle', 'gentle', { n, name });
}

function HostAdjustSheets({
  challengeId,
  menu,
  sheet,
  showExcuse,
  canAdjust,
  canHouseRemove,
  canFriendlyRemove,
  canEditScore,
  houseDisabled,
  onCloseMenu,
  onOpenSheet,
  onCloseSheet,
}: {
  challengeId: string;
  menu: (Target & { anchor: MenuAnchor }) | null;
  sheet: { target: Target; action: HostAdjustAction; day?: HostAdjustDay } | null;
  showExcuse: boolean;
  canAdjust: boolean;
  canHouseRemove: boolean;
  canFriendlyRemove: boolean;
  canEditScore: boolean;
  houseDisabled: boolean;
  onCloseMenu: () => void;
  onOpenSheet: (next: { target: Target; action: HostAdjustAction; day?: HostAdjustDay }) => void;
  onCloseSheet: () => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const [noteStep, setNoteStep] = useState(false);
  const [houseRemove, setHouseRemove] = useState<Target | null>(null);
  const [scoreTarget, setScoreTarget] = useState<Target | null>(null);
  const [scoreValue, setScoreValue] = useState('');
  const [scoreError, setScoreError] = useState<string | null>(null);

  useEffect(() => {
    if (!sheet) {
      setNoteStep(false);
    }
  }, [sheet]);

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
    mutationFn: async (input: {
      target: Target;
      action: HostAdjustAction;
      day?: HostAdjustDay;
      caption?: string;
      mediaUrls?: string[];
    }) => {
      const { data, error } = await supabase.rpc('host_adjust_checkin', {
        p_challenge_id: challengeId,
        p_user_id: input.target.userId,
        p_action: input.action,
        p_period_start: input.day?.period_start || new Date().toISOString(),
      });
      if (error) {
        throw new Error(hostAdjustErrorMessage(getErrorMessage(error)));
      }
      const result = parseHostAdjustResult(data);
      const displayName = result.display_name || input.target.displayName;
      const content = hostAdjustLiveBody({
        action: input.action,
        displayName,
        dayN: result.day_n ?? input.day?.day_n ?? null,
        caption: input.caption,
      });
      if (user?.id) {
        const { error: postError } = await supabase.from('posts').insert(
          hostAdjustLivePostRow({
            authorId: user.id,
            challengeId,
            content,
            mediaUrls: input.mediaUrls,
          }),
        );
        if (postError) {
          console.warn('[blob:host-adjust] live note', postError.message);
        }
      }
      return result;
    },
    onSuccess: (result) => {
      patchParticipant(queryClient, challengeId, result);
      void queryClient.invalidateQueries({ queryKey: ['challenge-completions', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['period-misses', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['host-adjust-days', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['feed', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      onCloseSheet();
      router.setParams({ tab: 'feed' });
    },
  });

  const actions: ChallengeOverflowAction[] = menu
    ? [
        ...(canAdjust
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
          : []),
        ...(canEditScore
          ? [
              {
                key: 'edit-score',
                label: copy('board.editScore'),
                onPress: () => {
                  setScoreError(null);
                  setScoreValue('');
                  setScoreTarget({ userId: menu.userId, displayName: menu.displayName });
                },
              },
            ]
          : []),
        ...(canHouseRemove
          ? [
              {
                key: 'house-remove',
                section: copy('house.section'),
                label: copy('house.remove'),
                disabled: houseDisabled,
                danger: true,
                onPress: () => {
                  setHouseRemove({ userId: menu.userId, displayName: menu.displayName });
                },
              },
            ]
          : canFriendlyRemove
            ? [
                {
                  key: 'host-remove',
                  label: copy('board.removePerson'),
                  danger: true,
                  onPress: () => {
                    void (async () => {
                      const { error } = await supabase.rpc('host_remove_participant', {
                        p_challenge_id: challengeId,
                        p_user_id: menu.userId,
                      });
                      if (error) {
                        console.warn('[blob:host-remove]', error.message);
                        return;
                      }
                      void queryClient.invalidateQueries({ queryKey: ['challenge-participants', challengeId] });
                      void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
                      onCloseMenu();
                    })();
                  },
                },
              ]
            : []),
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
      <HouseRemovePersonSheet
        visible={Boolean(houseRemove)}
        challengeId={challengeId}
        userId={houseRemove?.userId ?? ''}
        displayName={houseRemove?.displayName ?? 'Someone'}
        disabled={houseDisabled}
        onClose={() => setHouseRemove(null)}
      />
      <ChromeOverlay visible={Boolean(scoreTarget)} onClose={() => setScoreTarget(null)}>
        <Pressable
          className="px-5 pb-8 pt-5"
          style={{
            backgroundColor: THEME.background,
            borderTopLeftRadius: THEME.radiusLg,
            borderTopRightRadius: THEME.radiusLg,
          }}
          onPress={(event) => event.stopPropagation()}>
          <AppText className="text-2xl font-bold text-charcoal">{copy('board.editScore')}</AppText>
          {scoreError ? (
            <AppText className="mt-3 text-sm text-coral-dark">{scoreError}</AppText>
          ) : null}
          <View className="mt-4">
            <Input
              label="Score"
              keyboardType="decimal-pad"
              value={scoreValue}
              onChangeText={setScoreValue}
            />
          </View>
          <View className="mt-4 gap-2">
            <Button
              title={copy('board.editScore')}
              size="lg"
              onPress={() => {
                const next = Number(scoreValue);
                if (!scoreTarget || !Number.isFinite(next) || next < 0) {
                  setScoreError('Enter a number.');
                  return;
                }
                void (async () => {
                  const { error } = await supabase.rpc('host_adjust_score', {
                    p_challenge_id: challengeId,
                    p_user_id: scoreTarget.userId,
                    p_kind: 'points',
                    p_value: next,
                  });
                  if (error) {
                    setScoreError(hostAdjustErrorMessage(getErrorMessage(error)));
                    return;
                  }
                  void queryClient.invalidateQueries({ queryKey: ['challenge-participants', challengeId] });
                  setScoreTarget(null);
                })();
              }}
            />
            <Button title={copy('board.adjustCancel')} variant="ghost" onPress={() => setScoreTarget(null)} />
          </View>
        </Pressable>
      </ChromeOverlay>
      <ChromeOverlay visible={Boolean(sheet)} onClose={mutate.isPending ? undefined : onCloseSheet}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          className="px-5 pb-10 pt-6"
          style={{
            backgroundColor: THEME.background,
            borderTopLeftRadius: THEME.radiusLg,
            borderTopRightRadius: THEME.radiusLg,
            maxHeight: noteStep ? 640 : 520,
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
                <AppText className="mt-3 text-sm text-coral-dark">
                  {hostAdjustErrorMessage(getErrorMessage(days.error))}
                </AppText>
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
          ) : noteStep && sheet ? (
            <>
              <AppText className="text-2xl font-bold text-charcoal">{adjustSheetTitle(sheet)}</AppText>
              {mutate.error ? (
                <AppText className="mt-3 text-sm text-coral-dark">
                  {hostAdjustErrorMessage(getErrorMessage(mutate.error))}
                </AppText>
              ) : null}
              <View className="mt-4">
                <InlineComposer
                  pinned
                  allowEmpty
                  placeholder={copy('board.adjustNotePlaceholder')}
                  submitLabel={copy('live.send')}
                  submitting={mutate.isPending}
                  failTitle="Couldn’t update the Board."
                  draftKey={`host-adjust:${challengeId}:${sheet.target.userId}:${sheet.action}`}
                  onSubmit={async (content) => {
                    const split = liveComposeFromInline(content);
                    await mutate.mutateAsync({
                      ...sheet,
                      caption: split.text,
                      mediaUrls: split.mediaUrls,
                    });
                  }}
                />
              </View>
              <View className="mt-3">
                <Button
                  title={copy('board.adjustSkipSend')}
                  variant="ghost"
                  disabled={mutate.isPending}
                  onPress={() => {
                    mutate.mutate({ ...sheet, caption: '', mediaUrls: [] });
                  }}
                />
              </View>
            </>
          ) : (
            <>
              <AppText className="text-2xl font-bold text-charcoal">{adjustSheetTitle(sheet)}</AppText>
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
                  onPress={() => setNoteStep(true)}
                />
                <Button
                  title={copy('board.adjustCancel')}
                  variant="ghost"
                  onPress={onCloseSheet}
                />
              </View>
            </>
          )}
        </Pressable>
        </KeyboardAvoidingView>
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
  const { canAdjust, canHouseRemove, canFriendlyRemove, canEditScore, openRowMenu } = useHostAdjustUi();
  if ((!canAdjust && !canHouseRemove && !canFriendlyRemove && !canEditScore) || !participantCanBeAdjusted(status)) {
    return null;
  }
  return (
    <ChallengeOverflowButton
      accessibilityLabel="Adjust board"
      onPress={(anchor) => openRowMenu({ userId, displayName }, anchor)}
    />
  );
}
