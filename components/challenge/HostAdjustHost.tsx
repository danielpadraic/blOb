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
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { StepperField } from '@/components/ui/Stepper';
import { AppText } from '@/components/ui/AppText';
import { HouseRemovePersonSheet } from '@/components/challenge/HouseRemovePersonSheet';
import { useAuth } from '@/hooks/useAuth';
import { useChallenge, useChallengeParticipants } from '@/hooks/useChallenge';
import { useOfficialOps } from '@/hooks/useOfficialOps';
import { useProfile } from '@/hooks/useProfile';
import { seedChallengeLivePost } from '@/hooks/useFeed';
import { copy } from '@/lib/copy';
import {
  challengeIsEndedForAdjust,
  challengeIsOfficialLocked,
  challengeTracksMissesForExcuse,
  challengeUsesConsistencyAdjustBoard,
  hostAdjustActorName,
  hostAdjustConfirmLine,
  hostAdjustErrorMessage,
  hostAdjustLiveBody,
  hostAdjustLivePostRow,
  hostAdjustSkipLines,
  parseHostAdjustBatchResult,
  parseHostAdjustDays,
  parseHostAdjustResult,
  participantCanBeAdjusted,
  planHostAdjustBulk,
  unionHostAdjustDays,
  viewerCanAdjustBoard,
  viewerCanHouseRemove,
  type HostAdjustAction,
  type HostAdjustBulkPerson,
  type HostAdjustDay,
  type HostAdjustResult,
} from '@/lib/hostAdjust';
import { fetchChallengeModeratorIds, proxyCheckinBlockedReason, viewerCanProxyCheckin } from '@/lib/challengeMods';
import { fetchCurrentPeriodCheckin } from '@/hooks/useChallengeCheckin';
import { checkinPeriodComplete } from '@/lib/loggable';
import { viewerCanEditBoardScore, viewerCanFriendlyHostAdd } from '@/lib/hostRigor';
import { checkinSubmitHref } from '@/lib/routes';
import { usesPointsBoard, usesQuantityScoring } from '@/lib/challengeExperience';
import { liveListKey } from '@/lib/feedListKeys';
import { liveComposeFromInline } from '@/lib/liveThread';
import { sessionAuthor } from '@/lib/safeIds';
import { fetchPublicProfilesByIds, personDisplayName } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import { THEME } from '@/lib/theme';
import type { ChallengeParticipantWithProfile, PostWithMeta, PublicProfile } from '@/lib/types';
import { firstRouteParam } from '@/lib/challengeLoad';
import { getErrorMessage } from '@/utils/errors';

type Target = { userId: string; displayName: string };

type HostAdjustContextValue = {
  canAdjust: boolean;
  canHouseRemove: boolean;
  canFriendlyRemove: boolean;
  canEditScore: boolean;
  canProxy: boolean;
  isActor: boolean;
  showExcuse: boolean;
  showBulkAdjust: boolean;
  bulkDisabled: boolean;
  moderatorIds: string[];
  openRowMenu: (target: Target, anchor: MenuAnchor) => void;
  openBulkAdjust: () => void;
};

const HostAdjustContext = createContext<HostAdjustContextValue>({
  canAdjust: false,
  canHouseRemove: false,
  canFriendlyRemove: false,
  canEditScore: false,
  canProxy: false,
  isActor: false,
  showExcuse: false,
  showBulkAdjust: false,
  bulkDisabled: true,
  moderatorIds: [],
  openRowMenu: () => {},
  openBulkAdjust: () => {},
});

