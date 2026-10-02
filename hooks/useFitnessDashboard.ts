import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { useLoggableChallenges } from '@/hooks/useLoggableChallenge';
import { useOfficialCoinStatus } from '@/hooks/useOfficialCoin';
import { useLiftHistory } from '@/hooks/useLift';
import { collapseCheckinRows, durationLabel } from '@/lib/dashboard/model';
import { dashboardZone, dayInRange, rangeDayKeys, type CustomRange, type DashboardRange } from '@/lib/dashboard/range';
import { parseCheckinHealthProof } from '@/lib/health/checkinHealthProof';
import { formatCompletedDay } from '@/lib/health/workoutWhen';
import { formatMassLabel } from '@/lib/lift/massUnit';
import { boardQuantityProgress } from '@/lib/board/quantity';
import { usesQuantityScoring } from '@/lib/challengeExperience';
import { isOfficialCoinChallenge } from '@/lib/officialCoin';
import { OFFICIAL_COIN_TZ } from '@/lib/officialCoin';
import { supabase } from '@/lib/supabase';
import type { LiftSessionSummary } from '@/lib/lift/types';

export type DashboardChip = 'fitness' | 'challenges' | 'sleep' | 'nutrition' | 'all';
export type DashboardSource = 'healthkit' | 'health_connect' | 'lift' | 'checkin';

export type DashboardActivity = {
  id: string;
  title: string;
  when: string;
  proof: string;
  source: DashboardSource;
  href: string;
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
  minuteBars: DashboardDayBar[];
  cardioBars: DashboardDayBar[];
  cardioLabel: string | null;
  calorieLabel: string | null;
  stepLabel: string | null;
  challenges: DashboardChallengeBar[];
  activities: DashboardActivity[];
  trophies: string[];
  earnedLabel: string | null;
};

const EMPTY: FitnessDashboardModel = {
  liftBars: [],
  liftVolumeLabel: null,
  liftSessionCount: 0,
  minuteBars: [],
  cardioBars: [],
  cardioLabel: null,
  calorieLabel: null,
  stepLabel: null,
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
    calories: number;
    steps: number;
  }>;
  challenges: DashboardChallengeBar[];
  trophies: string[];
  earnedLabel: string | null;
}): FitnessDashboardModel {
  const zone = dashboardZone(null);
  const keys = rangeDayKeys(input.range, input.now, zone, input.custom);
  const pounds = new Map<string, number>();
  const minutes = new Map<string, number>();
  const cardio = new Map<string, number>();
  let calories = 0;
  let steps = 0;

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
  const activities: DashboardActivity[] = [];
  for (const row of lifts) {
    volumeUnit = row.unit;
    const day = zone ? dateDay(row.completedAt ?? row.performedAt, zone) : '';
    const moved = Math.max(Number(row.weightMoved) || 0, 0);
    if (moved > 0) {
      volume += moved;
      if (day) {
        pounds.set(day, (pounds.get(day) ?? 0) + moved);
      }
    }
    const seconds = Math.max(Number(row.durationSeconds) || 0, 0);
    if (seconds > 0) {
      cardioSec += seconds;
      if (day) {
        cardio.set(day, (cardio.get(day) ?? 0) + seconds);
        minutes.set(day, (minutes.get(day) ?? 0) + Math.round(seconds / 60));
      }
    }
    const when = formatCompletedDay(row.completedAt, zone);
    const proof = moved > 0 ? formatMassLabel(moved, row.unit, Math.round(moved).toLocaleString('en-US')) : '';
    activities.push({
      id: `lift-${row.id}`,
      title: row.title,
      when,
      proof,
      source: 'lift',
      href: `/lift/${row.id}`,
    });
  }

  for (const row of collapseCheckinRows(input.checkins)) {
    if (!dayInRange(row.period_key, keys)) {
      continue;
    }
    const health = healthFromParts(row.proof_parts);
    const seconds = Number(health?.durationSec ?? 0);
    if (seconds > 0 && !minutes.has(row.period_key)) {
      minutes.set(row.period_key, Math.round(seconds / 60));
    }
    if (row.calories > 0) {
      calories += row.calories;
    }
    if (row.steps > 0) {
      steps += row.steps;
    }
    const proofBits = [
      seconds > 0 ? durationLabel(seconds) : '',
      Number(health?.distanceMeters) > 0 ? `${(Number(health?.distanceMeters) / 1609.34).toFixed(2)} mi` : '',
      health?.avgHrBpm ? `${Math.round(health.avgHrBpm)} bpm` : '',
    ].filter(Boolean);
    activities.push({
      id: `checkin-${row.id}`,
      title: health?.activityType ? health.activityType : 'Check-in',
      when: stampLabel(row.period_key),
      proof: proofBits.join(' · '),
      source: sourceOf(health?.source),
      href: `/challenges/${row.challenge_id}`,
    });
  }

  const bars = (values: Map<string, number>) => {
    const series = keys.map((key) => ({
      key,
      label: weekdayLabel(key, zone),
      value: values.get(key) ?? 0,
    }));
    return series.some((day) => day.value > 0) ? series : [];
  };

  activities.sort((a, b) => (a.when < b.when ? 1 : -1));

  return {
    liftBars: bars(pounds),
    liftVolumeLabel: volume > 0 ? formatMassLabel(volume, volumeUnit, Math.round(volume).toLocaleString('en-US')) : null,
    liftSessionCount: lifts.length,
    minuteBars: bars(minutes),
    cardioBars: bars(cardio),
    cardioLabel: cardioSec > 0 ? durationLabel(cardioSec) : null,
    calorieLabel: calories > 0 ? `${Math.round(calories)} cal` : null,
    stepLabel: steps > 0 ? Math.round(steps).toLocaleString('en-US') : null,
    challenges: input.challenges,
    activities: activities.slice(0, 8),
    trophies: input.trophies,
    earnedLabel: input.earnedLabel,
  };
}

