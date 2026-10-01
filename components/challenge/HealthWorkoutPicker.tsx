import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { copy } from '@/lib/copy';
import { healthHowToIosPath } from '@/lib/health/howTo';
import {
  healthAttachRulesFor,
  workoutAttachBlockReason,
  workoutAttachNote,
  type HealthAttachRules,
} from '@/lib/health/attachProof';
import { rankHealthWorkouts } from '@/lib/health/match';
import { HEALTH_PICKER_DAYS, healthPickerWindow } from '@/lib/health/period';
import { athleteDistanceUnit, formatDistance } from '@/lib/distance';
import { healthSourceLabel } from '@/lib/health/proofSummary';
import { fetchWorkoutPlacements, probeOnline, upsertHealthConnection } from '@/lib/health/remote';
import { formatHealthDuration } from '@/lib/health/proofSummary';
import { formatWorkoutWhen } from '@/lib/health/workoutWhen';
import { proofAlreadyCountsCopy, proofUniquenessFamily, sameTierWorkoutBlock, type WorkoutPlacement } from '@/lib/proofUniqueness';
import { THEME, themeShadow } from '@/lib/theme';
import type { ChallengeProof } from '@/lib/challengeProofs';
import { getHealthProvider, type HealthWorkout } from '@/services/health';
import { getErrorMessage } from '@/utils/errors';

