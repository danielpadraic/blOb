import { Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { useLoggableChallenges } from '@/hooks/useLoggableChallenge';
import { useOfficialCoinStatus } from '@/hooks/useOfficialCoin';
import { useLiftHistory } from '@/hooks/useLift';
import { loadStoredBodyDays, saveBodyDays } from '@/lib/dashboard/bodyStore';
import { collapseCheckinRows, durationLabel } from '@/lib/dashboard/model';
import { dashboardZone, dayInRange, rangeDayKeys, type CustomRange, type DashboardRange } from '@/lib/dashboard/range';
import {
  bodyCards,
  checkinDayMarks,
  dayBars,
  dedupeHealthSessions,
  enteredFromParts,
  mergeLiftHealthSessions,
  poundsByDay,
  syncDayLabel,
  type BodyCard,
  type DashboardSource,
  type SessionRow,
} from '@/lib/dashboard/split';
import { mergeBodyDays, type BodyDay } from '@/lib/health/bodyDays';
import { parseCheckinHealthProof } from '@/lib/health/checkinHealthProof';
import { formatWorkoutWhen } from '@/lib/health/workoutWhen';
import { formatMassLabel } from '@/lib/lift/massUnit';
import { zonedWallTime } from '@/lib/officialDays';
import { getHealthProvider } from '@/services/health';
import type { HealthWorkout } from '@/services/health/types';
import { boardQuantityProgress } from '@/lib/board/quantity';
import { usesQuantityScoring } from '@/lib/challengeExperience';
import { isOfficialCoinChallenge } from '@/lib/officialCoin';
import { OFFICIAL_COIN_TZ } from '@/lib/officialCoin';
import { supabase } from '@/lib/supabase';
import type { LiftSessionSummary } from '@/lib/lift/types';

export type DashboardChip = 'fitness' | 'challenges' | 'sleep' | 'nutrition' | 'all';
export type { DashboardSource };

export type DashboardActivity = {
  id: string;
  title: string;
  when: string;
  proof: string;
  sources: DashboardSource[];
  href: string | null;
};

export type DashboardChallengeBar = {
  id: string;
  title: string;
  line: string;
  progress: number;
};

export type DashboardDayBar = {
  key: string;
  label: string;
  value: number;
};

export type FitnessDashboardModel = {
  liftBars: DashboardDayBar[];
  liftVolumeLabel: string | null;
  liftSessionCount: number;
  checkinBars: DashboardDayBar[];
  checkinLabel: string | null;
  cardioBars: DashboardDayBar[];
  cardioLabel: string | null;
  mileBars: DashboardDayBar[];
  mileLabel: string | null;
  stepBars: DashboardDayBar[];
  stepLabel: string | null;
  bodyCards: BodyCard[];
  syncedLabel: string | null;
  challenges: DashboardChallengeBar[];
  activities: DashboardActivity[];
  trophies: string[];
  earnedLabel: string | null;
};

const EMPTY: FitnessDashboardModel = {
  liftBars: [],
  liftVolumeLabel: null,
  liftSessionCount: 0,
  checkinBars: [],
  checkinLabel: null,
  cardioBars: [],
  cardioLabel: null,
  mileBars: [],
  mileLabel: null,
  stepBars: [],
  stepLabel: null,
  bodyCards: [],
  syncedLabel: null,
  challenges: [],
  activities: [],
  trophies: [],
  earnedLabel: null,
};

function weekdayLabel(day: string, timeZone: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date).slice(0, 1);
  } catch {
    return '';
  }
}

function sourceOf(healthSource: string | null | undefined): DashboardSource {
  if (healthSource === 'healthkit') {
    return 'healthkit';
  }
  if (healthSource === 'health_connect') {
    return 'health_connect';
  }
  return 'checkin';
}

export function sourceChipLabel(source: DashboardSource): string {
  if (source === 'healthkit') {
    return 'HealthKit';
  }
  if (source === 'health_connect') {
    return 'Health Connect';
  }
  if (source === 'lift') {
    return 'Lift';
  }
  return 'Check-in';
}