function stampLabel(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) {
    return '';
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
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

function stepsFromParts(parts: unknown): number {
  if (!parts || typeof parts !== 'object') {
    return 0;
  }
  let total = 0;
  for (const value of Object.values(parts as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const part = value as { method?: string; text?: string; health?: { steps?: number; stepCount?: number } };
    if (part.method === 'steps') {
      const typed = Number(String(part.text ?? '').replace(/,/g, ''));
      if (typed > 0) {
        total += typed;
      }
    }
    const stored = Number(part.health?.steps ?? part.health?.stepCount ?? 0);
    if (stored > 0) {
      total += stored;
    }
  }
  return total;
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
      const [checkins, posts, badges, names, ledger, progress] = await Promise.all([
        supabase
          .from('challenge_checkins')
          .select('id, challenge_id, period_key, proof_parts')
          .eq('user_id', userId)
          .gte('period_key', start)
          .order('period_key', { ascending: false })
          .limit(400),
        supabase
          .from('posts')
          .select('checkin_id, checkin_stats')
          .eq('author_id', userId)
          .not('checkin_id', 'is', null)
          .order('created_at', { ascending: false })
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
      const caloriesByCheckin = new Map<string, number>();
      for (const post of (posts.data ?? []) as Array<{ checkin_id?: string | null; checkin_stats?: { active_cal?: number; total_cal?: number } | null }>) {
        const id = String(post.checkin_id ?? '');
        const stats = post.checkin_stats;
        const cal = Number(stats?.active_cal ?? stats?.total_cal ?? 0);
        if (id && cal > 0) {
          caloriesByCheckin.set(id, cal);
        }
      }
      const distanceByChallenge = new Map<string, number>();
      for (const row of (progress.data ?? []) as Array<{ challenge_id?: string; distance_meters_total?: number | null }>) {
        const id = String(row.challenge_id ?? '');
        if (id) {
          distanceByChallenge.set(id, Number(row.distance_meters_total) || 0);
        }
      }
      return {
        checkins: ((checkins.data ?? []) as Array<{
          id: string;
          challenge_id: string;
          period_key: string;
          proof_parts: unknown;
        }>).map((row) => ({
          ...row,
          calories: caloriesByCheckin.get(row.id) ?? 0,
          steps: stepsFromParts(row.proof_parts),
        })),
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