export function useHostAdjustUi(): HostAdjustContextValue {
  return useContext(HostAdjustContext);
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
    queryKey: ['challenge-moderators', id],
    enabled: Boolean(id && user?.id),
    queryFn: () => fetchChallengeModeratorIds(id!),
  });
  const moderatorIds = mods.data ?? [];
  const isActor = Boolean(
    officialOps ||
      (user?.id &&
        challenge &&
        !challengeIsEndedForAdjust(challenge) &&
        (challenge.created_by === user.id || moderatorIds.includes(user.id))),
  );
  const canAdjust = viewerCanAdjustBoard(challenge, user?.id, moderatorIds, officialOps);
  const canHouseRemove = viewerCanHouseRemove(challenge, officialOps);
  const canFriendlyRemove = viewerCanFriendlyHostAdd({
    challenge,
    viewerId: user?.id,
    moderatorIds,
    officialOps: false,
  });
  const canEditScore =
    viewerCanEditBoardScore({
      challenge,
      viewerId: user?.id,
      moderatorIds,
      officialOps,
    }) &&
    Boolean(challenge && (usesPointsBoard(challenge) || usesQuantityScoring(challenge)));
  const canProxy = viewerCanProxyCheckin({
    challenge,
    viewerId: user?.id,
    moderatorIds,
    officialOps,
  });
  const showExcuse = challengeTracksMissesForExcuse(challenge);

  const [menu, setMenu] = useState<(Target & { anchor: MenuAnchor }) | null>(null);
  const [sheet, setSheet] = useState<{
    target: Target;
    action: HostAdjustAction;
    day?: HostAdjustDay;
  } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const showBulkAdjust = Boolean(
    challenge &&
      challengeUsesConsistencyAdjustBoard(challenge) &&
      (canAdjust ||
        (challengeIsEndedForAdjust(challenge) &&
          (officialOps ||
            (user?.id && (challenge.created_by === user.id || moderatorIds.includes(user.id)))))),
  );
  const bulkDisabled = !canAdjust;

  const openRowMenu = useCallback((target: Target, anchor: MenuAnchor) => {
    setMenu({ ...target, anchor });
  }, []);
  const openBulkAdjust = useCallback(() => {
    if (bulkDisabled) {
      return;
    }
    setBulkOpen(true);
  }, [bulkDisabled]);

  const value = useMemo(
    () => ({
      canAdjust,
      canHouseRemove,
      canFriendlyRemove,
      canEditScore,
      canProxy,
      isActor,
      showExcuse,
      showBulkAdjust,
      bulkDisabled,
      moderatorIds,
      openRowMenu,
      openBulkAdjust,
    }),
    [
      bulkDisabled,
      canAdjust,
      canEditScore,
      canFriendlyRemove,
      canHouseRemove,
      canProxy,
      isActor,
      moderatorIds,
      openBulkAdjust,
      openRowMenu,
      showBulkAdjust,
      showExcuse,
    ],
  );

  return (
    <HostAdjustContext.Provider value={value}>
      {children}
      {(canAdjust || canHouseRemove || canFriendlyRemove || canEditScore || canProxy || showBulkAdjust) &&
      id &&
      challenge ? (
        <HostAdjustSheets
          challengeId={id}
          menu={menu}
          sheet={sheet}
          bulkOpen={bulkOpen}
          showExcuse={showExcuse}
          canAdjust={canAdjust}
          canHouseRemove={canHouseRemove}
          canFriendlyRemove={canFriendlyRemove}
          canEditScore={canEditScore}
          canProxy={canProxy}
          moderatorIds={moderatorIds}
          officialOps={officialOps}
          houseDisabled={challengeIsEndedForAdjust(challenge)}
          onCloseMenu={() => setMenu(null)}
          onOpenSheet={(next) => {
            setMenu(null);
            setSheet(next);
          }}
          onCloseSheet={() => setSheet(null)}
          onCloseBulk={() => setBulkOpen(false)}
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

async function publishHostAdjustLive(input: {
  queryClient: ReturnType<typeof useQueryClient>;
  challengeId: string;
  userId: string;
  profile?: { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null;
  content: string;
  mediaUrls?: string[];
}) {
  const author = sessionAuthor(input.profile, input.userId);
  const payload = hostAdjustLivePostRow({
    authorId: input.userId,
    challengeId: input.challengeId,
    content: input.content,
    mediaUrls: input.mediaUrls,
  });
  const { data, error } = await supabase
    .from('posts')
    .insert(payload)
    .select('id, author_id, challenge_id, content, media_urls, created_at')
    .single();
  if (error) {
    console.warn('[blob:host-adjust] live note', error.message);
  }
  const row = (data ?? {
    id: `optimistic-adjust-${Date.now()}`,
    author_id: input.userId,
    challenge_id: input.challengeId,
    content: input.content,
    media_urls: input.mediaUrls ?? [],
    created_at: new Date().toISOString(),
  }) as PostWithMeta;
  seedChallengeLivePost(input.queryClient, input.challengeId, input.userId, {
    ...row,
    author: author ?? undefined,
    comments: [],
    reactions: [],
  });
  void input.queryClient.invalidateQueries({ queryKey: liveListKey(input.challengeId, input.userId) });
  void input.queryClient.invalidateQueries({ queryKey: ['feed', input.challengeId] });
}

function HostAdjustSheets({
  challengeId,
  menu,
  sheet,
  bulkOpen,
  showExcuse,
  canAdjust,
  canHouseRemove,
  canFriendlyRemove,
  canEditScore,
  canProxy,
  moderatorIds,
  officialOps,
  houseDisabled,
  onCloseMenu,
  onOpenSheet,
  onCloseSheet,
  onCloseBulk,
}: {
  challengeId: string;
  menu: (Target & { anchor: MenuAnchor }) | null;
  sheet: { target: Target; action: HostAdjustAction; day?: HostAdjustDay } | null;
  bulkOpen: boolean;
  showExcuse: boolean;
  canAdjust: boolean;
  canHouseRemove: boolean;
  canFriendlyRemove: boolean;
  canEditScore: boolean;
  canProxy: boolean;
  moderatorIds: string[];
  officialOps: boolean;
  houseDisabled: boolean;
  onCloseMenu: () => void;
  onOpenSheet: (next: { target: Target; action: HostAdjustAction; day?: HostAdjustDay }) => void;
  onCloseSheet: () => void;
  onCloseBulk: () => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const challengeQuery = useChallenge(challengeId);
  const roster = useChallengeParticipants(challengeId);
  const profileQuery = useProfile(user?.id);
  const actorName = hostAdjustActorName(profileQuery.data);
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
        actorName,
        caption: input.caption,
      });
      if (user?.id) {
        await publishHostAdjustLive({
          queryClient,
          challengeId,
          userId: user.id,
          profile: profileQuery.data,
          content,
          mediaUrls: input.mediaUrls,
        });
      }
      return result;
    },
    onSuccess: (result) => {
      patchParticipant(queryClient, challengeId, result);
      void queryClient.invalidateQueries({ queryKey: ['challenge-completions', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['period-misses', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['host-adjust-days', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['live', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['feed', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      onCloseSheet();
      router.setParams({ tab: 'feed' });
    },
  });

  const proxyTarget = menu
    ? (roster.data ?? []).find((row) => row.user_id === menu.userId)
    : null;
  const targetPeriod = useQuery({
    queryKey: ['challenge-checkin', challengeId, menu?.userId, 'proxy-gate'],
    enabled: Boolean(challengeId && menu?.userId && canProxy),
    queryFn: () => fetchCurrentPeriodCheckin(challengeId, menu!.userId, challengeQuery.data),
  });
  const proxyBlocked = menu
    ? proxyCheckinBlockedReason({
        challenge: challengeQuery.data,
        viewerId: user?.id,
        moderatorIds,
        officialOps,
        participantStatus: proxyTarget?.status,
        eliminatedAt: proxyTarget?.eliminated_at,
        periodComplete: checkinPeriodComplete(challengeQuery.data, {
          checkinPhase: targetPeriod.data?.status === 'submitted' ? 'submitted' : targetPeriod.data?.status,
        }),
      })
    : null;

  const actions: ChallengeOverflowAction[] = menu
    ? [
        ...(canProxy
          ? [
              {
                key: 'proxy-checkin',
                label: proxyBlocked ?? copy('board.checkInFor', 'gentle', { name: menu.displayName }),
                disabled: Boolean(proxyBlocked),
                onPress: () => {
                  if (proxyBlocked) {
                    return;
                  }
                  onCloseMenu();
                  router.push(checkinSubmitHref(challengeId, { for: menu.userId }) as never);
                },
              },
            ]
          : []),
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
      <HostAdjustBulkSheet
        visible={bulkOpen}
        challengeId={challengeId}
        showExcuse={showExcuse}
        actorName={actorName}
        actorProfile={profileQuery.data}
        userId={user?.id}
        onClose={onCloseBulk}
      />
    </>
  );
}

const SEARCH_PEOPLE_AT = 8;

function HostAdjustBulkSheet({
  visible,
  challengeId,
  showExcuse,
  actorName,
  actorProfile,
  userId,
  onClose,
}: {
  visible: boolean;
  challengeId: string;
  showExcuse: boolean;
  actorName: string;
  actorProfile?: { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null;
  userId?: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const roster = useChallengeParticipants(challengeId);
  const [action, setAction] = useState<HostAdjustAction>(showExcuse ? 'excuse_miss' : 'count_honor');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [count, setCount] = useState(1);
  const [pickedDays, setPickedDays] = useState<HostAdjustDay[]>([]);
  const [step, setStep] = useState<'form' | 'confirm' | 'note'>('form');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setAction(showExcuse ? 'excuse_miss' : 'count_honor');
      setSelectedIds([]);
      setSearch('');
      setCount(1);
      setPickedDays([]);
      setStep('form');
      setError(null);
    }
  }, [showExcuse, visible]);

  useEffect(() => {
    if (!showExcuse && action === 'excuse_miss') {
      setAction('count_honor');
    }
  }, [action, showExcuse]);

  const people = useMemo(() => {
    return (roster.data ?? []).filter((row) => participantCanBeAdjusted(row.status));
  }, [roster.data]);
  const idsKey = people.map((row) => row.user_id).join(',');
  const profiles = useQuery({
    queryKey: ['challenge-board-profiles', challengeId, idsKey],
    enabled: visible && people.length > 0,
    queryFn: () => fetchPublicProfilesByIds(people.map((row) => row.user_id)),
  });
  const profileById = useMemo(() => {
    const map = new Map<string, PublicProfile>();
    for (const profile of profiles.data ?? []) {
      if (profile?.id) {
        map.set(profile.id, profile);
      }
    }
    return map;
  }, [profiles.data]);

  const rosterPeople = useMemo(() => {
    return people.map((row) => {
      const profile = profileById.get(row.user_id) ?? row.profile ?? null;
      return {
        userId: row.user_id,
        displayName: personDisplayName(profile),
        profile,
      };
    });
  }, [people, profileById]);

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return rosterPeople;
    }
    return rosterPeople.filter((row) => {
      const handle = row.profile?.username?.trim().toLowerCase() ?? '';
      return row.displayName.toLowerCase().includes(q) || handle.includes(q.replace(/^@/, ''));
    });
  }, [rosterPeople, search]);

  const selectedPeople = rosterPeople.filter((row) => selectedIds.includes(row.userId));
  const daysQuery = useQuery({
    queryKey: ['host-adjust-days-bulk', challengeId, selectedIds.join(',')],
    enabled: visible && selectedIds.length > 0,
    queryFn: async () => {
      const rows = await Promise.all(
        selectedIds.map(async (id) => {
          const { data, error: daysError } = await supabase.rpc('host_adjust_board_days', {
            p_challenge_id: challengeId,
            p_user_id: id,
          });
          if (daysError) {
            throw new Error(hostAdjustErrorMessage(getErrorMessage(daysError)));
          }
          return [id, parseHostAdjustDays(data)] as const;
        }),
      );
      return Object.fromEntries(rows);
    },
  });

  const bulkPeople: HostAdjustBulkPerson[] = useMemo(
    () =>
      selectedPeople.map((row) => {
        const days = daysQuery.data?.[row.userId];
        return {
          userId: row.userId,
          displayName: days?.display_name || row.displayName,
          openMisses: days?.misses_used ?? 0,
          missed: days?.missed ?? [],
          counted: days?.counted ?? [],
        };
      }),
    [daysQuery.data, selectedPeople],
  );

  const plan = planHostAdjustBulk({
    action,
    people: bulkPeople,
    count,
    days: action === 'excuse_miss' ? [] : pickedDays,
  });
  const skipLines = hostAdjustSkipLines(action, plan.skip);
  const maxN = useMemo(() => {
    if (action === 'excuse_miss') {
      return Math.max(1, ...bulkPeople.map((row) => row.openMisses), 1);
    }
    const key = action === 'remove_counted' ? 'counted' : 'missed';
    return Math.max(1, ...bulkPeople.map((row) => row[key].length), 1);
  }, [action, bulkPeople]);
  const unionDays = action === 'remove_counted' ? unionHostAdjustDays(bulkPeople, 'counted') : unionHostAdjustDays(bulkPeople, 'missed');

  useEffect(() => {
    setCount((current) => Math.min(Math.max(current, 1), maxN));
  }, [maxN]);

  const mutate = useMutation({
    mutationFn: async (input: { caption?: string; mediaUrls?: string[] }) => {
      if (plan.apply.length === 0) {
        throw new Error(copy('board.bulkNone'));
      }
      const items = plan.apply.flatMap((row) =>
        row.days.map((day) => ({
          user_id: row.userId,
          period_start: day.period_start || new Date().toISOString(),
        })),
      );
      const { data, error: batchError } = await supabase.rpc('host_adjust_checkin_batch', {
        p_challenge_id: challengeId,
        p_action: action,
        p_items: items,
      });
      if (batchError) {
        throw new Error(hostAdjustErrorMessage(getErrorMessage(batchError)));
      }
      const results = parseHostAdjustBatchResult(data);
      const names = plan.apply.map((row) => row.displayName);
      const content = hostAdjustLiveBody({
        action,
        names,
        count: plan.applyCount,
        actorName,
        caption: input.caption,
      });
      if (userId) {
        await publishHostAdjustLive({
          queryClient,
          challengeId,
          userId,
          profile: actorProfile,
          content,
          mediaUrls: input.mediaUrls,
        });
      }
      return results;
    },
    onSuccess: (results) => {
      for (const result of results) {
        patchParticipant(queryClient, challengeId, result);
      }
      void queryClient.invalidateQueries({ queryKey: ['challenge-completions', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['period-misses', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['host-adjust-days', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['live', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      onClose();
      router.setParams({ tab: 'feed' });
    },
    onError: (err) => {
      setError(hostAdjustErrorMessage(getErrorMessage(err)));
    },
  });

  function togglePerson(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((row) => row !== id) : [...current, id]));
  }

  function toggleDay(day: HostAdjustDay) {
    const key = day.period_key || day.period_start;
    setPickedDays((current) => {
      const has = current.some((row) => (row.period_key || row.period_start) === key);
      return has
        ? current.filter((row) => (row.period_key || row.period_start) !== key)
        : [...current, day];
    });
  }

  const confirmNames = plan.apply.map((row) => row.displayName);
  const confirmLine = hostAdjustConfirmLine(action, plan.applyCount, confirmNames);
  const pending = mutate.isPending;

  return (
    <ChromeOverlay visible={visible} onClose={pending ? undefined : onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          className="px-5 pb-10 pt-6"
          style={{
            backgroundColor: THEME.background,
            borderTopLeftRadius: THEME.radiusLg,
            borderTopRightRadius: THEME.radiusLg,
            maxHeight: step === 'note' ? 640 : 620,
          }}
          onPress={(event) => event.stopPropagation()}>
          <AppText className="text-2xl font-bold text-charcoal">{copy('board.adjustSeveral')}</AppText>
          {error ? <AppText className="mt-3 text-sm text-coral-dark">{error}</AppText> : null}
          {step === 'note' ? (
            <>
              <AppText className="mt-2 text-muted">{confirmLine}</AppText>
              <View className="mt-4">
                <InlineComposer
                  pinned
                  allowEmpty
                  placeholder={copy('board.adjustNotePlaceholder')}
                  submitLabel={copy('live.send')}
                  submitting={pending}
                  failTitle="Couldn’t update the Board."
                  draftKey={`host-adjust-bulk:${challengeId}:${action}`}
                  onSubmit={async (content) => {
                    const split = liveComposeFromInline(content);
                    await mutate.mutateAsync({ caption: split.text, mediaUrls: split.mediaUrls });
                  }}
                />
              </View>
              <View className="mt-3">
                <Button
                  title={copy('board.adjustSkipSend')}
                  variant="ghost"
                  disabled={pending}
                  onPress={() => {
                    mutate.mutate({ caption: '', mediaUrls: [] });
                  }}
                />
              </View>
            </>
          ) : step === 'confirm' ? (
            <>
              <AppText className="mt-2 text-muted">{confirmLine}</AppText>
              {skipLines.map((line) => (
                <AppText key={line} className="mt-2 text-sm text-muted">
                  {line}
                </AppText>
              ))}
              {plan.apply.length === 0 ? (
                <AppText className="mt-3 text-sm text-coral-dark">{copy('board.bulkNone')}</AppText>
              ) : null}
              <View className="mt-6 gap-3">
                <Button
                  title={
                    action === 'excuse_miss'
                      ? copy('board.excuseMisses')
                      : action === 'remove_counted'
                        ? copy('board.removeCountedDays')
                        : copy('board.countDays')
                  }
                  size="lg"
                  disabled={plan.apply.length === 0}
                  onPress={() => setStep('note')}
                />
                <Button title={copy('board.adjustCancel')} variant="ghost" onPress={() => setStep('form')} />
              </View>
            </>
          ) : (
            <>
              <View className="mt-4 flex-row flex-wrap" style={{ gap: 8 }}>
                {(showExcuse
                  ? (['excuse_miss', 'count_honor', 'remove_counted'] as HostAdjustAction[])
                  : (['count_honor', 'remove_counted'] as HostAdjustAction[])
                ).map((key) => {
                  const selected = action === key;
                  const label =
                    key === 'excuse_miss'
                      ? copy('board.excuseMisses')
                      : key === 'remove_counted'
                        ? copy('board.removeCountedDays')
                        : copy('board.countDays');
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setAction(key);
                        setPickedDays([]);
                        setCount(1);
                      }}
                      style={{
                        minHeight: 36,
                        borderRadius: 999,
                        paddingHorizontal: 14,
                        justifyContent: 'center',
                        backgroundColor: selected ? THEME.accentSoft : THEME.surface,
                        borderWidth: 1,
                        borderColor: selected ? THEME.accent : THEME.border,
                      }}>
                      <AppText
                        className="text-[13px] font-bold"
                        style={{ color: selected ? THEME.accent : THEME.textPrimary }}>
                        {label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <AppText className="mt-5 text-sm font-semibold text-charcoal">{copy('board.pickPeople')}</AppText>
              {rosterPeople.length >= SEARCH_PEOPLE_AT ? (
                <View className="mt-2">
                  <Input
                    label={copy('board.searchPeople')}
                    value={search}
                    onChangeText={setSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              ) : null}
              {selectedPeople.length > 0 ? (
                <View className="mt-2 flex-row flex-wrap" style={{ gap: 8 }}>
                  {selectedPeople.map((row) => (
                    <Pressable
                      key={row.userId}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${row.displayName}`}
                      onPress={() => togglePerson(row.userId)}
                      style={{
                        minHeight: 32,
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        justifyContent: 'center',
                        backgroundColor: THEME.accentSoft,
                      }}>
                      <AppText className="text-[13px] font-bold" style={{ color: THEME.accent }}>
                        {row.displayName} ×
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <ScrollView style={{ marginTop: 8, maxHeight: 160 }}>
                {filteredPeople.map((row) => {
                  const on = selectedIds.includes(row.userId);
                  return (
                    <Pressable
                      key={row.userId}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => togglePerson(row.userId)}
                      className="flex-row items-center"
                      style={{ minHeight: 44, gap: 10 }}>
                      <Avatar uri={row.profile?.avatar_url} name={row.displayName} size={28} />
                      <AppText
                        className="text-[16px] font-semibold"
                        style={{ color: on ? THEME.accent : THEME.textPrimary }}>
                        {row.displayName}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {selectedIds.length > 0 ? (
                <>
                  <View className="mt-4">
                    <StepperField
                      label={
                        action === 'excuse_miss'
                          ? copy('board.excuseNMisses', 'gentle', { n: count })
                          : action === 'remove_counted'
                            ? copy('board.removeNCountedDays', 'gentle', { n: count })
                            : copy('board.countNMissedDays', 'gentle', { n: count })
                      }
                      value={count}
                      min={1}
                      max={maxN}
                      onChange={(next) => {
                        setCount(next);
                        setPickedDays([]);
                      }}
                    />
                  </View>
                  {action !== 'excuse_miss' && unionDays.length > 0 ? (
                    <>
                      <AppText className="mt-4 text-sm font-semibold text-charcoal">
                        {copy('board.orPickDays')}
                      </AppText>
                      <ScrollView style={{ marginTop: 4, maxHeight: 120 }}>
                        {unionDays.map((day) => {
                          const key = day.period_key || day.period_start;
                          const on = pickedDays.some((row) => (row.period_key || row.period_start) === key);
                          return (
                            <Pressable
                              key={key}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              onPress={() => toggleDay(day)}
                              style={{ minHeight: 40, justifyContent: 'center' }}>
                              <AppText
                                className="text-[16px] font-semibold"
                                style={{ color: on ? THEME.accent : THEME.textPrimary }}>
                                Day {day.day_n}
                                {on ? ' · Selected' : ''}
                              </AppText>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </>
                  ) : null}
                </>
              ) : null}
              {daysQuery.error ? (
                <AppText className="mt-3 text-sm text-coral-dark">
                  {hostAdjustErrorMessage(getErrorMessage(daysQuery.error))}
                </AppText>
              ) : null}
              <View className="mt-5 gap-2">
                <Button
                  title={copy('board.adjustSeveral')}
                  size="lg"
                  disabled={selectedIds.length === 0 || daysQuery.isFetching}
                  onPress={() => {
                    setError(null);
                    setStep('confirm');
                  }}
                />
                <Button title={copy('board.adjustCancel')} variant="ghost" onPress={onClose} />
              </View>
            </>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </ChromeOverlay>
  );
}

function setDayOnSheet(
  open: (next: { target: Target; action: HostAdjustAction; day?: HostAdjustDay }) => void,
  sheet: { target: Target; action: HostAdjustAction; day?: HostAdjustDay },
  day: HostAdjustDay,
) {
  open({ ...sheet, day });
}

export function BoardBulkAdjustButton() {
  const { showBulkAdjust, bulkDisabled, openBulkAdjust } = useHostAdjustUi();
  if (!showBulkAdjust) {
    return null;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy('board.adjustSeveral')}
      accessibilityState={{ disabled: bulkDisabled }}
      disabled={bulkDisabled}
      onPress={openBulkAdjust}
      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
      <AppText
        className="text-[13px] font-bold"
        style={{ color: bulkDisabled ? THEME.textMuted : THEME.accent }}>
        {copy('board.adjustSeveral')}
      </AppText>
    </Pressable>
  );
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
  const { canAdjust, canHouseRemove, canFriendlyRemove, canEditScore, canProxy, openRowMenu } =
    useHostAdjustUi();
  if (
    (!canAdjust && !canHouseRemove && !canFriendlyRemove && !canEditScore && !canProxy) ||
    !participantCanBeAdjusted(status)
  ) {
    return null;
  }
  return (
    <ChallengeOverflowButton
      accessibilityLabel="Adjust board"
      onPress={(anchor) => openRowMenu({ userId, displayName }, anchor)}
    />
  );
}