function buildModel(input: {
  range: DashboardRange;
  custom: CustomRange | null;
  now: Date;
  lifts: LiftSessionSummary[];
  checkins: Array<{
    id: string;
    challenge_id: string;
    period_key: string;
    proof_parts: unknown;
  }>;
  workouts: HealthWorkout[];
  bodyDays: BodyDay[];
  syncedAt: string | null;
  showSyncLabel: boolean;
  challenges: DashboardChallengeBar[];
  trophies: string[];
  earnedLabel: string | null;
}): FitnessDashboardModel {
  const zone = dashboardZone(null);
  const keys = rangeDayKeys(input.range, input.now, zone, input.custom);
  const label = (day: string) => (zone ? weekdayLabel(day, zone) : '');

  const lifts = input.lifts.filter((row) => {
    if (row.status === 'open' || !row.completedAt) {
      return false;
    }
    const day = zone ? dateDay(row.completedAt, zone) : '';
    return dayInRange(day, keys);
  });

  let volume = 0;
  let volumeUnit: LiftSessionSummary['unit'] = 'lb';
  let cardioSec = 0;
  const cardio = new Map<string, number>();
  const liftPounds: { day: string; pounds: number }[] = [];
  const sessions: SessionRow[] = [];
  for (const row of lifts) {
    volumeUnit = row.unit;
    const day = zone ? dateDay(row.completedAt ?? row.performedAt, zone) : '';
    const moved = Math.max(Number(row.weightMoved) || 0, 0);
    if (moved > 0 && day) {
      volume += moved;
      liftPounds.push({ day, pounds: moved });
    }
    const seconds = Math.max(Number(row.durationSeconds) || 0, 0);
    if (seconds > 0 && day) {
      cardioSec += seconds;
      cardio.set(day, (cardio.get(day) ?? 0) + seconds);
    }
    const start = row.performedAt;
    const end =
      row.completedAt ||
      (seconds > 0 ? new Date(Date.parse(start) + seconds * 1000).toISOString() : '');
    if (!start || !end) {
      continue;
    }
    sessions.push({
      id: `lift-${row.id}`,
      title: row.title,
      start,
      end,
      day,
      sources: ['lift'],
      distanceMeters: null,
      pounds: moved,
      href: `/lift/${row.id}`,
    });
  }

  const miles = new Map<string, number>();
  const steps = new Map<string, number>();
  const checkinDays: string[] = [];
  for (const row of collapseCheckinRows(input.checkins)) {
    if (!dayInRange(row.period_key, keys)) {
      continue;
    }
    checkinDays.push(row.period_key);
    const entered = enteredFromParts(row.proof_parts);
    if (entered.miles > 0) {
      miles.set(row.period_key, (miles.get(row.period_key) ?? 0) + entered.miles);
    }
    if (entered.steps > 0) {
      steps.set(row.period_key, (steps.get(row.period_key) ?? 0) + entered.steps);
    }
    const health = healthFromParts(row.proof_parts);
    const vendor = health?.source === 'healthkit' || health?.source === 'health_connect';
    if (vendor && health?.startedAt) {
      const end =
        health.endedAt ||
        (Number(health.durationSec) > 0
          ? new Date(Date.parse(health.startedAt) + Number(health.durationSec) * 1000).toISOString()
          : '');
      if (end) {
        sessions.push({
          id: `checkin-${row.id}`,
          title: health.activityType || 'Workout',
          start: health.startedAt,
          end,
          day: row.period_key,
          sources: [sourceOf(health.source)],
          distanceMeters: Number(health.distanceMeters) > 0 ? Number(health.distanceMeters) : null,
          pounds: 0,
          href: `/challenges/${row.challenge_id}`,
        });
      }
    } else {
      sessions.push({
        id: `checkin-${row.id}`,
        title: 'Check-in',
        start: '',
        end: '',
        day: row.period_key,
        sources: ['checkin'],
        distanceMeters: entered.miles > 0 ? entered.miles * 1609.344 : null,
        pounds: 0,
        href: `/challenges/${row.challenge_id}`,
      });
    }
  }

  for (const workout of input.workouts) {
    const day = zone ? dateDay(workout.endedAt || workout.startedAt, zone) : '';
    if (!dayInRange(day, keys) || !workout.startedAt || !workout.endedAt) {
      continue;
    }
    sessions.push({
      id: `health-${workout.providerWorkoutId}`,
      title: workout.activityLabel || 'Workout',
      start: workout.startedAt,
      end: workout.endedAt,
      day,
      sources: [workout.source === 'health_connect' ? 'health_connect' : 'healthkit'],
      distanceMeters: Number(workout.distanceM) > 0 ? Number(workout.distanceM) : null,
      pounds: 0,
      href: null,
    });
  }

  const merged = mergeLiftHealthSessions(dedupeHealthSessions(sessions));
  const activities: DashboardActivity[] = merged.map((row) => {
    const when =
      row.start && row.end
        ? formatWorkoutWhen({ startedAt: row.start, endedAt: row.end, timeZone: zone })
        : calendarDayLabel(row.day);
    const proof = [
      row.pounds > 0 ? formatMassLabel(row.pounds, volumeUnit, Math.round(row.pounds).toLocaleString('en-US')) : '',
      row.distanceMeters && row.distanceMeters > 0 ? `${(row.distanceMeters / 1609.344).toFixed(2)} mi` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      id: row.id,
      title: row.title,
      when,
      proof,
      sources: row.sources,
      href: row.href,
    };
  });
  activities.sort((a, b) => (a.when < b.when ? 1 : -1));

  const mileTotal = [...miles.values()].reduce((sum, value) => sum + value, 0);
  const stepTotal = [...steps.values()].reduce((sum, value) => sum + value, 0);
  const checkinCount = checkinDayMarks(checkinDays).size;
  const cards = bodyCards(input.bodyDays, keys, label);

  return {
    liftBars: dayBars(keys, poundsByDay(liftPounds), label),
    liftVolumeLabel: volume > 0 ? formatMassLabel(volume, volumeUnit, Math.round(volume).toLocaleString('en-US')) : null,
    liftSessionCount: lifts.length,
    checkinBars: dayBars(keys, checkinDayMarks(checkinDays), label),
    checkinLabel: checkinCount > 0 ? `${checkinCount} ${checkinCount === 1 ? 'day' : 'days'}` : null,
    cardioBars: dayBars(keys, cardio, label),
    cardioLabel: cardioSec > 0 ? durationLabel(cardioSec) : null,
    mileBars: dayBars(keys, miles, label),
    mileLabel: mileTotal > 0 ? `${Math.round(mileTotal * 10) / 10} mi` : null,
    stepBars: dayBars(keys, steps, label),
    stepLabel: stepTotal > 0 ? Math.round(stepTotal).toLocaleString('en-US') : null,
    bodyCards: cards,
    syncedLabel: input.showSyncLabel ? syncDayLabel(input.syncedAt, zone) : null,
    challenges: input.challenges,
    activities: activities.slice(0, 24),
    trophies: input.trophies,
    earnedLabel: input.earnedLabel,
  };
}

