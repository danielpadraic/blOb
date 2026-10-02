import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { useLoggableChallenges } from '@/hooks/useLoggableChallenge';
import { useOfficialCoinStatus } from '@/hooks/useOfficialCoin';
import { useLiftHistory } from '@/hooks/useLift';
import { dashboardZone, dayInRange, rangeDayKeys, type DashboardRange } from '@/lib/dashboard/range';
import { parseCheckinHealthProof } from '@/lib/health/checkinHealthProof';
import { formatCompletedDay } from '@/lib/health/workoutWhen';
import { formatHealthDuration } from '@/lib/health/durationChip';
import { formatMassLabel } from '@/lib/lift/massUnit';
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
  minutes: number;
};

export type FitnessDashboardModel = {
  liftVolumeLabel: string | null;
  liftSessionCount: number;
  cardioLabel: string | null;
  checkinCount: number;
  days: DashboardDayBar[];
  challenges: DashboardChallengeBar[];
  activities: DashboardActivity[];
  trophies: string[];
  earnedLabel: string | null;
};

const EMPTY: FitnessDashboardModel = {
  liftVolumeLabel: null,
  liftSessionCount: 0,
  cardioLabel: null,
  checkinCount: 0,
  days: [],
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
  now: Date;
  lifts: LiftSessionSummary[];
  checkins: Array<{
    id: string;
    challenge_id: string;
    period_key: string;
    proof_parts: unknown;
  }>;
  challenges: DashboardChallengeBar[];
  trophies: string[];
  earnedLabel: string | null;
}): FitnessDashboardModel {
  const zone = dashboardZone(null);
  const keys = rangeDayKeys(input.range, input.now, zone);
  const keySet = new Set(keys);
  const minutesByDay = new Map<string, number>();

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
    if ((row.weightMoved ?? 0) > 0) {
      volume += row.weightMoved ?? 0;
    }
    if ((row.durationSeconds ?? 0) > 0) {
      cardioSec += row.durationSeconds ?? 0;
      const day = zone ? dateDay(row.completedAt ?? row.performedAt, zone) : '';
      if (day && keySet.has(day)) {
        minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + Math.round((row.durationSeconds ?? 0) / 60));
      }
    }
    const when = formatCompletedDay(row.completedAt, zone);
    const proof = (row.weightMoved ?? 0) > 0 ? formatMassLabel(row.weightMoved ?? 0, row.unit, String(row.weightMoved)) : '';
    activities.push({
      id: `lift-${row.id}`,
      title: row.title,
      when,
      proof,
      source: 'lift',
      href: `/lift/${row.id}`,
    });
  }
  const liftSessionCount = lifts.length;

  let checkinCount = 0;
  for (const row of input.checkins) {
    if (!dayInRange(row.period_key, keys)) {
      continue;
    }
    checkinCount += 1;
    const health = healthFromParts(row.proof_parts);
    const seconds = Number(health?.durationSec ?? 0);
    if (seconds > 0 && !minutesByDay.has(row.period_key)) {
      minutesByDay.set(row.period_key, Math.round(seconds / 60));
    }
    const bits = [
      seconds > 0 ? formatHealthDuration(seconds) : '',
      health?.avgHrBpm ? `${Math.round(health.avgHrBpm)} bpm` : '',
    ].filter(Boolean);
    activities.push({
      id: `checkin-${row.id}`,
      title: 'Check-in',
      when: stampLabel(row.period_key),
      proof: bits.join(' · '),
      source: sourceOf(health?.source),
      href: `/challenges/${row.challenge_id}`,
    });
  }

  const days = keys
    .map((key) => ({
      key,
      label: weekdayLabel(key, zone),
      minutes: minutesByDay.get(key) ?? 0,
    }))
    .filter((day) => day.minutes > 0);

  activities.sort((a, b) => (a.when < b.when ? 1 : -1));

  return {
    liftVolumeLabel: volume > 0 ? formatMassLabel(volume, volumeUnit, volume.toLocaleString('en-US')) : null,
    liftSessionCount,
    cardioLabel: cardioSec > 0 ? formatHealthDuration(cardioSec) : null,
    checkinCount,
    days,
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

export function useFitnessDashboard(range: DashboardRange) {
  const { user } = useAuth();
  const lifts = useLiftHistory();
  const coin = useOfficialCoinStatus();
  const loggable = useLoggableChallenges();
  const extra = useQuery({
    queryKey: ['fitness-dashboard', user?.id, range],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const userId = user?.id ?? '';
      const zone = dashboardZone(null) || OFFICIAL_COIN_TZ;
      const keys = rangeDayKeys(range, new Date(), zone);
      const start = keys[0] ?? '';
      const [checkins, badges, names, ledger] = await Promise.all([
        supabase
          .from('challenge_checkins')
          .select('id, challenge_id, period_key, proof_parts')
          .eq('user_id', userId)
          .gte('period_key', start)
          .order('period_key', { ascending: false })
          .limit(80),
        supabase.from('user_badges').select('badge_key').eq('user_id', userId),
        supabase.from('badges').select('key, name'),
        supabase
          .from('wallet_ledger')
          .select('amount, currency, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(40),
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
      return {
        checkins: (checkins.data ?? []) as Array<{
          id: string;
          challenge_id: string;
          period_key: string;
          proof_parts: unknown;
        }>,
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