/** Only the owner's own profile carries a birth date; a public profile row does not. */
function birthDateOf(profile: unknown): string | null {
  if (!profile || typeof profile !== 'object' || !('date_of_birth' in profile)) {
    return null;
  }
  const value = (profile as { date_of_birth?: unknown }).date_of_birth;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export type HealthWorkoutPickerChallenge = {
  title?: string | null;
  min_minutes?: number | null;
  frequency?: string | null;
  starts_at?: string | null;
  is_official?: boolean | null;
  series_id?: string | null;
  timezone?: string | null;
  days_required?: number | null;
  day_windows?: unknown;
};

type HealthWorkoutPickerProps = {
  challengeTitle: string;
  challenge?: HealthWorkoutPickerChallenge | null;
  proof?: ChallengeProof | null;
  minMinutes?: number | null;
  frequency?: string | null;
  startsAt?: string | null;
  isOfficial?: boolean | null;
  seriesId?: string | null;
  timezone?: string | null;
  daysRequired?: number | null;
  dayWindows?: unknown;
  userId?: string;
  attaching?: boolean;
  onAttach: (workout: HealthWorkout) => Promise<void>;
  /** Opens the camera. Explicit. Never the default for this sheet. */
  onAddPhoto: () => void;
  /** Screenshot from the gallery. */
  onOpenGallery?: () => void;
  onClose?: () => void;
  /** Parent already asked Health, outside any sheet. */
  authorized?: boolean;
  /** Asks again from the check-in screen, not from inside this sheet. */
  onAllowHealth?: () => void;
  /** Full-screen list. Keeps the title under the clock. */
  underStatusBar?: boolean;
};

function formatDuration(sec: number): string {
  return formatHealthDuration(sec) ?? '';
}

export function HealthWorkoutPicker({
  challengeTitle,
  challenge,
  proof,
  minMinutes,
  frequency,
  startsAt,
  isOfficial,
  seriesId,
  timezone,
  daysRequired,
  dayWindows,
  userId,
  attaching = false,
  onAttach,
  onAddPhoto,
  onOpenGallery,
  onClose,
  authorized = false,
  onAllowHealth,
  underStatusBar = false,
}: HealthWorkoutPickerProps) {
  const insets = useSafeAreaInsets();
  const [workouts, setWorkouts] = useState<HealthWorkout[]>([]);
  const [placements, setPlacements] = useState<Map<string, WorkoutPlacement[]>>(new Map());
  const [windowDays, setWindowDays] = useState(HEALTH_PICKER_DAYS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const attachLock = useRef(false);
  const navigation = useNavigation();

  useEffect(() => {
    if (!onClose) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  useEffect(() => {
    if (!onClose) {
      return;
    }
    const unsub = navigation.addListener('beforeRemove', (e) => {
      const type = String((e as { data?: { action?: { type?: string } } }).data?.action?.type ?? '');
      if (type !== 'GO_BACK' && type !== 'POP' && type !== 'POP_TO_TOP') {
        return;
      }
      e.preventDefault();
      onClose();
    });
    return unsub;
  }, [navigation, onClose]);

  useEffect(() => {
    if (!onClose || Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }
    const win = window;
    try {
      win.history.pushState({ blobCheckinCam: true }, '', win.location.href);
    } catch {
      return;
    }
    const onPop = () => {
      onClose();
      try {
        win.history.pushState({ blobCheckinCam: true }, '', win.location.href);
      } catch {
        // Stay on /submit review.
      }
    };
    win.addEventListener('popstate', onPop);
    return () => {
      win.removeEventListener('popstate', onPop);
    };
  }, [onClose]);

  // The intensity bar uses the same 80 bpm attach floor as /submit.
  const { user } = useAuth();
  const profile = useProfile(user?.id);
  const rules: HealthAttachRules = healthAttachRulesFor(
    proof,
    { min_minutes: challenge?.min_minutes ?? minMinutes },
    { birthDate: birthDateOf(profile.data) },
  );

  const load = useCallback(
    async (mode: 'open' | 'refresh') => {
      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const online = await probeOnline();
        setOffline(!online);
        const period = healthPickerWindow(windowDays);
        const provider = getHealthProvider();
        const [rows, usedWhere] = await Promise.all([
          provider?.fetchWorkouts(period) ?? Promise.resolve([]),
          userId ? fetchWorkoutPlacements(userId) : Promise.resolve(new Map<string, WorkoutPlacement[]>()),
        ]);
        setPlacements(usedWhere);
        setWorkouts(
          rankHealthWorkouts(rows, { period, minMinutes: rules.minMinutes, keepUsed: true }),
        );
        if (userId && online) {
          await upsertHealthConnection({
            userId,
            status: 'connected',
            lastSyncedAt: new Date().toISOString(),
          });
        }
      } catch (caught) {
        setError(getErrorMessage(caught));
        setWorkouts([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      challenge,
      dayWindows,
      daysRequired,
      frequency,
      isOfficial,
      rules.minMinutes,
      seriesId,
      startsAt,
      timezone,
      userId,
      windowDays,
    ],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    setNeedsInstall(false);
    setError(null);
    setAttachingId(null);
    if (Platform.OS === 'web' || !authorized) {
      setLoading(false);
      if (!authorized && Platform.OS === 'android') {
        const provider = getHealthProvider();
        void provider?.getAvailabilityDetail?.().then((detail) => {
          if (detail === 'needs_install' || detail === 'needs_update') {
            setNeedsInstall(true);
          }
        });
      }
      return;
    }
    void loadRef.current('open');
  }, [authorized, userId, windowDays]);

  async function attach(workout: HealthWorkout) {
    if (attachLock.current || attaching || attachingId) {
      return;
    }
    attachLock.current = true;
    try {
      if (workoutAttachBlockReason(workout, rules)) {
        return;
      }
      if (offline || !(await probeOnline())) {
        setOffline(true);
        setError(copy('health.offline'));
        return;
      }
      setAttachingId(workout.providerWorkoutId);
      setError(null);
      await onAttach(workout);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      attachLock.current = false;
      setAttachingId(null);
    }
  }

  const headerPad = underStatusBar ? Math.max(insets.top, 16) : 12;
  const needsAccess = Platform.OS !== 'web' && !authorized;

  return (
    <View className="flex-1" style={{ backgroundColor: THEME.background, minHeight: 420 }}>
      <View className="px-5 pb-2" style={{ paddingTop: headerPad }}>
        <AppText className="text-lg font-bold text-charcoal">{copy('health.sheetTitle')}</AppText>
        {challengeTitle ? (
          <AppText className="mt-1 text-sm text-muted">{challengeTitle}</AppText>
        ) : null}
        {offline ? (
          <AppText className="mt-2 text-sm text-muted">{copy('health.offline')}</AppText>
        ) : null}
        {needsAccess && Platform.OS === 'ios' ? (
          <AppText className="mt-2 text-sm" style={{ color: THEME.textMuted }}>
            {healthHowToIosPath()}
          </AppText>
        ) : null}
      </View>

      {needsInstall ? (
        <View className="flex-1 items-center justify-center px-6">
          <AppText className="text-center text-[15px] font-semibold text-charcoal">
            {copy('health.install')}
          </AppText>
          <View className="mt-5 w-full gap-3">
            {onOpenGallery ? <Button title="Gallery" size="lg" onPress={onOpenGallery} /> : null}
            <Button title="Camera" size="lg" onPress={onAddPhoto} />
            {onClose ? <Button title="Close" size="lg" variant="ghost" onPress={onClose} /> : null}
          </View>
        </View>
      ) : needsAccess ? (
        <View className="flex-1 justify-end px-5 pb-6 gap-3">
          <Button title={copy('health.allow')} size="lg" onPress={() => onAllowHealth?.()} />
          {onOpenGallery ? <Button title="Gallery" size="lg" onPress={onOpenGallery} /> : null}
          <Button title="Camera" size="lg" onPress={onAddPhoto} />
          {onClose ? <Button title="Close" size="lg" variant="ghost" onPress={onClose} /> : null}
        </View>
      ) : Platform.OS === 'web' ? (
        <View className="flex-1 justify-end px-5 pb-6 gap-3">
          <AppText className="text-center text-[15px]" style={{ color: THEME.textMuted }}>
            Add a screenshot from your gallery. blOb will read the workout time and heart rate from it.
          </AppText>
          {onOpenGallery ? <Button title="Gallery" size="lg" onPress={onOpenGallery} /> : null}
          <Button title="Camera" size="lg" variant="ghost" onPress={onAddPhoto} />
          {onClose ? <Button title="Close" size="lg" variant="ghost" onPress={onClose} /> : null}
        </View>
      ) : loading ? (
        <View className="flex-1 items-center justify-center py-10">
          <ActivityIndicator color={THEME.accent} />
        </View>
      ) : workouts.length === 0 ? (
        <View className="flex-1 items-center px-6 pt-8">
          <BlobMascot size={96} motion="float" />
          <AppText className="mt-3 text-center text-[15px] font-semibold text-charcoal">
            No workouts in Health for this window.
          </AppText>
          <View className="mt-5 w-full gap-3">
            <Button
              title="Load earlier"
              size="lg"
              variant="ghost"
              onPress={() => setWindowDays((days) => days + HEALTH_PICKER_DAYS)}
            />
            {onOpenGallery ? <Button title="Gallery" size="lg" onPress={onOpenGallery} /> : null}
            <Button title="Camera" size="lg" onPress={onAddPhoto} />
            {onClose ? <Button title="Close" size="lg" variant="ghost" onPress={onClose} /> : null}
          </View>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-8"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load('refresh')}
              tintColor={THEME.accent}
            />
          }
          showsVerticalScrollIndicator={false}>
          {workouts.map((row) => {
            const blocked = workoutAttachBlockReason(row, rules);
            const tier = sameTierWorkoutBlock(
              proofUniquenessFamily({
                frequency: challenge?.frequency ?? frequency,
                series_id: challenge?.series_id ?? seriesId,
                days_required: challenge?.days_required ?? daysRequired,
              }),
              placements.get(row.providerWorkoutId) ?? [],
            );
            // Attachable, but we could not check intensity. Reads as a hint, not a refusal.
            const note = blocked ? null : workoutAttachNote(row, rules);
            const busy = attaching || attachingId === row.providerWorkoutId;
            const when = formatWorkoutWhen({
              startedAt: row.startedAt,
              endedAt: row.endedAt,
              timeZone: challenge?.timezone ?? timezone,
            });
            return (
              <View
                key={row.providerWorkoutId}
                className="mb-3 px-4 py-3"
                style={{
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: THEME.border,
                  backgroundColor: THEME.surface,
                  ...themeShadow('card'),
                  opacity: blocked ? 0.72 : 1,
                }}>
                <AppText className="text-[15px] font-bold text-charcoal">{row.activityLabel}</AppText>
                <AppText className="mt-0.5 text-sm text-muted">
                  {[
                    Number(row.distanceM) > 0
                      ? formatDistance(Number(row.distanceM), athleteDistanceUnit())
                      : '',
                    when,
                    formatDuration(row.durationSec),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  {row.hrAvg ? ` · ${row.hrAvg} avg` : ''}
                  {` · ${healthSourceLabel(row.confidence)}`}
                  {Number(row.distanceM) > 0 ? ' · No route on this workout.' : ''}
                </AppText>
                {tier ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={tier.line}
                    onPress={() => Alert.alert(tier.line, proofAlreadyCountsCopy(tier.title))}
                    style={{ alignSelf: 'flex-start', marginTop: 6, minHeight: 28, justifyContent: 'center' }}>
                    <AppText style={{ fontSize: 12, fontWeight: '800', color: THEME.danger }}>{tier.line}</AppText>
                  </Pressable>
                ) : null}
                {blocked ? (
                  <AppText className="mt-1 text-[12px] font-semibold" style={{ color: THEME.danger }}>
                    {blocked}
                  </AppText>
                ) : note ? (
                  <AppText className="mt-1 text-[12px]" style={{ color: THEME.textMuted }}>
                    {note}
                  </AppText>
                ) : row.confidence === 'manual' ? (
                  <AppText className="mt-1 text-[12px] font-semibold" style={{ color: THEME.accent }}>
                    {copy('health.manualBadge')}
                  </AppText>
                ) : null}
                <View className="mt-3">
                  <Button
                    title={copy('health.useWorkout')}
                    size="md"
                    disabled={Boolean(blocked) || Boolean(tier) || busy}
                    loading={attachingId === row.providerWorkoutId}
                    onPress={() => void attach(row)}
                  />
                </View>
              </View>
            );
          })}
          {error ? (
            <AppText className="mt-2 text-center text-sm" style={{ color: THEME.danger }}>
              {error}
            </AppText>
          ) : null}
          <View className="mt-2 gap-3">
            <Button
              title="Load earlier"
              size="lg"
              variant="ghost"
              onPress={() => setWindowDays((days) => days + HEALTH_PICKER_DAYS)}
            />
            {onOpenGallery ? <Button title="Gallery" size="lg" variant="ghost" onPress={onOpenGallery} /> : null}
            <Button title="Camera" size="lg" variant="ghost" onPress={onAddPhoto} />
            {onClose ? <Button title="Close" size="lg" variant="ghost" onPress={onClose} /> : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

/**
 * Asks Health on a normal screen, then shows the list.
 * The system prompt cannot appear over ChromeOverlay.
 */
export function HealthWorkoutGate(
  props: Omit<HealthWorkoutPickerProps, 'authorized' | 'onAllowHealth' | 'underStatusBar'>,
) {
  const insets = useSafeAreaInsets();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      if (Platform.OS === 'web') {
        if (!cancel) setAuthorized(false);
        return;
      }
      const provider = getHealthProvider();
      if (!provider) {
        if (!cancel) setAuthorized(false);
        return;
      }
      const result = await provider.requestAccess().catch(() => 'denied' as const);
      if (!cancel) setAuthorized(result === 'connected');
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function allowAgain() {
    setAuthorized(null);
    const provider = getHealthProvider();
    const result = provider ? await provider.requestAccess().catch(() => 'denied' as const) : 'denied';
    setAuthorized(result === 'connected');
  }

  if (authorized === null && Platform.OS !== 'web') {
    return (
      <View style={{ flex: 1, backgroundColor: THEME.background, paddingTop: Math.max(insets.top, 16), paddingHorizontal: 20 }}>
        <AppText className="text-lg font-bold text-charcoal">{copy('health.sheetTitle')}</AppText>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={THEME.accent} />
        </View>
      </View>
    );
  }

  return (
    <HealthWorkoutPicker
      {...props}
      authorized={Boolean(authorized)}
      underStatusBar
      onAllowHealth={() => void allowAgain()}
    />
  );
}