function calendarDayLabel(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) {
    return '';
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function dateDay(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return rangeDayKeys('today', date, timeZone)[0] ?? '';
}

function healthFromParts(parts: unknown) {
  if (!parts || typeof parts !== 'object') {
    return null;
  }
  for (const value of Object.values(parts as Record<string, unknown>)) {
    const health = parseCheckinHealthProof(
      value && typeof value === 'object' ? (value as { health?: unknown }).health : null,
    );
    if (health) {
      return health;
    }
  }
  return null;
}

export function useFitnessDashboard(range: DashboardRange, custom: CustomRange | null) {
  const { user } = useAuth();
  const lifts = useLiftHistory();
  const coin = useOfficialCoinStatus();
  const loggable = useLoggableChallenges();
  const extra = useQuery({
    queryKey: ['fitness-dashboard', user?.id, range, custom?.start ?? '', custom?.end ?? ''],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const userId = user?.id ?? '';
      const zone = dashboardZone(null) || OFFICIAL_COIN_TZ;
      const keys = rangeDayKeys(range, new Date(), zone, custom);
      const start = keys[0] ?? '';
      const [checkins, badges, names, ledger, progress, workouts, body] = await Promise.all([
        supabase
          .from('challenge_checkins')
          .select('id, challenge_id, period_key, proof_parts')
          .eq('user_id', userId)
          .gte('period_key', start)
          .order('period_key', { ascending: false })
          .limit(400),
        supabase.from('user_badges').select('badge_key').eq('user_id', userId),
        supabase.from('badges').select('key, name'),
        supabase
          .from('wallet_ledger')
          .select('amount, currency, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(80),
        supabase
          .from('challenge_participants')
          .select('challenge_id, distance_meters_total')
          .eq('user_id', userId),
        start
          ? supabase
              .from('health_workouts')
              .select('provider_workout_id, provider, activity_label, started_at, ended_at, distance_m')
              .eq('user_id', userId)
              .gte('started_at', `${start}T00:00:00.000Z`)
              .order('started_at', { ascending: false })
              .limit(200)
          : Promise.resolve({ data: [], error: null }),
        start ? loadStoredBodyDays(userId, start, keys[keys.length - 1] ?? start) : Promise.resolve({ days: [], syncedAt: null }),
      ]);
      const trophyNames = new Map(
        ((names.data ?? []) as Array<{ key?: string; name?: string }>).map((row) => [
          String(row.key ?? ''),
          String(row.name ?? '').trim(),
        ]),
      );
      const trophies = ((badges.data ?? []) as Array<{ badge_key?: string }>)
        .map((row) => trophyNames.get(String(row.badge_key ?? '')) ?? '')
        .filter(Boolean);
      const ledgerRows = ((ledger.data ?? []) as Array<{ amount?: number; currency?: string; created_at?: string }>).filter(
        (row) => {
          const created = String(row.created_at ?? '');
          const day = dateDay(created, zone);
          return dayInRange(day, keys) && Number(row.amount) !== 0;
        },
      );
      const bucks = ledgerRows
        .filter((row) => row.currency === 'bucks')
        .reduce((sum, row) => sum + Number(row.amount), 0);
      const coins = ledgerRows
        .filter((row) => row.currency !== 'bucks')
        .reduce((sum, row) => sum + Number(row.amount), 0);
      const earnedBits = [
        bucks !== 0 ? `$${Math.abs(bucks).toFixed(2)}` : '',
        coins !== 0 ? `${Math.round(coins)} coins` : '',
      ].filter(Boolean);
      const distanceByChallenge = new Map<string, number>();
      for (const row of (progress.data ?? []) as Array<{ challenge_id?: string; distance_meters_total?: number | null }>) {
        const id = String(row.challenge_id ?? '');
        if (id) {
          distanceByChallenge.set(id, Number(row.distance_meters_total) || 0);
        }
      }
      let bodyDays = body.days;
      let syncedAt = body.syncedAt;
      const live: HealthWorkout[] = [];
      const chartZone = dashboardZone(null);
      if (chartZone && start) {
        const from = zonedWallTime(start, 0, 0, 0, 0, chartZone);
        const to = zonedWallTime(keys[keys.length - 1] ?? start, 23, 59, 59, 0, chartZone);
        const provider = getHealthProvider();
        if (provider) {
          try {
            const status = await provider.getAuthStatus();
            if (status !== 'denied') {
              live.push(...(await provider.fetchWorkouts({ from, to })));
              const fresh = await provider.fetchBodyDays?.({ from, to, timeZone: chartZone });
              if (fresh && fresh.length > 0) {
                const kind = Platform.OS === 'android' ? 'health_connect' : 'apple_health';
                const wrote = await saveBodyDays(userId, kind, fresh);
                bodyDays = mergeBodyDays(bodyDays, fresh);
                if (wrote) {
                  syncedAt = wrote;
                }
              }
            }
          } catch {
            // A health read that fails still leaves Lift and check-ins on the dashboard.
          }
        }
      }
      const storedWorkouts = ((workouts.data ?? []) as Array<{
        provider_workout_id?: string;
        provider?: string;
        activity_label?: string;
        started_at?: string;
        ended_at?: string;
        distance_m?: number | null;
      }>)
        .map((row) => {
          const startedAt = String(row.started_at ?? '');
          const endedAt = String(row.ended_at ?? '');
          if (!startedAt || !endedAt) {
            return null;
          }
          const workout: HealthWorkout = {
            providerWorkoutId: String(row.provider_workout_id ?? `${startedAt}-${endedAt}`),
            source: row.provider === 'health_connect' ? 'health_connect' : 'apple_health',
            activityType: 'other',
            activityLabel: String(row.activity_label ?? 'Workout'),
            startedAt,
            endedAt,
            durationSec: Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000)),
            distanceM: Number(row.distance_m) > 0 ? Number(row.distance_m) : undefined,
            confidence: 'unknown',
          };
          return workout;
        })
        .filter((row): row is HealthWorkout => Boolean(row));
      return {
        checkins: (checkins.data ?? []) as Array<{
          id: string;
          challenge_id: string;
          period_key: string;
          proof_parts: unknown;
        }>,
        workouts: [...storedWorkouts, ...live],
        bodyDays,
        syncedAt,
        distanceByChallenge,
        trophies,
        earnedLabel: ledgerRows.length > 0 && earnedBits.length > 0 ? earnedBits.join(' · ') : null,
      };
    },
  });

  const challenges: DashboardChallengeBar[] = [];
  if (coin.status.weekly?.joined && coin.status.weekly.daysLogged > 0) {
    challenges.push({
      id: coin.status.weekly.challenge.id,
      title: 'Weekly Fitness Challenge',
      line: `${coin.status.weekly.daysLogged} of ${coin.status.weekly.allowedDays}`,
      progress: coin.status.weekly.allowedDays
        ? coin.status.weekly.daysLogged / coin.status.weekly.allowedDays
        : 0,
    });
  }
  if (coin.status.monthly?.joined && coin.status.monthly.daysLogged > 0) {
    challenges.push({
      id: coin.status.monthly.challenge.id,
      title: 'Monthly Fitness Challenge',
      line: `${coin.status.monthly.daysLogged} of ${coin.status.monthly.allowedDays}`,
      progress: coin.status.monthly.allowedDays
        ? coin.status.monthly.daysLogged / coin.status.monthly.allowedDays
        : 0,
    });
  }
  for (const row of loggable.data ?? []) {
    if (isOfficialCoinChallenge(row)) {
      continue;
    }
    const meters = extra.data?.distanceByChallenge.get(row.id) ?? 0;
    if (usesQuantityScoring(row)) {
      const quantity = boardQuantityProgress(row, { distanceMeters: meters });
      if (quantity && (quantity.unit === 'mi' || quantity.unit === 'km')) {
        if (quantity.logged > 0) {
          challenges.push({
            id: row.id,
            title: row.title,
            line: quantity.label,
            progress: quantity.target > 0 ? Math.min(quantity.logged / quantity.target, 1) : 1,
          });
        }
        continue;
      }
    }
    const days = Number(row.daysCompleted ?? 0);
    const required = Number(row.days_required ?? 0);
    if (days <= 0) {
      continue;
    }
    challenges.push({
      id: row.id,
      title: row.title,
      line: required > 0 ? `${days} of ${required}` : `${days} days`,
      progress: required > 0 ? Math.min(days / required, 1) : 1,
    });
  }

  const model = extra.data
    ? buildModel({
        range,
        custom,
        now: new Date(),
        lifts: lifts.data ?? [],
        checkins: extra.data.checkins,
        workouts: extra.data.workouts,
        bodyDays: extra.data.bodyDays,
        syncedAt: extra.data.syncedAt,
        showSyncLabel: Platform.OS === 'web',
        challenges,
        trophies: extra.data.trophies,
        earnedLabel: extra.data.earnedLabel,
      })
    : { ...EMPTY, challenges };

  return {
    model,
    loading: lifts.isLoading || extra.isLoading || coin.isLoading,
  };
}
