import { format } from 'date-fns';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { copy } from '@/lib/copy';
import {
  healthAttachRulesFor,
  workoutAttachBlockReason,
  type HealthAttachRules,
} from '@/lib/health/attachProof';
import { rankHealthWorkouts } from '@/lib/health/match';
import { challengeHealthWindow } from '@/lib/health/period';
import { healthSourceLabel } from '@/lib/health/proofSummary';
import { fetchUsedProviderWorkoutIds, probeOnline, upsertHealthConnection } from '@/lib/health/remote';
import { THEME, themeShadow } from '@/lib/theme';
import type { ChallengeProof } from '@/lib/challengeProofs';
import { getHealthProvider, type HealthWorkout } from '@/services/health';
import { getErrorMessage } from '@/utils/errors';

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
  onAddPhoto: () => void;
  onClose?: () => void;
};

function formatDuration(sec: number): string {
  const minutes = Math.max(1, Math.round(sec / 60));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return format(date, 'h:mm a');
}

function formatRange(startedAt: string, endedAt: string): string {
  const start = formatTime(startedAt);
  const end = formatTime(endedAt);
  if (start && end) {
    return `${start}–${end}`;
  }
  return start || end;
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
  onClose,
}: HealthWorkoutPickerProps) {
  const [workouts, setWorkouts] = useState<HealthWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [denied, setDenied] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachingId, setAttachingId] = useState<string | null>(null);

  const rules: HealthAttachRules = healthAttachRulesFor(proof, {
    min_minutes: challenge?.min_minutes ?? minMinutes,
  });

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
        const period = challengeHealthWindow({
          frequency: challenge?.frequency ?? frequency,
          starts_at: challenge?.starts_at ?? startsAt,
          is_official: challenge?.is_official ?? isOfficial,
          series_id: challenge?.series_id ?? seriesId,
          timezone: challenge?.timezone ?? timezone,
          days_required: challenge?.days_required ?? daysRequired,
          day_windows: challenge?.day_windows ?? dayWindows,
        });
        const [rows, used] = await Promise.all([
          getHealthProvider()?.fetchWorkouts(period) ?? Promise.resolve([]),
          userId ? fetchUsedProviderWorkoutIds(userId) : Promise.resolve(new Set<string>()),
        ]);
        setWorkouts(rankHealthWorkouts(rows, { period, minMinutes: rules.minMinutes, usedIds: used }));
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
    ],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    setDenied(false);
    setNeedsInstall(false);
    setError(null);
    setAttachingId(null);
    setLoading(true);
    let cancelled = false;
    void (async () => {
      const provider = getHealthProvider();
      if (!provider) {
        setDenied(true);
        setLoading(false);
        return;
      }
      const status = await provider.getAuthStatus();
      if (cancelled) {
        return;
      }
      if (status === 'denied') {
        setDenied(true);
        setLoading(false);
        return;
      }
      if (status !== 'connected') {
        const result = await provider.requestAccess();
        if (cancelled) {
          return;
        }
        if (result === 'denied') {
          setDenied(true);
          setLoading(false);
          return;
        }
        if (result === 'unavailable') {
          const detail = await provider.getAvailabilityDetail?.();
          if (detail === 'needs_install' || detail === 'needs_update') {
            setNeedsInstall(true);
            setLoading(false);
            return;
          }
          setDenied(true);
          setLoading(false);
          return;
        }
        if (userId) {
          await upsertHealthConnection({ userId, status: 'connected' });
        }
      }
      if (!cancelled) {
        await loadRef.current('open');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function attach(workout: HealthWorkout) {
    if (attaching || attachingId) {
      return;
    }
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
    try {
      await onAttach(workout);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setAttachingId(null);
    }
  }

  return (
    <View className="flex-1" style={{ backgroundColor: THEME.background }}>
      <View className="px-5 pt-3 pb-2">
        <AppText className="text-lg font-bold text-charcoal">{copy('health.sheetTitle')}</AppText>
        {challengeTitle ? (
          <AppText className="mt-1 text-sm text-muted">{challengeTitle}</AppText>
        ) : null}
        {offline ? (
          <AppText className="mt-2 text-sm text-muted">{copy('health.offline')}</AppText>
        ) : null}
        {denied ? (
          <AppText className="mt-2 text-sm text-muted">{copy('health.permissionDenied')}</AppText>
        ) : null}
      </View>

      {needsInstall ? (
        <View className="flex-1 items-center justify-center px-6">
          <AppText className="text-center text-[15px] font-semibold text-charcoal">
            {copy('health.install')}
          </AppText>
          <View className="mt-5 w-full gap-3">
            <Button title={copy('health.addPhoto')} size="lg" onPress={onAddPhoto} />
            {onClose ? <Button title="Close" size="lg" variant="ghost" onPress={onClose} /> : null}
          </View>
        </View>
      ) : denied ? (
        <View className="flex-1 justify-end px-5 pb-6">
          <Button title={copy('health.addPhoto')} size="lg" onPress={onAddPhoto} />
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
            {copy('health.empty')}
          </AppText>
          <View className="mt-5 w-full gap-3">
            <Button title={copy('health.addPhoto')} size="lg" onPress={onAddPhoto} />
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
            const busy = attaching || attachingId === row.providerWorkoutId;
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
                  {formatRange(row.startedAt, row.endedAt)}
                  {` · ${formatDuration(row.durationSec)}`}
                  {row.hrAvg ? ` · ${row.hrAvg} avg` : ''}
                  {` · ${healthSourceLabel(row.confidence)}`}
                </AppText>
                {blocked ? (
                  <AppText className="mt-1 text-[12px] font-semibold" style={{ color: THEME.danger }}>
                    {blocked}
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
                    disabled={Boolean(blocked) || busy}
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
            <Button title={copy('health.addPhoto')} size="lg" variant="ghost" onPress={onAddPhoto} />
            {onClose ? <Button title="Close" size="lg" variant="ghost" onPress={onClose} /> : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
