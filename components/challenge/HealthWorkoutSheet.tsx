import { format } from 'date-fns';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { copy } from '@/lib/copy';
import { rankHealthWorkouts } from '@/lib/health/match';
import { challengeHealthWindow, meetsMinMinutes } from '@/lib/health/period';
import { fetchUsedProviderWorkoutIds, probeOnline, upsertHealthConnection } from '@/lib/health/remote';
import { THEME, themeShadow } from '@/lib/theme';
import { getHealthProvider, type HealthWorkout } from '@/services/health';
import { getErrorMessage } from '@/utils/errors';

type HealthWorkoutSheetProps = {
  visible: boolean;
  challengeId: string;
  challengeTitle: string;
  minMinutes?: number | null;
  frequency?: string | null;
  startsAt?: string | null;
  userId?: string;
  attaching?: boolean;
  onClose: () => void;
  onDenied: () => void;
  onAttach: (workout: HealthWorkout) => Promise<void>;
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

export function HealthWorkoutSheet({
  visible,
  challengeTitle,
  minMinutes,
  frequency,
  startsAt,
  userId,
  attaching = false,
  onClose,
  onDenied,
  onAttach,
}: HealthWorkoutSheetProps) {
  const [workouts, setWorkouts] = useState<HealthWorkout[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<HealthWorkout | null>(null);
  const onDeniedRef = useRef(onDenied);
  onDeniedRef.current = onDenied;

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
        const period = challengeHealthWindow({ frequency, starts_at: startsAt });
        const [rows, used] = await Promise.all([
          getHealthProvider()?.fetchWorkouts(period) ?? Promise.resolve([]),
          userId ? fetchUsedProviderWorkoutIds(userId) : Promise.resolve(new Set<string>()),
        ]);
        setWorkouts(rankHealthWorkouts(rows, { period, minMinutes, usedIds: used }));
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
    [frequency, minMinutes, startsAt, userId],
  );

  useEffect(() => {
    if (!visible) {
      setPicked(null);
      setError(null);
      setNeedsInstall(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    void (async () => {
      const provider = getHealthProvider();
      if (!provider) {
        onDeniedRef.current();
        return;
      }
      const status = await provider.getAuthStatus();
      if (cancelled) {
        return;
      }
      if (status !== 'connected') {
        const result = await provider.requestAccess();
        if (cancelled) {
          return;
        }
        if (result === 'denied') {
          onDeniedRef.current();
          return;
        }
        if (result === 'unavailable') {
          const detail = await provider.getAvailabilityDetail?.();
          if (detail === 'needs_install' || detail === 'needs_update') {
            setNeedsInstall(true);
            setLoading(false);
            return;
          }
          onDeniedRef.current();
          return;
        }
        if (userId) {
          await upsertHealthConnection({ userId, status: 'connected' });
        }
      }
      if (!cancelled) {
        await load('open');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, userId, visible]);

  async function confirm() {
    if (!picked || attaching) {
      return;
    }
    if (offline || !(await probeOnline())) {
      setOffline(true);
      setError(copy('health.offline'));
      return;
    }
    try {
      await onAttach(picked);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }

  return (
    <ChromeOverlay visible={visible} onClose={onClose} align="end">
      <View
        className="px-5 pt-4"
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingBottom: 20,
          maxHeight: '100%',
          ...themeShadow('card'),
        }}>
        <View className="mb-3 items-center">
          <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
          <AppText className="mt-3 text-lg font-bold text-charcoal">{copy('health.sheetTitle')}</AppText>
        </View>

        {offline ? (
          <AppText className="mb-3 text-center text-sm text-muted">{copy('health.offline')}</AppText>
        ) : null}

        {needsInstall ? (
          <View className="items-center px-2 py-4">
            <AppText className="text-center text-[15px] font-semibold text-charcoal">
              {copy('health.install')}
            </AppText>
            <View className="mt-5 w-full gap-3">
              <Button
                title={copy('health.installSubtitle')}
                size="lg"
                onPress={() => {
                  void getHealthProvider()?.requestAccess();
                }}
              />
              <Button title="Use the camera" size="lg" variant="ghost" onPress={onClose} />
            </View>
          </View>
        ) : picked ? (
          <View>
            <AppText className="text-center text-[15px] font-semibold text-charcoal">
              {copy('health.confirm', 'neutral', { title: challengeTitle })}
            </AppText>
            <AppText className="mt-2 text-center text-sm text-muted">
              {picked.activityLabel} · {formatDuration(picked.durationSec)} · {formatTime(picked.startedAt)}
            </AppText>
            {error ? (
              <AppText className="mt-3 text-center text-sm" style={{ color: THEME.danger }}>
                {error}
              </AppText>
            ) : null}
            <View className="mt-5 gap-3">
              <Button title="Attach" size="lg" loading={attaching} disabled={attaching} onPress={() => void confirm()} />
              <Button
                title="Back"
                size="lg"
                variant="ghost"
                disabled={attaching}
                onPress={() => {
                  setPicked(null);
                  setError(null);
                }}
              />
            </View>
          </View>
        ) : loading ? (
          <View className="items-center py-10">
            <ActivityIndicator color={THEME.accent} />
          </View>
        ) : workouts.length === 0 ? (
          <View className="items-center px-2 py-4">
            <BlobMascot size={96} motion="float" />
            <AppText className="mt-3 text-center text-[15px] font-semibold text-charcoal">
              {copy('health.empty')}
            </AppText>
            <View className="mt-5 w-full">
              <Button title="Use the camera" size="lg" onPress={onClose} />
            </View>
          </View>
        ) : (
          <ScrollView
            style={{ maxHeight: 420 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void load('refresh')}
                tintColor={THEME.accent}
              />
            }
            showsVerticalScrollIndicator={false}>
            {workouts.map((row) => {
              const short = !meetsMinMinutes(row.durationSec, minMinutes);
              return (
                <Pressable
                  key={row.providerWorkoutId}
                  accessibilityRole="button"
                  accessibilityLabel={row.activityLabel}
                  onPress={() => {
                    setError(null);
                    setPicked(row);
                  }}
                  className="mb-2 px-4 py-3"
                  style={{
                    minHeight: 44,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: THEME.border,
                    backgroundColor: THEME.surface,
                    opacity: short ? 0.55 : 1,
                  }}>
                  <AppText className="text-[15px] font-bold text-charcoal">{row.activityLabel}</AppText>
                  <AppText className="mt-0.5 text-sm text-muted">
                    {formatDuration(row.durationSec)}
                    {formatTime(row.startedAt) ? ` · ${formatTime(row.startedAt)}` : ''}
                    {row.hrAvg ? ` · ${row.hrAvg} avg` : ''}
                  </AppText>
                  {row.confidence === 'manual' ? (
                    <AppText className="mt-1 text-[12px] font-semibold" style={{ color: THEME.accent }}>
                      {copy('health.manualBadge')}
                    </AppText>
                  ) : null}
                </Pressable>
              );
            })}
            {error ? (
              <AppText className="mt-2 text-center text-sm" style={{ color: THEME.danger }}>
                {error}
              </AppText>
            ) : null}
          </ScrollView>
        )}
      </View>
    </ChromeOverlay>
  );
}
